// The sunlight in the deck, baked once from the tile of how much cloud there is. It walks from each
// point towards the sun and adds up the cloud on the way: light that has come through a lot of cloud is
// dim, so banks are bright on the sunward side and go grey-blue in their own shade. This is what makes
// a cloud look deep. Red stays the amount of cloud, and green becomes the light.
precision highp float;
uniform sampler2D uAmount;
varying vec2 vUv;

const vec2 SUN = vec2(-0.72, 0.69);
const int STEPS = 14;

void main() {
  vec2 sampled = texture2D(uAmount, vUv).rg;
  float here = sampled.r;
  float through = 0.0;
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) / float(STEPS);
    through += texture2D(uAmount, vUv + SUN * t * t * 0.055).r * (1.0 - t * 0.6);
  }
  float light = exp(-through * 0.13);
  // the surface of a bank is never flat: its fine turbulence rolls the light across it
  light *= 0.62 + 0.76 * smoothstep(0.28, 0.72, sampled.g);
  // a little light scatters back up through the thin cloud at the edges too
  light = mix(light, 1.0, (1.0 - here) * 0.5);
  gl_FragColor = vec4(here, light, 0.0, 1.0);
}
