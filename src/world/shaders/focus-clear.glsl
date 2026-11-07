// (FOCUS_FADE, from city.ts: how far into the push a piece has gone.)
// Clearing the camera's line of sight to the building it is pushing in on. Vertex shaders only: a
// piece (a tier, a tank, a spire) is one column, so the answer is the same for all of it, and it is
// settled before a single pixel is shaded.
//
// A piece that stands in a tube from the camera to the building fades out whole: the CLEARING variant
// draws the pieces that are wholly there, and the FADE variant draws the ones on their way out,
// truly transparent, on top. So no shader needs to discard, and there is no dither to speckle.
uniform float uFocusIndex; // the building's index, or -1
uniform float uFocus;      // how far the push has gone, 0 to 1
uniform vec3 uFocusTarget; // the point the camera looks at on it

// How far this piece has cleared, 0 (all there) to 1 (gone). A piece is a column: its centre `axis` in
// plan, from `span.x` up to `span.y`, `reach` half its width. It counts when the sightline passes
// within the tube's radius of any part of that column.
float focusClearAmount(vec2 axis, vec2 span, float reach, float index) {
  if (uFocus <= 0.001 || abs(index - uFocusIndex) < 0.5) return 0.0;
  vec3 ab = uFocusTarget - cameraPosition;
  // where the sightline passes closest to the column, in plan; past the building, nothing is in the way
  float raw = dot(axis - cameraPosition.xz, ab.xz) / max(dot(ab.xz, ab.xz), 1e-4);
  float t = clamp(raw, 0.0, 1.0);
  vec3 p = cameraPosition + ab * t;
  vec3 q = vec3(axis.x, clamp(p.y, span.x, span.y), axis.y);
  float d = length(p - q);
  // the last stretch before the building is spared (its neighbours across the street stay): 14% of
  // the way, or 5 units once the camera is further off than that, as after the merge. But only a
  // piece beside the sightline: one squarely in front of the building would hide it, so it clears.
  float stop = max(0.86, 1.0 - 5.0 / max(length(ab), 1e-3));
  float spared = smoothstep(stop - 0.06, stop, t) * smoothstep(reach + 1.0, reach + 3.0, d);
  // Soft at the tube's edges: as the camera moves, a piece drifting out of the line of sight fades
  // back in over a few units instead of appearing between one frame and the next (and one drifting
  // in fades out). Only the few pieces on an edge are half there at once.
  // and past the building nothing is in the way, eased over the last few units so a neighbour level
  // with it does not snap back in as the camera swings round
  float before = 1.0 - smoothstep(-3.0, 0.0, (raw - 1.0) * length(ab));
  float inside = (1.0 - smoothstep(5.0 + reach, 9.0 + reach, d)) * (1.0 - spared) * before;
  return inside * smoothstep(0.0, FOCUS_FADE, uFocus);
}

// Puts a vertex outside the screen when this variant does not draw its piece.
#if defined(CLEARING)
#define FOCUS_DRAWN(clear) ((clear) <= 0.0)
#elif defined(FADE)
#define FOCUS_DRAWN(clear) ((clear) > 0.0 && (clear) < 1.0)
#else
#define FOCUS_DRAWN(clear) (true)
#endif
