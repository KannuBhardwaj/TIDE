/**
 * GLSL ES 3.00 shaders for the stable-fluids solver and the Aurora water
 * display pass. The solver passes follow the well-established GPU stable-fluids
 * formulation (semi-Lagrangian advection, Jacobi pressure, vorticity
 * confinement). MacCormack/BFECC advection is a planned M6 upgrade — see PLAN.md.
 */

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
`;

/** Base vertex shader: computes centered UV + 4 neighbor UVs for stencils. */
export const BASE_VERT = `${HEADER}
layout(location=0) in vec2 aPos;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const ADVECTION_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;      // velocity field texel
uniform float dt;
uniform float dissipation;
out vec4 frag;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  frag = result / decay;
}`;

export const DIVERGENCE_FRAG = `${HEADER}
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 frag;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  frag = vec4(div, 0.0, 0.0, 1.0);
}`;

export const CURL_FRAG = `${HEADER}
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 frag;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  frag = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

export const VORTICITY_FRAG = `${HEADER}
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
out vec4 frag;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel += force * dt;
  vel = clamp(vel, -1000.0, 1000.0);
  frag = vec4(vel, 0.0, 1.0);
}`;

export const PRESSURE_FRAG = `${HEADER}
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 frag;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  frag = vec4(pressure, 0.0, 0.0, 1.0);
}`;

export const GRADIENT_SUBTRACT_FRAG = `${HEADER}
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 frag;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity -= vec2(R - L, T - B);
  frag = vec4(velocity, 0.0, 1.0);
}`;

export const COPY_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 frag;
void main() {
  frag = texture(uTexture, vUv);
}`;

export const CLEAR_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 frag;
void main() {
  frag = value * texture(uTexture, vUv);
}`;

/** Gaussian splat for force (into velocity) or dye (into dye field). */
export const SPLAT_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 frag;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  frag = vec4(base + splat, 1.0);
}`;

/**
 * Aurora water display pass (M1 look; M6 adds caustics/refraction/foam).
 * Combines: deep base gradient, bioluminescent dye glow (teal core, rose on
 * fast water), a velocity-driven sheen, the pearl ball with motion stretch,
 * and a soft vignette.
 */
export const WATER_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform float aspectRatio;
uniform float glow;
uniform float time;
uniform vec3 cDeep;
uniform vec3 cAbyss;
uniform vec3 cTeal;
uniform vec3 cRose;
uniform vec3 cPearl;
uniform vec2 uBallPos;
uniform float uBallRadius;
uniform vec2 uBallVel;
out vec4 frag;

// cheap value-noise for subtle floor shimmer
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= aspectRatio;

  // --- deep-ocean base: radial gradient + slow god-ray shimmer ---
  float r = length(p * vec2(0.8, 1.0));
  vec3 base = mix(cDeep, cAbyss, smoothstep(0.1, 1.3, r));
  float rays = noise(uv * vec2(3.0, 12.0) + vec2(time * 0.03, 0.0));
  base += cTeal * 0.015 * rays;

  // --- dye / bioluminescence ---
  float dye = texture(uDye, uv).r; // we store intensity in all channels
  vec3 dyeC = texture(uDye, uv).rgb;
  float d = max(max(dyeC.r, dyeC.g), dyeC.b);
  float speed = length(texture(uVelocity, uv).xy);

  // teal core transitioning to rose on fast-moving water
  vec3 lumin = mix(cTeal, cRose, clamp(speed * 0.12, 0.0, 1.0));
  vec3 color = base;
  color += lumin * d * (0.9 + 0.8 * glow);
  // bright crest / foam hint where dye is dense & moving
  color += cPearl * smoothstep(0.55, 1.1, d) * clamp(speed * 0.08, 0.0, 0.6);

  // --- the ball: pearl orb with rim + motion stretch ---
  vec2 bp = (uBallPos * 2.0 - 1.0);
  bp.x *= aspectRatio;
  vec2 bd = p - bp;
  // stretch opposite velocity for a comet feel
  vec2 vel = uBallVel;
  vel.x *= aspectRatio;
  float vl = length(vel);
  if (vl > 0.0001) {
    vec2 dir = vel / vl;
    float along = dot(bd, dir);
    bd -= dir * clamp(along, 0.0, vl * 0.25) * 0.6;
  }
  float bdist = length(bd);
  float br = uBallRadius * aspectRatio;
  float orb = smoothstep(br, br * 0.75, bdist);
  float rim = smoothstep(br, br * 0.9, bdist) - smoothstep(br * 0.9, br * 0.55, bdist);
  // glow halo
  float halo = exp(-bdist / (br * 1.6)) * 0.5;
  vec3 ballCol = mix(cPearl * 0.6, cPearl, orb);
  color = mix(color, ballCol, orb);
  color += cPearl * max(rim, 0.0) * 0.8;
  color += cTeal * halo * (0.4 + d);

  // --- vignette + subtle tone ---
  float vig = smoothstep(1.7, 0.4, r);
  color *= 0.35 + 0.65 * vig;
  color = color / (color + vec3(0.9)); // reinhard-ish tonemap
  color = pow(color, vec3(0.9));

  frag = vec4(color, 1.0);
}`;

/** Debug view: velocity (RG), pressure, dye, or raw. mode via uniform. */
export const DEBUG_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTex;
uniform int mode; // 0 vel, 1 pressure, 2 dye, 3 curl
out vec4 frag;
void main() {
  vec4 t = texture(uTex, vUv);
  if (mode == 0) {
    frag = vec4(0.5 + t.xy * 0.08, 0.5, 1.0); // velocity vector as color
  } else if (mode == 1) {
    float p = t.x;
    frag = vec4(max(p, 0.0) * 0.6, 0.0, max(-p, 0.0) * 0.6, 1.0);
  } else if (mode == 3) {
    float c = t.x;
    frag = vec4(max(c, 0.0), 0.0, max(-c, 0.0), 1.0);
  } else {
    frag = vec4(t.rgb, 1.0); // dye
  }
}`;
