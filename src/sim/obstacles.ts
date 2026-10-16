/**
 * Obstacle mask for the fluid solver + CPU circle list for ball collision.
 *
 * Each frame the loop rebuilds the list of solid circles (static goal posts +
 * any raised player walls) and calls build(), which stamps them into a
 * single-channel mask texture (MAX-blended) that the divergence/pressure/
 * gradient passes read as boundary conditions. The same circle list is used
 * CPU-side for deterministic ball collisions.
 */
import { Blitter, FBO, GLContext, Program, createFBO, programFrom } from '../render/gl';
import { BASE_VERT, OBSTACLE_CIRCLE_FRAG } from '../render/shaders';

export interface Circle {
  x: number; // uv
  y: number; // uv
  r: number; // uv
}

export class Obstacles {
  readonly mask: FBO;
  circles: Circle[] = [];
  private gl: WebGL2RenderingContext;
  private blitter: Blitter;
  private prog: Program;
  private aspect: number;

  constructor(ctx: GLContext, width: number, height: number) {
    this.gl = ctx.gl;
    this.aspect = width / height;
    this.blitter = new Blitter(this.gl);
    this.mask = createFBO(this.gl, width, height, ctx.rt.r, this.gl.RED, ctx.rt.type, this.gl.LINEAR);
    this.prog = programFrom(this.gl, BASE_VERT, OBSTACLE_CIRCLE_FRAG);
  }

  /** stamp the current circle list into the mask (call once/frame before step). */
  build() {
    const gl = this.gl;
    // clear to empty
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mask.fbo);
    gl.viewport(0, 0, this.mask.width, this.mask.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.circles.length === 0) return;

    // accumulate circles with MAX blending so overlaps stay solid (=1)
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.prog.bind();
    gl.uniform2f(this.prog.uniforms.texelSize, this.mask.texelX, this.mask.texelY);
    gl.uniform1f(this.prog.uniforms.aspectRatio, this.aspect);
    for (const c of this.circles) {
      gl.uniform2f(this.prog.uniforms.point, c.x, c.y);
      gl.uniform1f(this.prog.uniforms.radius, c.r);
      this.blitter.blit(this.mask);
    }
    gl.disable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
  }
}
