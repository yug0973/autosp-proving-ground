// The ground: the Manhattan grid painted from world position (grid.ts supplies the #defines).
// Avenues run along z between blocks, cross streets along x; sidewalks ring every block; lane
// lines are dashed, crosswalks are zebra stripes, and every streetlight throws a pool of light.
uniform vec3 uAsphalt;
uniform vec3 uSidewalk;
uniform vec3 uPaint;
uniform vec3 uStreetLight;
uniform vec3 uSealed;
uniform vec3 uWindowWarm;
uniform float uNight;
varying vec3 vWorld;

// 1 inside [lo, hi], with soft edges a pixel or so wide
float band(float v, float lo, float hi, float aa) {
  return smoothstep(lo - aa, lo + aa, v) * (1.0 - smoothstep(hi - aa, hi + aa, v));
}

void main() {
  vec2 p = vWorld.xz;
  // position relative to the nearest block centre
  vec2 l = p - vec2(PITCH_X, PITCH_Z) * floor(p / vec2(PITCH_X, PITCH_Z) + 0.5);
  vec2 half_ = vec2(BLOCK_X, BLOCK_Z) * 0.5;
  vec2 fw = fwidth(p);
  float aa = max(fw.x, fw.y) * 0.7 + 0.002;
  // far away the paint is too fine to draw: fade it out before it shimmers
  float detail = 1.0 - smoothstep(0.18, 0.5, max(fw.x, fw.y));

  float inBlock = band(l.x, -half_.x, half_.x, aa) * band(l.y, -half_.y, half_.y, aa);
  float onAvenue = 1.0 - band(l.x, -half_.x, half_.x, aa);
  float onStreet = 1.0 - band(l.y, -half_.y, half_.y, aa);
  vec2 edge = half_ - abs(l);
  float sidewalk = inBlock * (1.0 - band(min(edge.x, edge.y), SIDEWALK, 99.0, aa));

  float edgeNear = min(edge.x, edge.y);
  float avenueCentre = abs(abs(l.x) - PITCH_X * 0.5);
  float streetCentre = abs(abs(l.y) - PITCH_Z * 0.5);

  // The road has been patched and resurfaced for years, and the traffic has worn its lanes darker
  vec3 col = uAsphalt * (0.8 + 0.4 * vnoise(p * 0.31));
  float wornA = max(1.0 - smoothstep(0.08, 0.34, abs(avenueCentre - 0.7)), 1.0 - smoothstep(0.08, 0.34, abs(avenueCentre - 2.1)));
  float wornS = 1.0 - smoothstep(0.08, 0.34, abs(streetCentre - 0.75));
  col *= 1.0 - 0.16 * detail * (onAvenue * wornA * (1.0 - onStreet) + onStreet * wornS * (1.0 - onAvenue));
  // the gutter along each kerb collects the dark
  col *= 1.0 - 0.3 * (1.0 - inBlock) * (1.0 - smoothstep(0.0, 0.35, -edgeNear)) * detail;
  // a manhole here and there, in the middle of a lane
  vec2 hole = floor(p / 9.0);
  vec2 inHole = p - (hole + 0.5) * 9.0 - (vec2(hash21(hole), hash21(hole + 5.3)) - 0.5) * 5.0;
  float cover = (1.0 - inBlock) * step(0.62, hash21(hole + 11.1)) * (1.0 - smoothstep(0.2, 0.24, length(inHole)));
  col = mix(col, uAsphalt * 0.5, cover * detail);

  // Paving slabs on the sidewalk, and the shadow where it meets a building
  vec3 pavement = uSidewalk;
  vec2 slab = abs(fract(p / 1.1) - 0.5);
  pavement *= 1.0 - 0.2 * detail * smoothstep(0.455, 0.49, max(slab.x, slab.y));
  pavement *= 1.0 - 0.42 * smoothstep(SIDEWALK * 0.62, SIDEWALK, edgeNear);
  col = mix(col, pavement, sidewalk);
  // the kerb: a thin bright edge where sidewalk meets road
  float kerb = inBlock * (1.0 - smoothstep(0.0, 0.08 + aa, min(edge.x, edge.y)));
  col = mix(col, uSidewalk * 1.5, kerb * detail);

  // lane lines: dashed down the middle of every avenue and street, none across intersections
  float dashZ = step(0.5, fract(p.y / 3.0));
  float dashX = step(0.5, fract(p.x / 3.0));
  float laneA = onAvenue * (1.0 - onStreet) * (1.0 - smoothstep(0.05, 0.05 + aa, abs(avenueCentre - 1.4))) * dashZ;
  laneA += onAvenue * (1.0 - onStreet) * (1.0 - smoothstep(0.05, 0.05 + aa, abs(avenueCentre))) * dashZ;
  float laneS = onStreet * (1.0 - onAvenue) * (1.0 - smoothstep(0.05, 0.05 + aa, streetCentre)) * dashX;
  // crosswalks: zebra stripes across each road, just outside every block corner
  float stripesA = step(0.5, fract(l.x * 1.6));
  float stripesS = step(0.5, fract(l.y * 1.6));
  float walkA = onAvenue * band(abs(l.y), half_.y - 1.5, half_.y - 0.3, aa) * stripesA;
  float walkS = onStreet * band(abs(l.x), half_.x - 1.5, half_.x - 0.3, aa) * stripesS * (1.0 - onAvenue);
  float paint = clamp(laneA + laneS + walkA + walkS, 0.0, 1.0) * detail;
  col = mix(col, uPaint * 0.55, paint);

  // streetlights: one every LIGHT_SPACING along each sidewalk, just inside the kerb
  vec2 lightX = vec2(LIGHT_SPACING * floor(l.x / LIGHT_SPACING + 0.5), sign(l.y) * (half_.y - 0.4));
  vec2 lightZ = vec2(sign(l.x) * (half_.x - 0.4), LIGHT_SPACING * floor(l.y / LIGHT_SPACING + 0.5));
  float pool = exp(-dot(l - lightX, l - lightX) / 2.3) + exp(-dot(l - lightZ, l - lightZ) / 2.3);
  pool = min(pool, 1.2);
  // far away the pools are too small to see one by one: an even wash, not a field of blurred blobs
  pool = mix(pool, 0.3, smoothstep(0.1, 0.42, max(fw.x, fw.y)));

  // The city ends at the results' row (skyline.ts): beyond it there is no road and no lamp, only
  // the dark, so the gap in the row looks out on nothing.
  float beyond = smoothstep(CITY_END - 3.0, CITY_END + 3.0, p.y);
  pool *= 1.0 - beyond;
  col = mix(col, uAsphalt * 0.7, beyond);

  // At night the ground is dark, and lit only in pools under the lamps (paint and pavement
  // brighten most there); by day it is plain grey asphalt.
  vec3 night = col * (0.32 + 0.9 * pool) + uStreetLight * pool * 0.16 + uAmbient * 0.12;
  col = mix(col * 1.4, night, uNight);
  // The shops' light falls across the sidewalk from the building line, some lit and some not
  float along = edge.x < edge.y ? p.y : p.x;
  float shopOpen = step(0.28, hash21(vec2(floor(along / 2.2), floor(p.x / PITCH_X) + floor(p.y / PITCH_Z) * 7.0)));
  col += uWindowWarm * 0.2 * uNight * sidewalk * shopOpen * smoothstep(SIDEWALK * 0.25, SIDEWALK * 0.9, edgeNear) * (1.0 - beyond);

  // The merge: the city goes dark around the sealed tower, and while a person holds the merge
  // button a lime front runs down the roads (and faintly over the sidewalks) away from it
  col *= loneDim();
  float road = 1.0 - inBlock;
  col += uSealed * (waveFront(p) * mix(0.16, 0.85, road) + waveBehind(p) * 0.05 * road);
  col += scanLight(vWorld.x, 0.0);
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <colorspace_fragment>
}
