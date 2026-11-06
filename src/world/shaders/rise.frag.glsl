uniform vec3 uColor;
varying float vFade;

// Points are drawn square, like every pixel in the world.
void main() {
  if (vFade <= 0.001) discard;
  gl_FragColor = vec4(uColor, vFade);
  #include <colorspace_fragment>
}
