uniform vec3 uHeadlight;
uniform vec3 uTaillight;
varying float vKind;
varying float vFade;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float glow = smoothstep(0.5, 0.0, d);
  glow *= glow;
  vec3 col = mix(uHeadlight, uTaillight * 1.6, vKind);
  gl_FragColor = vec4(col, glow * vFade * mix(0.9, 0.55, vKind) * loneDim());
  #include <colorspace_fragment>
}
