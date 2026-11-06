// The sealed pixels rising off the wall at the merge. Each point starts at its place on the crack
// and floats up, drifting a little, over a few seconds; uTime is seconds since the merge.
attribute float aSeed;
uniform float uTime;
uniform float uScale;
varying float vFade;

void main() {
  // slow enough to watch: a few units a second, easing upward, gone after about four seconds
  float speed = 1.6 + aSeed * 3.2;
  float t = max(uTime - aSeed * 0.9, 0.0); // a stagger, so the wall empties over a second
  vec3 p = position;
  p.y += t * speed + t * t * 0.35;
  p.x += sin(t * 1.3 + aSeed * 40.0) * 0.45 * t;
  p.z += cos(t * 1.1 + aSeed * 23.0) * 0.45 * t;
  vFade = (1.0 - smoothstep(1.8, 4.2, t)) * step(0.0001, t);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uScale * (0.55 + aSeed * 0.45) / -view.z;
  gl_Position = projectionMatrix * view;
}
