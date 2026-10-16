/**
 * Coarse CPU-side mirror of the GPU velocity field, used by the ball physics.
 *
 * Every frame we render the (low-res) velocity texture into a small RGBA32F
 * target and read it back once with readPixels. A tiny downsample keeps the
 * GPU->CPU transfer cheap, and bilinear sampling on the CPU gives the ball a
 * smooth, deterministic drag force without stalling the render pipeline on a
 * full-resolution readback. See PLAN.md §4.
 */
import { Blitter, FBO, Program, createFBO, programFrom } from '../render/gl';
import { BASE_VERT, COPY_FRAG } from '../render/shaders';

export class CoarseField {
  readonly size: number;
  private gl: WebGL2RenderingContext;
  private target: FBO;
  private copy: Program;
  private blitter: Blitter;
  private data: Float32Array;
  private valid = false;

  constructor(gl: WebGL2RenderingContext, blitter: Blitter, size = 64) {
    this.gl = gl;
    this.blitter = blitter;
    this.size = size;
    // RGBA32F so readPixels(..., FLOAT) works with EXT_color_buffer_float.
    this.target = createFBO(gl, size, size, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.copy = programFrom(gl, BASE_VERT, COPY_FRAG);
    this.data = new Float32Array(size * size * 4);
  }

  /** Downsample `velocityTexture` and read it back to CPU. Call once/frame. */
  update(velocity: FBO) {
    const gl = this.gl;
    this.copy.bind();
    gl.uniform2f(this.copy.uniforms.texelSize, 1 / this.size, 1 / this.size);
    gl.uniform1i(this.copy.uniforms.uTexture, velocity.attach(0));
    this.blitter.blit(this.target);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, this.data);
    this.valid = true;
  }

  /** Bilinear sample of the velocity field at UV (0..1, y up). */
  sample(u: number, v: number, out: { x: number; y: number }) {
    if (!this.valid) {
      out.x = 0;
      out.y = 0;
      return;
    }
    const n = this.size;
    const fx = Math.min(Math.max(u, 0), 1) * (n - 1);
    const fy = Math.min(Math.max(v, 0), 1) * (n - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, n - 1);
    const y1 = Math.min(y0 + 1, n - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const idx = (x: number, y: number) => (y * n + x) * 4;
    const d = this.data;
    const vx =
      lerp(lerp(d[idx(x0, y0)], d[idx(x1, y0)], tx), lerp(d[idx(x0, y1)], d[idx(x1, y1)], tx), ty);
    const vy =
      lerp(
        lerp(d[idx(x0, y0) + 1], d[idx(x1, y0) + 1], tx),
        lerp(d[idx(x0, y1) + 1], d[idx(x1, y1) + 1], tx),
        ty,
      );
    out.x = vx;
    out.y = vy;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
