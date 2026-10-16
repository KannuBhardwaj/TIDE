/**
 * Thin WebGL2 helper layer. No framework — just enough to run the fluid
 * solver and render passes with ping-pong float render targets.
 */

export interface GLContext {
  gl: WebGL2RenderingContext;
  /** chosen render-target formats (float preferred, half-float fallback). */
  rt: {
    internalFormat: number; // RGBA16F / RGBA32F ...
    rg: number; // RG16F / RG32F (velocity)
    r: number; // R16F / R32F (pressure/divergence/curl)
    type: number; // FLOAT / HALF_FLOAT
    linearFilter: boolean; // can we LINEAR-filter float textures?
  };
  /** true if we fell back to half-float. */
  halfFloat: boolean;
}

export function createGLContext(canvas: HTMLCanvasElement): GLContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is required for TIDE (no context).');

  const colorFloat = gl.getExtension('EXT_color_buffer_float');
  const colorHalf = gl.getExtension('EXT_color_buffer_half_float');
  const linear = gl.getExtension('OES_texture_float_linear');

  let type: number;
  let internalFormat: number;
  let rg: number;
  let r: number;
  let halfFloat: boolean;

  if (colorFloat) {
    type = gl.FLOAT;
    internalFormat = gl.RGBA16F; // 16F is plenty and faster than 32F
    rg = gl.RG16F;
    r = gl.R16F;
    halfFloat = true; // storage is 16F; type FLOAT upload path still valid
  } else if (colorHalf) {
    type = gl.HALF_FLOAT;
    internalFormat = gl.RGBA16F;
    rg = gl.RG16F;
    r = gl.R16F;
    halfFloat = true;
  } else {
    throw new Error('Float render targets unavailable — cannot run the fluid solver.');
  }

  // For 16F render targets the type we SAMPLE/UPLOAD with is HALF_FLOAT.
  // EXT_color_buffer_float lets us *render* to them; sampling still needs
  // the matching texImage type. We standardize on HALF_FLOAT storage.
  type = gl.HALF_FLOAT;

  return {
    gl,
    rt: {
      internalFormat,
      rg,
      r,
      type,
      linearFilter: !!linear,
    },
    halfFloat,
  };
}

export function compileShader(
  gl: WebGL2RenderingContext,
  kind: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(kind)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}\n---\n${withLineNumbers(source)}`);
  }
  return shader;
}

function withLineNumbers(src: string): string {
  return src
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(3, ' ')}| ${l}`)
    .join('\n');
}

export class Program {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null> = {};
  private gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext, vert: WebGLShader, frag: WebGLShader) {
    this.gl = gl;
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vert);
    gl.attachShader(this.program, frag);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Program link error:\n${gl.getProgramInfoLog(this.program)}`);
    }
    const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(this.program, i)!;
      const name = info.name.replace('[0]', '');
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }

  bind() {
    this.gl.useProgram(this.program);
  }
}

export function programFrom(gl: WebGL2RenderingContext, vert: string, frag: string): Program {
  return new Program(
    gl,
    compileShader(gl, gl.VERTEX_SHADER, vert),
    compileShader(gl, gl.FRAGMENT_SHADER, frag),
  );
}

export interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  /** texel size (1/w, 1/h). */
  texelX: number;
  texelY: number;
  attach(unit: number): number;
}

export function createFBO(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  filter: number,
): FBO {
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return {
    texture,
    fbo,
    width: w,
    height: h,
    texelX: 1 / w,
    texelY: 1 / h,
    attach(unit: number) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    },
  };
}

export interface DoubleFBO {
  read: FBO;
  write: FBO;
  width: number;
  height: number;
  texelX: number;
  texelY: number;
  swap(): void;
}

export function createDoubleFBO(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  filter: number,
): DoubleFBO {
  let fbo1 = createFBO(gl, w, h, internalFormat, format, type, filter);
  let fbo2 = createFBO(gl, w, h, internalFormat, format, type, filter);
  return {
    width: w,
    height: h,
    texelX: 1 / w,
    texelY: 1 / h,
    get read() {
      return fbo1;
    },
    set read(v: FBO) {
      fbo1 = v;
    },
    get write() {
      return fbo2;
    },
    set write(v: FBO) {
      fbo2 = v;
    },
    swap() {
      const tmp = fbo1;
      fbo1 = fbo2;
      fbo2 = tmp;
    },
  };
}

/** Fullscreen triangle/quad blitter. */
export class Blitter {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // fullscreen quad as two triangles
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** draw a fullscreen quad into `target` (null = default framebuffer). */
  blit(target: FBO | null) {
    const gl = this.gl;
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
}
