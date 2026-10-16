/**
 * GPU stable-fluids solver. Owns the velocity / dye / pressure fields and runs
 * the per-step passes. Rendering of the water look lives in the game loop; this
 * module only produces the physical fields (plus the coarse CPU mirror the ball
 * physics reads).
 */
import {
  Blitter,
  DoubleFBO,
  FBO,
  GLContext,
  Program,
  createDoubleFBO,
  createFBO,
  programFrom,
} from '../render/gl';
import {
  ADVECTION_FRAG,
  BASE_VERT,
  CLEAR_FRAG,
  CURL_FRAG,
  DIVERGENCE_FRAG,
  GRADIENT_SUBTRACT_FRAG,
  PRESSURE_FRAG,
  SPLAT_FRAG,
  VORTICITY_FRAG,
} from '../render/shaders';
import { config } from '../game/config';
import { CoarseField } from './coarseField';

export class FluidSolver {
  readonly velocity: DoubleFBO;
  readonly dye: DoubleFBO;
  private pressure: DoubleFBO;
  private divergence: FBO;
  private curl: FBO;
  readonly coarse: CoarseField;

  /** debug accessors (judge-facing debug view). */
  get pressureField(): FBO {
    return this.pressure.read;
  }
  get curlField(): FBO {
    return this.curl;
  }

  private gl: WebGL2RenderingContext;
  private blitter: Blitter;

  private pAdvect: Program;
  private pDivergence: Program;
  private pCurl: Program;
  private pVorticity: Program;
  private pPressure: Program;
  private pGradient: Program;
  private pClear: Program;
  private pSplat: Program;

  readonly simRes: number;
  readonly dyeRes: number;
  readonly aspect: number;

  constructor(ctx: GLContext, width: number, height: number) {
    this.gl = ctx.gl;
    const gl = this.gl;
    this.blitter = new Blitter(gl);
    this.aspect = width / height;

    const filter = gl.LINEAR;
    const sim = resolution(config.sim.simResolution, this.aspect);
    const dye = resolution(config.sim.dyeResolution, this.aspect);
    this.simRes = config.sim.simResolution;
    this.dyeRes = config.sim.dyeResolution;

    const { internalFormat, rg, r, type } = ctx.rt;
    this.velocity = createDoubleFBO(gl, sim.w, sim.h, rg, gl.RG, type, filter);
    this.dye = createDoubleFBO(gl, dye.w, dye.h, internalFormat, gl.RGBA, type, filter);
    this.pressure = createDoubleFBO(gl, sim.w, sim.h, r, gl.RED, type, gl.NEAREST);
    this.divergence = createFBO(gl, sim.w, sim.h, r, gl.RED, type, gl.NEAREST);
    this.curl = createFBO(gl, sim.w, sim.h, r, gl.RED, type, gl.NEAREST);

    this.pAdvect = programFrom(gl, BASE_VERT, ADVECTION_FRAG);
    this.pDivergence = programFrom(gl, BASE_VERT, DIVERGENCE_FRAG);
    this.pCurl = programFrom(gl, BASE_VERT, CURL_FRAG);
    this.pVorticity = programFrom(gl, BASE_VERT, VORTICITY_FRAG);
    this.pPressure = programFrom(gl, BASE_VERT, PRESSURE_FRAG);
    this.pGradient = programFrom(gl, BASE_VERT, GRADIENT_SUBTRACT_FRAG);
    this.pClear = programFrom(gl, BASE_VERT, CLEAR_FRAG);
    this.pSplat = programFrom(gl, BASE_VERT, SPLAT_FRAG);

    this.coarse = new CoarseField(gl, this.blitter, 64);
  }

  private setTexel(p: Program, field: { texelX: number; texelY: number }) {
    this.gl.uniform2f(p.uniforms.texelSize, field.texelX, field.texelY);
  }

  step(dt: number) {
    const gl = this.gl;
    const vel = this.velocity;
    gl.disable(gl.BLEND);

    // curl
    this.pCurl.bind();
    this.setTexel(this.pCurl, vel);
    gl.uniform1i(this.pCurl.uniforms.uVelocity, vel.read.attach(0));
    this.blitter.blit(this.curl);

    // vorticity confinement
    this.pVorticity.bind();
    this.setTexel(this.pVorticity, vel);
    gl.uniform1i(this.pVorticity.uniforms.uVelocity, vel.read.attach(0));
    gl.uniform1i(this.pVorticity.uniforms.uCurl, this.curl.attach(1));
    gl.uniform1f(this.pVorticity.uniforms.curl, config.sim.curl);
    gl.uniform1f(this.pVorticity.uniforms.dt, dt);
    this.blitter.blit(vel.write);
    vel.swap();

    // divergence
    this.pDivergence.bind();
    this.setTexel(this.pDivergence, vel);
    gl.uniform1i(this.pDivergence.uniforms.uVelocity, vel.read.attach(0));
    this.blitter.blit(this.divergence);

    // decay pressure, then Jacobi iterations
    this.pClear.bind();
    this.setTexel(this.pClear, this.pressure);
    gl.uniform1i(this.pClear.uniforms.uTexture, this.pressure.read.attach(0));
    gl.uniform1f(this.pClear.uniforms.value, config.sim.pressure);
    this.blitter.blit(this.pressure.write);
    this.pressure.swap();

    this.pPressure.bind();
    this.setTexel(this.pPressure, this.pressure);
    gl.uniform1i(this.pPressure.uniforms.uDivergence, this.divergence.attach(0));
    const iters = config.sim.pressureIterations;
    for (let i = 0; i < iters; i++) {
      gl.uniform1i(this.pPressure.uniforms.uPressure, this.pressure.read.attach(1));
      this.blitter.blit(this.pressure.write);
      this.pressure.swap();
    }

    // subtract pressure gradient
    this.pGradient.bind();
    this.setTexel(this.pGradient, vel);
    gl.uniform1i(this.pGradient.uniforms.uPressure, this.pressure.read.attach(0));
    gl.uniform1i(this.pGradient.uniforms.uVelocity, vel.read.attach(1));
    this.blitter.blit(vel.write);
    vel.swap();

    // advect velocity
    this.pAdvect.bind();
    this.setTexel(this.pAdvect, vel);
    gl.uniform1i(this.pAdvect.uniforms.uVelocity, vel.read.attach(0));
    gl.uniform1i(this.pAdvect.uniforms.uSource, vel.read.attach(0));
    gl.uniform1f(this.pAdvect.uniforms.dt, dt);
    gl.uniform1f(this.pAdvect.uniforms.dissipation, config.sim.velocityDissipation);
    this.blitter.blit(vel.write);
    vel.swap();

    // advect dye (sampled at dye res, displaced by the velocity grid)
    this.pAdvect.bind();
    this.setTexel(this.pAdvect, vel);
    gl.uniform1i(this.pAdvect.uniforms.uVelocity, vel.read.attach(0));
    gl.uniform1i(this.pAdvect.uniforms.uSource, this.dye.read.attach(1));
    gl.uniform1f(this.pAdvect.uniforms.dt, dt);
    gl.uniform1f(this.pAdvect.uniforms.dissipation, config.sim.dyeDissipation);
    this.blitter.blit(this.dye.write);
    this.dye.swap();

    // refresh the CPU coarse field for ball physics
    this.coarse.update(vel.read);
  }

  /** Inject a velocity impulse. (x,y,dx,dy) in UV (0..1, y up). */
  splatVelocity(x: number, y: number, dx: number, dy: number, radius: number) {
    const gl = this.gl;
    this.pSplat.bind();
    this.setTexel(this.pSplat, this.velocity);
    gl.uniform1i(this.pSplat.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform1f(this.pSplat.uniforms.aspectRatio, this.aspect);
    gl.uniform2f(this.pSplat.uniforms.point, x, y);
    gl.uniform3f(this.pSplat.uniforms.color, dx, dy, 0);
    gl.uniform1f(this.pSplat.uniforms.radius, radius / 100);
    this.blitter.blit(this.velocity.write);
    this.velocity.swap();
  }

  /** Inject dye (color in 0..1). */
  splatDye(x: number, y: number, r: number, g: number, b: number, radius: number) {
    const gl = this.gl;
    this.pSplat.bind();
    this.setTexel(this.pSplat, this.dye);
    gl.uniform1i(this.pSplat.uniforms.uTarget, this.dye.read.attach(0));
    gl.uniform1f(this.pSplat.uniforms.aspectRatio, this.aspect);
    gl.uniform2f(this.pSplat.uniforms.point, x, y);
    gl.uniform3f(this.pSplat.uniforms.color, r, g, b);
    gl.uniform1f(this.pSplat.uniforms.radius, radius / 100);
    this.blitter.blit(this.dye.write);
    this.dye.swap();
  }
}

function resolution(res: number, aspect: number): { w: number; h: number } {
  const min = res;
  if (aspect >= 1) {
    return { w: Math.round(min * aspect), h: min };
  }
  return { w: min, h: Math.round(min / aspect) };
}
