// The day cloud deck over the night city, with the tear in it (tear.ts). Where this draws solid, the
// city is hidden; where the tear is, it is see-through, and the finished frame shows.
uniform sampler2D uTile;
uniform vec2 uCentre;   // the middle of the tear, 0 to 1 on the screen
uniform float uRadius;  // its size, as a share of the screen's height
uniform float uAspect;
uniform float uTime;
uniform float uGone;    // 0 the deck, 1 all clear
uniform float uWordsHold; // 1 while the page's words are on the deck, falling to 0 as they fade
uniform vec4 uGuards[GUARDS]; // the page's words: left, bottom, right, top, 0 to 1
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uSky;
varying vec2 vUv;

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 drift = vec2(uTime * 0.0035, uTime * 0.0012);

  // two sheets of the one tile, sliding slowly over each other: a high thin layer on a broad one
  vec4 near = texture2D(uTile, p * 0.5 + drift);
  vec4 far = texture2D(uTile, p.yx * 0.23 - drift * 0.6 + 0.37);
  float amount = max(near.r, far.r * 0.96);
  float sun = mix(far.g, near.g, near.r / max(near.r + far.r, 1e-3));

  // The tear never reaches behind the page's words, so they always stand on the sky, never the city
  float wander = texture2D(uTile, p * 0.93 + 0.61).r * 0.5 + texture2D(uTile, p * 0.27 + 0.13).r * 0.5;
  float words = 0.0;
  for (int i = 0; i < GUARDS; i++) {
    vec4 g = uGuards[i];
    float edge = max(max(g.x - vUv.x, vUv.x - g.z) * uAspect, max(g.y - vUv.y, vUv.y - g.w));
    // its edge wanders with the billows, so the deck around the words is never a box
    words = max(words, step(0.0, g.z) * (1.0 - smoothstep(0.02, 0.05, edge - (wander - 0.5) * 0.2 - 0.03)));
  }

  // The tear: a circle, its edge ripped along the cloud's own billows
  vec2 away = (vUv - uCentre) * vec2(uAspect, 1.0);
  float torn = length(away * vec2(0.86, 1.14)) / max(uRadius, 1e-4) - (wander - 0.5) * 0.7 - (amount - 0.5) * 0.28;
  words *= uWordsHold;
  float deck = max(smoothstep(0.97, 1.03, torn), words);

  // Thin cloud lets the sky's blue through. The light baked into the tile does the rest: bright where
  // the sun reaches, soft shadowed blue where the cloud's own depth has taken it. Ink holds its contrast
  // on all of it, the sky's blue included, so the deck looks the same behind the words as anywhere, and
  // as it curls down into the tear it falls into shade.
  float thick = smoothstep(0.08, 0.72, amount);
  vec3 cloud = mix(uShade, uLit, smoothstep(0.22, 0.68, sun));
  vec3 col = mix(uSky, cloud, thick);
  float lip = 1.0 - smoothstep(1.0, 1.3, torn);
  col = mix(col, uShade * 0.7, lip * (1.0 - words) * 0.62);

  // And where the deck ends it falls away: a fall of cloud to the city, not a cut-out
  float fading = 1.0 - uGone;
  gl_FragColor = vec4(col, deck * fading);
  #include <colorspace_fragment>
}
