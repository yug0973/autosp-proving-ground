// A pedestrian walking the loop of a block's sidewalk, in closed form like the cars.
attribute vec2 aBlock;  // the block centre
attribute float aStart; // where on the loop they start, in world units
attribute float aSpeed; // signed: which way round they walk
attribute float aInset; // distance in from the kerb
attribute vec3 aColor;
uniform float uTime;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;

// a point s units along the loop of a rectangle with half sizes h, starting at one corner
vec2 loop(float s, vec2 h) {
  float p = 4.0 * (h.x + h.y);
  s = mod(s, p);
  if (s < 2.0 * h.x) return vec2(-h.x + s, -h.y);
  s -= 2.0 * h.x;
  if (s < 2.0 * h.y) return vec2(h.x, -h.y + s);
  s -= 2.0 * h.y;
  if (s < 2.0 * h.x) return vec2(h.x - s, h.y);
  s -= 2.0 * h.x;
  return vec2(-h.x, h.y - s);
}

void main() {
  vec2 half_ = vec2(BLOCK_X, BLOCK_Z) * 0.5 - aInset;
  float s = aStart + uTime * aSpeed;
  vec2 at = aBlock + loop(s, half_);
  // a step's bob
  float bob = abs(sin(s * 9.0)) * 0.035;
  vec3 world = vec3(at.x, bob, at.y) + position;
  vColor = aColor;
  vNormal = normal;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
