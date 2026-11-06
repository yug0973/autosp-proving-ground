uniform vec3 uStreetLight;
uniform float uNight;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  float moon = max(dot(normalize(vNormal), normalize(MOON)), 0.0);
  vec3 col = shade(vColor, moon, uNight) * mix(1.0, 1.25, uNight);
  // lit from above by the streetlights
  col += uStreetLight * 0.1 * uNight * max(vNormal.y, 0.2);
  col *= loneDim();
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <colorspace_fragment>
}
