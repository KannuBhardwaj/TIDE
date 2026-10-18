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
uniform sampler2D uObstacle;
out vec4 frag;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  // arena edges: no-penetration
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  // internal solid obstacles: no flow across the boundary
  if (texture(uObstacle, vL).x > 0.5) { L = -C.x; }
  if (texture(uObstacle, vR).x > 0.5) { R = -C.x; }
  if (texture(uObstacle, vT).x > 0.5) { T = -C.y; }
  if (texture(uObstacle, vB).x > 0.5) { B = -C.y; }
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
uniform sampler2D uObstacle;
out vec4 frag;
void main() {
  float C = texture(uPressure, vUv).x;
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  // Neumann at solids: a solid neighbor reflects the center pressure
  if (texture(uObstacle, vL).x > 0.5) { L = C; }
  if (texture(uObstacle, vR).x > 0.5) { R = C; }
  if (texture(uObstacle, vT).x > 0.5) { T = C; }
  if (texture(uObstacle, vB).x > 0.5) { B = C; }
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
uniform sampler2D uObstacle;
out vec4 frag;
void main() {
  // velocity inside a solid is zero (no-slip interior)
  if (texture(uObstacle, vUv).x > 0.5) {
    frag = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float C = texture(uPressure, vUv).x;
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  if (texture(uObstacle, vL).x > 0.5) { L = C; }
  if (texture(uObstacle, vR).x > 0.5) { R = C; }
  if (texture(uObstacle, vT).x > 0.5) { T = C; }
  if (texture(uObstacle, vB).x > 0.5) { B = C; }
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
 * Radial force splat: pushes water outward (strength > 0) or pulls it inward
 * (strength < 0) within a soft-falloff radius around `point`. Used by the
 * PUSH and PINCH abilities — only water inside the radius is affected.
 */
export const RADIAL_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTarget;
uniform vec2 point;
uniform float radius;   // variance-like (R*R)
uniform float strength; // + outward (push), - inward (pinch)
uniform float aspectRatio;
out vec4 frag;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  float dist = length(p);
  float fall = exp(-dist * dist / radius);
  vec2 dir = dist > 1e-4 ? p / dist : vec2(0.0);
  vec2 add = dir * strength * fall;
  vec2 base = texture(uTarget, vUv).xy;
  frag = vec4(base + add, 0.0, 1.0);
}`;

/** Stamp a filled circle into the obstacle mask (use with MAX blending). */
export const OBSTACLE_CIRCLE_FRAG = `${HEADER}
in vec2 vUv;
uniform vec2 point;
uniform float radius; // uv (aspect-corrected on x)
uniform float aspectRatio;
out vec4 frag;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  float c = 1.0 - smoothstep(radius * 0.86, radius, length(p));
  frag = vec4(c, 0.0, 0.0, 1.0);
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
// teams, players, walls
uniform vec3 cTeamA;
uniform vec3 cTeamB;
uniform vec2 uPlayerPos[2];
uniform float uPlayerActive[2]; // 1 if in play
uniform float uPlayerWall[2];   // wall radius (uv), 0 if no wall
uniform float uPlayerEnergy[2];
uniform float uPlayerRadius;
// goals
uniform float uGoalInset;
uniform float uGoalHalf;
uniform float uPostRadius;
uniform float uGoalFlashA;
uniform float uGoalFlashB;
uniform float uLipWidth;      // half-width of the goal-line lip (uv)
uniform float uLipBrightness;
uniform float uAuraFalloff;   // aura e-fold distance into the field (uv)
uniform float uAuraStrength;
uniform float uBeatPulse;     // extra brightness at a full beat
uniform float uGoalBuild;     // extra brightness at full crescendo
uniform float uGoalFlashGain; // extra brightness on a score
// crescendo
uniform float uEdgeGlow;   // 0..1 intensity
uniform float uBeat;       // 0..1 beat pulse
uniform vec3 uEdgeColor;   // rose-gold accent
// goal shatter shards
uniform vec2 uShardPos[20];
uniform float uShardSize[20];
uniform int uShardCount;
out vec4 frag;

// cheap value-noise for subtle floor shimmer
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}

// isotropic (screen-correct) space mapping + circle helpers
vec2 uvToP(vec2 q){ return vec2((q.x * 2.0 - 1.0) * aspectRatio, q.y * 2.0 - 1.0); }
float discFill(vec2 pp, vec2 c, float rp){ return smoothstep(rp, rp * 0.78, length(pp - c)); }
float ringGlow(vec2 pp, vec2 c, float rp){
  float dd = abs(length(pp - c) - rp);
  return exp(-dd * dd / (rp * rp * 0.08));
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
  vec3 dyeC = texture(uDye, uv).rgb;
  float d = max(max(dyeC.r, dyeC.g), dyeC.b);
  // velocity is stored in raw sim units (tens..hundreds); scale to a 0..1-ish
  // "flow" factor so rose/foam only appear on genuinely fast crests.
  float flow = clamp(length(texture(uVelocity, uv).xy) * 0.012, 0.0, 1.0);

  // teal core, only tinting toward rose on genuinely fast water (capped so it
  // stays aurora-teal rather than going fully mauve).
  vec3 lumin = mix(cTeal, cRose, flow * 0.6);
  vec3 color = base;
  color += lumin * d * (0.8 + 0.5 * glow);
  // subtle luminous core only where dye is very dense (restrained)
  color += mix(cTeal, cPearl, 0.4) * smoothstep(0.7, 1.3, d) * (0.25 * glow);

  // --- goals: crisp pearl lip on the goal line + team-colour aura falling
  //     off into the field (left = Team A, right = Team B). Both breathe with
  //     the beat, swell with the crescendo, and go white-hot on a score. ---
  vec2 aa = fwidth(uv) * 1.2;
  float dy = abs(uv.y - 0.5);
  float lipSpan = 1.0 - smoothstep(uGoalHalf - aa.y, uGoalHalf + aa.y, dy);
  // vertical overshoot past the posts, in uv-x units so the aura is a round
  // capsule around the lip rather than a hard-edged slab
  float overY = max(dy - uGoalHalf, 0.0) / aspectRatio;
  float energy = (1.0 + uBeatPulse * uBeat * uBeat) * (1.0 + uGoalBuild * uEdgeGlow);
  vec3 hotC[2];
  float boostC[2];
  for (int side = 0; side < 2; side++) {
    // signed distance from the goal line, + into the field, - into the pocket
    float sx = side == 0 ? uv.x - uGoalInset : (1.0 - uGoalInset) - uv.x;
    float flash = side == 0 ? uGoalFlashA : uGoalFlashB;
    vec3 tc = side == 0 ? cTeamA : cTeamB;
    vec3 hot = mix(tc, vec3(1.0), flash * 0.85);
    float boost = energy + uGoalFlashGain * flash;
    hotC[side] = hot;
    boostC[side] = boost;
    float lip = 1.0 - smoothstep(uLipWidth - aa.x, uLipWidth + aa.x, abs(sx));
    float lipCore = 1.0 - smoothstep(0.0, uLipWidth, abs(sx));
    float sheen = exp(-abs(sx) / (uLipWidth * 3.0)) * 0.35;
    // pocket (sx < 0) stays lit; field side falls off with a slow shimmer
    float aura = exp(-length(vec2(max(sx, 0.0), overY)) / uAuraFalloff);
    aura *= 0.8 + 0.4 * noise(vec2(uv.y * 14.0 - time * 0.5, sx * 30.0 + time * 0.2));
    color += hot * aura * uAuraStrength * boost;
    vec3 lipC = mix(hot, mix(cPearl, vec3(1.0), flash), 0.25 + 0.6 * lipCore);
    color += lipC * (lip + sheen) * lipSpan * uLipBrightness * boost;
  }
  // goal posts: bright capped discs anchoring each end of the lip
  float postR = uPostRadius * 2.0;
  vec2 posts[4];
  posts[0] = uvToP(vec2(uGoalInset, 0.5 - uGoalHalf));
  posts[1] = uvToP(vec2(uGoalInset, 0.5 + uGoalHalf));
  posts[2] = uvToP(vec2(1.0 - uGoalInset, 0.5 - uGoalHalf));
  posts[3] = uvToP(vec2(1.0 - uGoalInset, 0.5 + uGoalHalf));
  for (int i = 0; i < 4; i++) {
    int side = i < 2 ? 0 : 1;
    vec3 pc = hotC[side];
    float pb = uLipBrightness * boostC[side];
    float pd = length(p - posts[i]);
    float pf = discFill(p, posts[i], postR);
    float pcore = smoothstep(postR * 0.9, 0.0, pd);
    color = mix(color, pc * 0.8 * pb, pf);
    color += mix(pc, cPearl, 0.7) * pcore * pcore * 0.7 * pb;
    color += pc * exp(-pd / postR) * 0.2 * boostC[side];
  }

  // --- player markers + walls ---
  for (int i = 0; i < 2; i++) {
    if (uPlayerActive[i] < 0.5) continue;
    vec3 tc = i == 0 ? cTeamA : cTeamB;
    vec2 pc = uvToP(uPlayerPos[i]);
    // wall barrier (translucent energy disc + fresnel rim); taller at peaks
    if (uPlayerWall[i] > 0.001) {
      float wr = uPlayerWall[i] * 2.0;
      float wf = discFill(p, pc, wr);
      float wrim = ringGlow(p, pc, wr);
      color = mix(color, tc * 0.5, wf * 0.4);
      color += tc * wrim * (0.8 + 0.6 * uEdgeGlow);
    }
    // marker aura orb, pulsing with energy
    float mr = uPlayerRadius * 2.0;
    float md = length(p - pc);
    float core = smoothstep(mr, mr * 0.6, md);
    float aura = exp(-md * md / (mr * mr * 2.2)) * (0.35 + 0.4 * uPlayerEnergy[i]);
    color = mix(color, mix(tc, cPearl, 0.5), core);
    color += tc * aura;
  }

  // --- the ball: a clean, rigid pearl orb (no deformation) ---
  vec2 bp = uvToP(uBallPos);
  float bdist = length(p - bp);
  float br = uBallRadius * 2.0;
  float orb = smoothstep(br, br * 0.78, bdist);
  float rim = smoothstep(br, br * 0.92, bdist) - smoothstep(br * 0.92, br * 0.6, bdist);
  float halo = exp(-bdist / (br * 1.4)) * 0.28;
  vec3 ballCol = mix(cPearl * 0.65, cPearl, orb);
  color = mix(color, ballCol, orb);
  color += cPearl * max(rim, 0.0) * 0.5;
  color += cTeal * halo * (0.3 + 0.4 * d);

  // --- goal shatter shards (pearl shards you drag around) ---
  for (int i = 0; i < 20; i++) {
    if (i >= uShardCount) break;
    vec2 sp = uvToP(uShardPos[i]);
    float sd = length(p - sp);
    float sr = uShardSize[i] * 2.0;
    float core = smoothstep(sr, sr * 0.4, sd);
    color = mix(color, cPearl, core);
    color += mix(cPearl, cTeal, 0.3) * exp(-sd / (sr * 1.6)) * 0.5;
  }

  // --- vignette + subtle tone ---
  float vig = smoothstep(1.7, 0.4, r);
  color *= 0.35 + 0.65 * vig;
  color = color / (color + vec3(0.9)); // reinhard-ish tonemap
  color = pow(color, vec3(0.9));

  // --- crescendo edge glow (rose-gold -> white-hot): confined to the outer
  //     rim and kept subtle so it never washes over the play field ---
  float edge = smoothstep(1.12, 1.62, r);
  vec3 glowC = mix(uEdgeColor, vec3(1.0), uEdgeGlow * 0.35);
  color += glowC * edge * uEdgeGlow * (0.38 + 0.22 * uBeat);
  // subtle beat breathing
  color *= 1.0 + 0.02 * uBeat;

  frag = vec4(color, 1.0);
}`;

/** bloom bright-pass: keep energy above a threshold. */
export const THRESHOLD_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 frag;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  float b = max(max(c.r, c.g), c.b);
  float k = max(0.0, b - uThreshold) / max(b, 1e-4);
  frag = vec4(c * k, 1.0);
}`;

/** separable 5-tap gaussian blur (uDir is the texel-scaled direction). */
export const BLUR_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
void main() {
  vec3 s = texture(uTex, vUv).rgb * 0.227;
  s += texture(uTex, vUv + uDir * 1.3843).rgb * 0.316;
  s += texture(uTex, vUv - uDir * 1.3843).rgb * 0.316;
  s += texture(uTex, vUv + uDir * 3.2307).rgb * 0.070;
  s += texture(uTex, vUv - uDir * 3.2307).rgb * 0.070;
  frag = vec4(s, 1.0);
}`;

/**
 * Final composite: scene + bloom, with an expanding goal shockwave (UV ring
 * distortion + flash), chromatic aberration (boosted on big moments), camera
 * shake, film grain and a gentle vignette.
 */
export const COMPOSITE_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uShake;
uniform float uBloomStr;
uniform float uCA;
uniform float uGrain;
uniform float uTime;
uniform float aspectRatio;
uniform vec2 uShockCenter;
uniform float uShockProgress; // 0..1
uniform float uShockStr;
out vec4 frag;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv + uShake;

  // shockwave ring
  vec2 d = uv - uShockCenter;
  d.x *= aspectRatio;
  float dist = length(d);
  float ringR = uShockProgress * 1.5;
  float ring = smoothstep(0.08, 0.0, abs(dist - ringR)) * uShockStr * (1.0 - uShockProgress);
  uv += normalize(d + 1e-5) * ring * 0.03 / vec2(aspectRatio, 1.0);

  // chromatic aberration (toward edges), stronger during big moments + ring
  float ca = uCA + ring * 0.6;
  vec2 dir = uv - 0.5;
  vec3 col;
  col.r = texture(uScene, uv + dir * ca * 0.006).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - dir * ca * 0.006).b;

  // bloom
  col += texture(uBloom, uv).rgb * uBloomStr;
  // ring flash (warm)
  col += vec3(1.0, 0.92, 0.82) * ring * 0.7;

  // grain
  float g = (hash(vUv * vec2(1920.0, 1080.0) + uTime) * 2.0 - 1.0) * uGrain;
  col += g;

  // gentle extra vignette
  float r = length((vUv - 0.5) * vec2(aspectRatio, 1.0));
  col *= smoothstep(1.25, 0.3, r) * 0.25 + 0.75;

  frag = vec4(col, 1.0);
}`;

/** Debug view: velocity (RG), pressure, dye, or raw. mode via uniform. */
export const DEBUG_FRAG = `${HEADER}
in vec2 vUv;
uniform sampler2D uTex;
uniform int mode; // 0 vel, 1 pressure, 2 dye, 3 curl, 4 obstacle
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
  } else if (mode == 4) {
    float s = t.x; // obstacle mask
    frag = vec4(s * 0.3, s * 0.9, s, 1.0);
  } else {
    frag = vec4(t.rgb, 1.0); // dye
  }
}`;
