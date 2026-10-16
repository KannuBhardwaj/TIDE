/**
 * Post-processing chain: render the water scene into an offscreen target, then
 * composite it with multi-pass bloom, chromatic aberration, a goal shockwave
 * (UV ring distortion + flash), camera shake, film grain and vignette.
 */
import { Blitter, FBO, GLContext, Program, createFBO, programFrom } from './gl';
import { BASE_VERT, BLUR_FRAG, COMPOSITE_FRAG, THRESHOLD_FRAG } from './shaders';

export interface PostParams {
  shakeX: number;
  shakeY: number;
  bloom: number;
  ca: number;
  grain: number;
  time: number;
  shockX: number;
  shockY: number;
  shockProgress: number; // >= 1 => inactive
  shockStr: number;
}

export class Post {
  scene!: FBO;
  private bloomA!: FBO;
  private bloomB!: FBO;
  private thresh!: FBO;
  private gl: WebGL2RenderingContext;
  private ctx: GLContext;
  private blitter: Blitter;
  private aspect = 1;
  private pThresh: Program;
  private pBlur: Program;
  private pComposite: Program;
  private bloomScale = 0.5;

  constructor(ctx: GLContext, blitter: Blitter, w: number, h: number) {
    this.ctx = ctx;
    this.gl = ctx.gl;
    this.blitter = blitter;
    this.pThresh = programFrom(this.gl, BASE_VERT, THRESHOLD_FRAG);
    this.pBlur = programFrom(this.gl, BASE_VERT, BLUR_FRAG);
    this.pComposite = programFrom(this.gl, BASE_VERT, COMPOSITE_FRAG);
    this.resize(w, h);
  }

  resize(w: number, h: number) {
    const gl = this.gl;
    const { internalFormat, type } = this.ctx.rt;
    this.aspect = w / h;
    const bw = Math.max(1, Math.floor(w * this.bloomScale));
    const bh = Math.max(1, Math.floor(h * this.bloomScale));
    this.scene = createFBO(gl, w, h, internalFormat, gl.RGBA, type, gl.LINEAR);
    this.thresh = createFBO(gl, bw, bh, internalFormat, gl.RGBA, type, gl.LINEAR);
    this.bloomA = createFBO(gl, bw, bh, internalFormat, gl.RGBA, type, gl.LINEAR);
    this.bloomB = createFBO(gl, bw, bh, internalFormat, gl.RGBA, type, gl.LINEAR);
  }

  /** composite scene (already rendered into `this.scene`) to the screen. */
  render(p: PostParams) {
    const gl = this.gl;

    // bright pass -> half-res
    this.pThresh.bind();
    gl.uniform2f(this.pThresh.uniforms.texelSize, this.thresh.texelX, this.thresh.texelY);
    gl.uniform1i(this.pThresh.uniforms.uTex, this.scene.attach(0));
    gl.uniform1f(this.pThresh.uniforms.uThreshold, 0.65);
    this.blitter.blit(this.thresh);

    // separable blur ping-pong
    let read = this.thresh;
    const spread = 1.1;
    for (let i = 0; i < 3; i++) {
      this.pBlur.bind();
      gl.uniform2f(this.pBlur.uniforms.texelSize, read.texelX, read.texelY);
      gl.uniform1i(this.pBlur.uniforms.uTex, read.attach(0));
      gl.uniform2f(this.pBlur.uniforms.uDir, (spread / this.bloomA.width), 0);
      this.blitter.blit(this.bloomB);
      this.pBlur.bind();
      gl.uniform1i(this.pBlur.uniforms.uTex, this.bloomB.attach(0));
      gl.uniform2f(this.pBlur.uniforms.uDir, 0, spread / this.bloomA.height);
      this.blitter.blit(this.bloomA);
      read = this.bloomA;
    }

    // composite to screen
    this.pComposite.bind();
    gl.uniform2f(this.pComposite.uniforms.texelSize, this.scene.texelX, this.scene.texelY);
    gl.uniform1i(this.pComposite.uniforms.uScene, this.scene.attach(0));
    gl.uniform1i(this.pComposite.uniforms.uBloom, read.attach(1));
    gl.uniform2f(this.pComposite.uniforms.uShake, p.shakeX, p.shakeY);
    gl.uniform1f(this.pComposite.uniforms.uBloomStr, p.bloom);
    gl.uniform1f(this.pComposite.uniforms.uCA, p.ca);
    gl.uniform1f(this.pComposite.uniforms.uGrain, p.grain);
    gl.uniform1f(this.pComposite.uniforms.uTime, p.time);
    gl.uniform1f(this.pComposite.uniforms.aspectRatio, this.aspect);
    gl.uniform2f(this.pComposite.uniforms.uShockCenter, p.shockX, p.shockY);
    gl.uniform1f(this.pComposite.uniforms.uShockProgress, p.shockProgress);
    gl.uniform1f(this.pComposite.uniforms.uShockStr, p.shockStr);
    this.blitter.blit(null);
  }
}
