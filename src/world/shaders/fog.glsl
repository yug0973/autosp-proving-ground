// Distance fog shared by everything on the ground. The colour follows the horizon (atmosphere).
uniform vec3 uFogColor;
uniform float uFogDensity;

vec3 applyFog(vec3 col, vec3 world) {
  float dist = length(world - cameraPosition);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  return mix(col, uFogColor, fog);
}

// The moon, low in the west: the one light that shapes the city's masses at night.
const vec3 MOON = vec3(-0.42, 0.62, 0.66);

uniform vec3 uAmbient;   // the night sky's light: Nexarise navy
uniform vec3 uMoonLight; // cool moonlight
uniform float uGrade;    // how far the night grade has come in: it starts at dusk, before the dark

// The city's grade. By day a neutral key light; at night a cool moon over a navy ambient, so
// nothing on the ground reads as neutral grey. `moon` is how squarely the surface faces the moon.
vec3 shade(vec3 albedo, float moon, float night) {
  vec3 day = albedo * (0.42 + 0.58 * moon);
  vec3 nightLit = albedo * (0.26 + 0.36 * moon) * vec3(0.8, 0.9, 1.25) + uAmbient * 0.2 + uMoonLight * moon * 0.03;
  return mix(day, nightLit, max(night, uGrade));
}
