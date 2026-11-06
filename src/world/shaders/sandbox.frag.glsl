uniform vec3 uColor;
uniform float uShow;   // 0 to 1: fades the whole volume in as it drops
uniform float uLanded; // 0 to 1: the seam along the ground lights as it lands

varying vec2 vUv;
varying vec2 vFace;
varying vec3 vNormal;
varying vec3 vWorld;

// Clear glass with lit edges and a faint grid of square dots, the same matrix as the city.
void main() {
  vec3 view = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), view)), 2.5);

  vec2 toEdge = min(vUv, vFace - vUv);
  float edge = 1.0 - smoothstep(0.06, 0.2, min(toEdge.x, toEdge.y));

  vec2 g = vUv / 1.1;
  vec2 local = fract(g) - 0.5;
  vec2 fw = fwidth(g);
  float fine = 1.0 - smoothstep(0.25, 0.6, max(fw.x, fw.y));
  float dotMask = (1.0 - smoothstep(0.06, 0.1, max(abs(local.x), abs(local.y)))) * fine;

  // once the volume has landed, a thin line lights where its walls meet the ground (walls only:
  // the floor face would light up whole)
  float wall = 1.0 - step(0.5, abs(vNormal.y));
  float seam = (1.0 - smoothstep(0.0, 0.25, vWorld.y)) * wall * uLanded;

  float alpha = 0.05 + fresnel * 0.22 + edge * 0.7 + dotMask * 0.14 + seam * 0.55;
  gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0) * uShow);
  #include <colorspace_fragment>
}
