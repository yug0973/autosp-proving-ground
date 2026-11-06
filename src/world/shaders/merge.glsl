// The merge, shared by everything in the city. While a person holds the merge button a lime wave
// runs out from the sealed tower along the street grid (distance is measured block by block, so the
// front travels down avenues and streets rather than as a circle), lighting windows as it passes.
// Once merged, the wave runs on and fades, and the rest of the city goes dark around the tower.
uniform vec2 uWaveFrom;  // the sealed tower, in plan
uniform float uWave;     // how far the wave's front has run, in world units (0: no wave)
uniform float uWaveFade; // the wave's strength: 1 while holding, falling to 0 after the merge
uniform float uLone;     // 0 the city as it is, 1 dark around the one sealed tower

float waveDistance(vec2 xz) {
  vec2 d = abs(xz - uWaveFrom);
  return d.x + d.y;
}

// 1 on the wave's front, trailing off over a few metres behind it
float waveFront(vec2 xz) {
  float behind = uWave - waveDistance(xz);
  return step(0.001, uWave) * smoothstep(-0.8, 0.0, behind) * exp(-max(behind, 0.0) * 0.3) * uWaveFade;
}

// 1 just behind the front, fading out over the blocks further back, so the wave reads as a band
// of light moving outward rather than a flood
float waveBehind(vec2 xz) {
  float behind = uWave - waveDistance(xz);
  return step(0.001, uWave) * smoothstep(0.0, 2.0, behind) * exp(-max(behind, 0.0) / 22.0) * uWaveFade;
}

// how much of its light anything but the sealed tower keeps once the city goes dark
float loneDim() {
  return mix(1.0, 0.14, uLone);
}
