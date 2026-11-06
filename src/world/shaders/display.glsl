// Facade displays (display.ts): a rectangle on one face of one tier whose windows are taken over,
// a pixel at a time, by a bitmap. Included in the facade shader after common.glsl.
//
// A display is square pixels on a grid of its own (its pitch, usually one storey). A pixel the
// ripple has reached replaces the windows under it: lit in the display's colour, or a dark pane.
// The ripple runs out from a point; each pixel waits a little longer than its neighbours, with a
// little scatter, and flashes as it arrives. One `reveal` from 0 to 1 plays it forward, and back
// again to play it off.
//
// The slot comes from a per-tier attribute (facade.vert.glsl), so a fragment on any other building
// never gets here: the facade shader skips this with one branch on a flat varying, the same for every
// pixel of a triangle. Nothing here needs an implicit derivative, so that branch is safe.

#define DISPLAYS 8

uniform vec4 uDispA[DISPLAYS]; // building index, face (1 +x, 2 -x, 3 +z, 4 -z), tier, pixel pitch
uniform vec4 uDispB[DISPLAYS]; // left edge (from the viewer's left), bottom (world height), columns, rows
uniform vec4 uDispC[DISPLAYS]; // reveal, ripple origin (pixels, from the bottom left)
uniform vec4 uDispD[DISPLAYS]; // colour
uniform sampler2D uDispTex;    // one 128 by 128 bitmap a slot, stacked

const float DISPLAY_SIZE = 128.0;
const float DISPLAY_HALF = 0.34; // a pixel is a square 0.68 of its cell

struct Display {
  float cell;   // 1 where a pixel has taken over the windows, so the old window is not drawn
  float dark;   // coverage of a dark pixel
  float lit;    // coverage of a lit pixel
  float flash;  // 1 as the ripple reaches a lit pixel, fading to 0 just after
  vec3 colour;
};

// No display here: nothing is taken over, drawn or flashed.
Display displayNone() {
  return Display(0.0, 0.0, 0.0, 0.0, vec3(0.0));
}

// Slot `s` on this point of its face. `faceUv.x` runs to the viewer's left on every face
// (facade.vert.glsl), so the display measures from `faceSize.x - faceUv.x`, which runs to the
// right and makes text read the right way round. `fwUv` is how far the face coordinates move
// across one screen pixel.
Display displayAt(int s, vec2 faceUv, vec2 faceSize, vec2 fwUv) {
  vec4 a = uDispA[s];
  vec4 b = uDispB[s];
  vec4 c = uDispC[s];

  vec2 p = (vec2(faceSize.x - faceUv.x, faceUv.y) - b.xy) / a.w;
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float inside = step(0.0, cell.x) * step(cell.x, b.z - 1.0) * step(0.0, cell.y) * step(cell.y, b.w - 1.0);

  // the bitmap's first row is its top, the grid counts up from the bottom
  vec2 texel = vec2(clamp(cell.x, 0.0, b.z - 1.0), clamp(b.w - 1.0 - cell.y, 0.0, b.w - 1.0));
  float bit = textureLod(uDispTex, (vec2(texel.x, float(s) * DISPLAY_SIZE + texel.y) + 0.5) / vec2(DISPLAY_SIZE, DISPLAY_SIZE * float(DISPLAYS)), 0.0).r;

  // when a pixel is only a few screen pixels wide, its square stops being a shape: fade to the
  // average (a square covers 0.46 of its cell) so a far display cannot shimmer
  float px = max(fwUv.x, fwUv.y) / a.w;
  float aa = px * 0.75;
  vec2 q = abs(local - 0.5);
  float square = (1.0 - smoothstep(DISPLAY_HALF - aa, DISPLAY_HALF + aa, q.x))
               * (1.0 - smoothstep(DISPLAY_HALF - aa, DISPLAY_HALF + aa, q.y));
  float coverage = mix(square, 0.46, smoothstep(0.35, 0.8, px));

  // The ripple: pixels wait in proportion to their distance from its origin, with some scatter.
  // The longest wait is 0.82, so by reveal 1 every pixel is lit and none still flashes.
  float away = length(cell - c.yz) / length(max(b.zw, vec2(1.0)));
  float delay = (clamp(away, 0.0, 1.0) * 0.8 + 0.2 * hash21(cell + 31.7 * float(s))) * 0.82;
  float revealed = smoothstep(delay, delay + 0.04, c.x);
  float arriving = step(delay, c.x) * (1.0 - smoothstep(0.0, 0.12, c.x - delay));

  float over = inside * revealed;
  Display d;
  d.cell = over;
  d.lit = over * bit * coverage;
  d.dark = over * (1.0 - bit) * coverage;
  d.flash = arriving * bit * inside;
  d.colour = uDispD[s].rgb;
  return d;
}
