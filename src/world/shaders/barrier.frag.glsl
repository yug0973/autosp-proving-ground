// A check as a barrier of lit square pixels, the brand's dot matrix.
//
// - Waiting: dim pixels with a brighter border, and a slow scan line sweeping up.
// - Passed: lime spreads out from where the fix went through, with a ring running ahead of it, and
//   the barrier stays lime.
// - Refused: the barrier strikes orange-red at once, the struck pixels jolt out of the grid, rings
//   pulse out from the impact, and it holds red.
//
// uSince is seconds since the barrier decided (large when it has not, or with reduced motion, so
// the end state shows at once).
uniform vec2 uSize;     // the barrier's width and height, in world units
uniform float uState;   // 0 waiting, 1 passed, 2 refused
uniform float uSince;
uniform float uTime;
uniform float uShow;
uniform vec3 uIdle;
uniform vec3 uPass;
uniform vec3 uRefuse;
varying vec2 vUv;

const float CELL = 0.42;
const float HALF = 0.3; // half-width of a lit pixel, in cells

void main() {
  vec2 p = vUv * uSize;
  vec2 cell = floor(p / CELL);
  vec2 local = fract(p / CELL) - 0.5;
  float passed = step(0.5, uState) * (1.0 - step(1.5, uState));
  float refused = step(1.5, uState);

  // the struck pixels jolt out of the grid for a moment
  float jolt = refused * exp(-uSince * 4.0);
  float beat = floor(uTime * 24.0);
  vec2 slip = (vec2(hash21(cell + beat), hash21(cell - beat)) - 0.5) * 0.7 * jolt;
  float pixel = 1.0 - smoothstep(HALF - 0.04, HALF + 0.02, max(abs(local.x + slip.x), abs(local.y + slip.y)));

  float border = 1.0 - step(CELL * 1.05, min(min(p.x, uSize.x - p.x), min(p.y, uSize.y - p.y)));
  float r = length(p - uSize * 0.5);

  // waiting: faint, with a scan line sweeping up the barrier every four seconds
  float scanY = fract(uTime * 0.25) * (uSize.y + 2.0) - 1.0;
  float scan = exp(-pow((p.y - scanY) * 1.1, 2.0));
  float idle = 0.14 + 0.45 * scan + 0.4 * border + 0.08 * hash21(cell);

  // passed: lime fills outward from the centre, a bright ring at its front
  float front = uSince * 10.0;
  float filled = passed * (1.0 - smoothstep(front - 1.2, front, r));
  float passRing = passed * (1.0 - smoothstep(0.0, 0.9, abs(r - front))) * exp(-uSince * 1.4);

  // refused: a full flash, then rings pulsing out from the impact, then a steady red
  float flash = refused * exp(-uSince * 2.6);
  float rings = refused * max(sin(r * 2.2 - uSince * 13.0), 0.0) * exp(-uSince * 1.1);

  vec3 colour = mix(uIdle, uPass, max(filled, passRing));
  colour = mix(colour, uRefuse, refused);
  float alpha = mix(idle * 0.6, 0.85 + 0.15 * border, filled);
  alpha = max(alpha, passRing * 0.95);
  alpha = mix(alpha, 0.62 + 0.3 * border + 0.5 * flash + 0.35 * rings, refused);
  float a = clamp(alpha, 0.0, 1.0) * pixel * uShow;
  if (a < 0.02) discard;
  gl_FragColor = vec4(colour * (1.0 + flash * 0.8), a);
  #include <colorspace_fragment>
}
