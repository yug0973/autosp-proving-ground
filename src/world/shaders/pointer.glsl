// The visitor's pointer over the city. A crack under it (hovered for its tooltip) burns brighter,
// and on the first screen only, cracks near the pointer brighten a little: no light is drawn, the
// cracks just answer. Set from world-stage.ts; never on touch screens.
uniform float uHoverIndex; // the building whose crack is hovered, or -1
uniform vec3 uNear;        // the pointer in drawing-buffer pixels, and how strong the nearby glow is (0 to 1)
uniform float uNearRadius; // in drawing-buffer pixels

float crackLift(float index) {
  float hover = 1.0 - step(0.5, abs(index - uHoverIndex));
  vec2 d = gl_FragCoord.xy - uNear.xy;
  float near = uNear.z * exp(-dot(d, d) / (uNearRadius * uNearRadius));
  return 1.0 + hover * 1.1 + near * 1.3;
}
