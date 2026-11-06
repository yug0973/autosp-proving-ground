uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform float uDusk;
uniform float uNight;
uniform float uTime;
varying vec3 vDir;

// Stars are square pixels on a grid, the same material as the city's windows.
float stars(vec3 dir) {
  vec3 a = abs(dir);
  vec2 uv;
  float face;
  if (a.y >= a.x && a.y >= a.z) {
    uv = dir.xz / a.y;
    face = dir.y > 0.0 ? 0.0 : 1.0;
  } else if (a.x >= a.z) {
    uv = dir.yz / a.x;
    face = dir.x > 0.0 ? 2.0 : 3.0;
  } else {
    uv = dir.xy / a.z;
    face = dir.z > 0.0 ? 4.0 : 5.0;
  }
  vec2 scaled = uv * 240.0;
  vec2 cell = floor(scaled);
  vec2 local = fract(scaled) - 0.5;
  float h = hash21(cell + face * 57.0);
  float body = 1.0 - smoothstep(0.16, 0.22, max(abs(local.x), abs(local.y)));
  float twinkle = 0.7 + 0.3 * sin(uTime * 1.3 + h * 200.0);
  return step(0.985, h) * body * twinkle * (0.4 + 0.6 * fract(h * 91.7));
}

void main() {
  float up = vDir.y;
  // a narrow pale band at the horizon; most of the sky is the deep Nexarise blue the text sits on.
  // The blend runs in linear light, where even a small share of the pale horizon lifts the blue a
  // lot, so the band is kept low.
  float t = smoothstep(-0.02, 0.2, up);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.8));
  // dusk: a warm band on the horizon, strongest toward the far side of the city
  float band = exp(-abs(up) * 7.0) * (0.55 + 0.45 * clamp(-vDir.z, 0.0, 1.0));
  col += uGlow * band * uDusk * 0.85;
  // stars fade in with the night and stay clear of the horizon haze
  col += vec3(0.86, 0.9, 1.0) * stars(vDir) * uNight * smoothstep(0.03, 0.35, up);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
