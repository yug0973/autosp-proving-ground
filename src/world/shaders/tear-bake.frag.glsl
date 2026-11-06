// How much cloud there is, baked once into a tile that repeats. Seen from high above, a deck has no
// bumps: it is broad soft banks, worn thin and wispy at the edges by finer and finer turbulence, with
// the sky showing through where it has worn away.
precision highp float;
varying vec2 vUv;

float hash(vec2 p, float period) {
  p = mod(p, period);
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 uv, float period) {
  vec2 p = uv * period;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i, period);
  float b = hash(i + vec2(1.0, 0.0), period);
  float c = hash(i + vec2(0.0, 1.0), period);
  float d = hash(i + vec2(1.0, 1.0), period);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float turbulence(vec2 uv, float period, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float total = 0.0;
  for (int i = 0; i < octaves; i++) {
    sum += amp * noise(uv, period);
    total += amp;
    amp *= 0.5;
    period *= 2.0;
  }
  return sum / total;
}

void main() {
  // the wind pulls everything along: the shapes are bent by a slower turbulence than their own
  vec2 wind = vec2(turbulence(vUv, 3.0, 4), turbulence(vUv + 0.41, 3.0, 4)) - 0.5;
  vec2 uv = vUv + wind * 0.16;
  // the banks, then the fine turbulence eating into them, hardest where they are thin
  float banks = turbulence(uv, 4.0, 3);
  float fine = turbulence(uv + wind * 0.07, 16.0, 5);
  float shape = banks - (1.0 - banks) * (1.0 - fine) * 0.62;
  float amount = smoothstep(0.12, 0.5, shape);
  // green keeps the fine turbulence, for the light to play across inside the banks
  gl_FragColor = vec4(amount, turbulence(uv + wind * 0.2, 10.0, 6), 0.0, 1.0);
}
