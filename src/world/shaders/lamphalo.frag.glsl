uniform vec3 uStreetLight;
varying float vFade;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float glow = pow(max(1.0 - d, 0.0), 2.4);
  gl_FragColor = vec4(uStreetLight, glow * 0.42 * vFade * loneDim());
  #include <colorspace_fragment>
}
