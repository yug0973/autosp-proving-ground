uniform vec3 uBrick;
uniform vec3 uStone;
uniform vec3 uGlass;
uniform vec3 uDeco;
uniform vec3 uTrim;
uniform vec3 uRoof;
uniform vec3 uWindowDark;
uniform vec3 uWindowCool;
uniform vec3 uWindowWarm;
uniform vec3 uStreetLight;
uniform vec3 uSky;
uniform vec3 uOpen;
uniform vec3 uSealed;
uniform vec3 uHold;
uniform vec3 uPixelLit;
// The results' row (skyline.ts): how far along it the light has come, in towers, and how many of
// them are verified fixes (lime); the ones after that are inconclusive (amber).
uniform float uRowFront;
uniform float uRowVerified;
uniform float uNight;
uniform float uTime;
// The story on the focused building: the failing test's pulse (seconds since), how much of the
// crack the patch covers, and the seal after the gates (dim until merged, uMerge 1).
uniform float uPulse;
uniform float uPatch;
uniform float uSeal;
uniform float uMerge;

varying vec2 vUv;
flat varying float vDisplay;
flat varying vec2 vFace;
flat varying float vY0;
varying float vRoof;
flat varying float vFaceId;
flat varying float vSeed;
flat varying float vState;
flat varying float vIndex;
flat varying float vStyle;
flat varying float vTier;
varying vec3 vNormal;
varying vec3 vWorld;
flat varying vec2 vAxis;
flat varying vec2 vSpan;
flat varying float vReach;
#ifdef FADE
flat varying float vClear;
#endif

// How far a window's glass sits back from the wall, and the room behind it, in world units.
const float REVEAL = 0.1;
const float ROOM = 0.7;

// Crack pixels are square, a cell of the Nexarise dot matrix, one storey tall.
const float CELL = 1.1;
const float PIXEL = 0.27; // half-width of a crack pixel, in cells

// 1 inside [lo, hi] along v, with edges softened over `aa` (about a pixel)
float bandAA(float v, float lo, float hi, float aa) {
  return smoothstep(lo - aa, lo + aa, v) * (1.0 - smoothstep(hi - aa, hi + aa, v));
}

vec3 wallColour(float style) {
  if (style < 0.5) return uBrick;
  if (style < 1.5) return uStone;
  if (style < 2.5) return uGlass;
  if (style < 3.5) return uDeco;
  return uTrim;
}

void main() {
  float isFocus = focusIs(vIndex);
  // the results' row: a negative state is its place in the row (skyline.ts). It stands in Nexarise
  // navy, and is dark until its towers turn.
  float isRow = 1.0 - step(-0.5, vState);
  float isGlass = step(1.5, vStyle) * (1.0 - step(2.5, vStyle));
  float isDeco = step(2.5, vStyle) * (1.0 - step(3.5, vStyle));
  float isTrim = step(3.5, vStyle);
  float wallFace = 1.0 - vRoof;
  // Per-building and per-face keys built from small whole numbers (the building's index folded
  // into a few hundred, and the face), so every hash below sees exact, modest inputs.
  vec2 buildingKey = vec2(mod(vIndex, 211.0), mod(floor(vIndex / 211.0), 97.0));
  float tone = hash21(buildingKey + 0.5);

  // Masses: graded light (fog.glsl `shade`), darker down in the street canyon and a touch
  // brighter high up, so towers separate from what stands in front of them
  vec3 n = normalize(vNormal);
  float moon = max(dot(n, normalize(MOON)), 0.0);
  float depth = mix(0.75, 1.0, smoothstep(0.0, 14.0, vWorld.y)) * mix(0.94, 1.08, smoothstep(14.0, 60.0, vWorld.y));
  // the wall ages: broad stains from the weather, darker towards the street, never one flat colour
  float weather = vnoise(vUv * vec2(0.42, 0.13) + buildingKey * 0.37);
  vec3 wall = mix(wallColour(vStyle), uGlass * 1.5, isRow) * (0.86 + 0.28 * tone) * (0.74 + 0.42 * weather);
  vec3 litWall = shade(wall, moon, uNight) * depth;
  // after dark the city lights its own walls from below: the glow off the streets, fading with height
  litWall *= 1.0 + 0.55 * uNight * exp(-max(vWorld.y, 0.0) / 16.0);
  // Roofs: gravel under the open sky, so they keep some light at night, with a parapet edge
  float gravel = 0.85 + 0.3 * vnoise(vUv * 7.0);
  float parapetEdge = 1.0 - smoothstep(0.06, 0.2, min(min(vUv.x, vFace.x - vUv.x), min(vUv.y, vFace.y - vUv.y)));
  vec3 roof = shade(uRoof * (0.9 + 0.3 * tone) * gravel, 0.5, uNight) + uSky * 0.08 + wall * 0.35 * parapetEdge;
  vec3 col = mix(roof, litWall, wallFace);
  // a crisp highlight down each corner, cool at night: the rim that separates one block from the next
  float corner = 1.0 - smoothstep(0.04, 0.14, min(vUv.x, vFace.x - vUv.x));
  col += (litWall * 0.12 + uMoonLight * 0.04 * uNight) * corner * wallFace;
  // Masonry up close: brick courses, or limestone joints in a running bond. Fades out with
  // distance before it can shimmer.
  float isBrick = 1.0 - step(0.5, vStyle);
  float isStone = step(0.5, vStyle) * (1.0 - step(1.5, vStyle)) + isDeco;
  vec2 course = vec2(vUv.x / 0.24, vUv.y / 0.085);
  course.x += 0.5 * step(0.5, fract(floor(course.y) * 0.5));
  float mortar = (1.0 - smoothstep(0.0, 0.12, fract(course.y))) + (1.0 - smoothstep(0.0, 0.05, fract(course.x))) * 0.6;
  vec2 block = vec2(vUv.x / 1.3, vUv.y / 0.55);
  block.x += 0.5 * step(0.5, fract(floor(block.y) * 0.5));
  float joint = (1.0 - smoothstep(0.0, 0.035, fract(block.y))) + (1.0 - smoothstep(0.0, 0.02, fract(block.x)));
  vec2 courseFw = fwidth(course);
  float near = 1.0 - smoothstep(0.25, 0.6, max(courseFw.x, courseFw.y));
  col *= 1.0 - (isBrick * mortar * 0.22 + isStone * joint * 0.16) * near * wallFace;

  // Windows. Glass towers are a curtain wall; masonry has punched windows; deco has narrow
  // windows between piers.
  float bay = mix(mix(0.95, 0.62, isGlass), 0.8, isDeco);
  vec2 g = vec2(vUv.x / bay, vUv.y / FLOOR);
  vec2 cell = floor(g);
  vec2 local = fract(g);
  vec2 faceKey = buildingKey * vec2(3.0, 5.0) + vec2(vFaceId * 7.0, vFaceId * 3.0);
  float faceSeed = faceKey.x + faceKey.y * 0.37;
  float hc = hash21(cell + faceKey);
  float cols = floor(vFace.x / bay);
  float upper = step(FLOOR * 1.25, vUv.y) * step(vUv.y, vY0 + vFace.y - 0.3);
  float inside = step(0.5, cell.x) * step(cell.x, cols - 1.5);
  vec2 lo = mix(mix(vec2(0.24, 0.2), vec2(0.07, 0.1), isGlass), vec2(0.32, 0.12), isDeco);
  vec2 hi = mix(mix(vec2(0.76, 0.8), vec2(0.93, 0.9), isGlass), vec2(0.68, 0.88), isDeco);
  vec2 fw = fwidth(g);
  vec2 aa = fw * 0.75;
  // how close the window is: below this it is a few pixels across, and its details would shimmer
  float close = 1.0 - smoothstep(0.1, 0.28, max(fw.x, fw.y));
  float win = smoothstep(lo.x - aa.x, lo.x + aa.x, local.x) * (1.0 - smoothstep(hi.x - aa.x, hi.x + aa.x, local.x))
            * smoothstep(lo.y - aa.y, lo.y + aa.y, local.y) * (1.0 - smoothstep(hi.y - aa.y, hi.y + aa.y, local.y));
  win *= inside * upper * wallFace * (1.0 - isTrim);

  // A facade display (display.glsl) takes over the windows inside its rectangle, a pixel at a time
  Display disp = displayNone();
  if (vDisplay > -0.5) disp = displayAt(int(vDisplay + 0.5), vUv, vFace, fw * vec2(bay, FLOOR));
  win *= 1.0 - disp.cell * wallFace;
  float own = (1.0 - disp.cell) * wallFace * (1.0 - isTrim); // the wall's own detail, where no display is

  // The view across the face, for depth: how far a point `d` behind the wall appears to shift. The
  // glass sits back in its opening, so the sides of the opening show as the view swings past.
  vec3 view = normalize(cameraPosition - vWorld);
  float facing = max(dot(n, view), 0.2);
  vec2 slant = vec2(dot(view, vec3(-n.z, 0.0, n.x)), view.y) / facing;
  vec2 back = slant / vec2(bay, FLOOR);
  vec2 onGlass = local - back * REVEAL * mix(1.0, 0.35, isGlass);
  float glass = bandAA(onGlass.x, lo.x, hi.x, aa.x) * bandAA(onGlass.y, lo.y, hi.y, aa.y);

  float litShare = mix(0.04, mix(0.38, 0.42, isGlass), uNight) * (0.6 + 0.7 * tone) * (1.0 - isRow);
  // flats light window by window; an office floor lights in zones of six bays at a time
  float zone = hash21(vec2(floor(cell.x / 6.0), cell.y) + faceKey.yx);
  // the city is lived in: now and then someone turns a light on or off, each window on its own clock
  float changes = hash21(cell + faceKey + floor(uTime / (16.0 + 40.0 * hc) + hc * 91.0));
  float lit = step(1.0 - litShare, mix(hc, zone, isGlass));
  lit = mix(lit, 1.0 - lit, step(0.94, changes) * (1.0 - isGlass)) * smoothstep(0.05, 0.35, uNight);
  // flats are mostly lamp-lit (warm cream, never amber); offices stay cool
  vec3 lamp = mix(uWindowCool, uWindowWarm, step(0.3, fract(hc * 13.7)) * (1.0 - isGlass));
  lamp *= mix(0.42 + 0.48 * fract(hc * 41.3), 0.55 + 0.2 * fract(zone * 23.1), isGlass);
  // an unlit window reflects a little of the sky, more at a grazing angle, and not evenly
  float fresnel = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  vec3 pane = mix(uWindowDark, uSky * 0.55, 0.08 + fresnel * 0.55);

  float sash = 0.0;
  vec3 paneLook = pane;
#ifdef DETAIL
  // Only for a window close enough to show it: most of the city is far away, and is spared all of this.
  if (close > 0.001) {
    // The room behind a lit window, seen through it: its depth moves with the view. Ceilings catch the
    // lamp; some flats have a drawn blind or curtains, some a dark shape in the room; a few are lit by a
    // flickering screen.
    vec2 span_ = hi - lo;
    vec2 inRoom = (local - back * ROOM - lo) / span_;
    vec2 onPane = (onGlass - lo) / span_;
    float notOffice = 1.0 - isGlass;
    float kind = fract(hc * 7.9);
    float ceiling = mix(0.62, 1.2, smoothstep(0.0, 1.0, inRoom.y));
    float blind = notOffice * step(0.8, kind) * smoothstep(0.55, 0.6, onPane.y);
    float slats = 0.92 + 0.08 * step(0.5, fract(onPane.y * 9.0));
    float curtains = notOffice * step(0.55, kind) * (1.0 - step(0.8, kind))
                   * (1.0 - smoothstep(0.1, 0.26, min(onPane.x, 1.0 - onPane.x)));
    float shape = notOffice * step(0.3, kind) * (1.0 - step(0.55, kind))
                * (1.0 - smoothstep(0.26, 0.3, inRoom.y)) * bandAA(inRoom.x, fract(hc * 3.1) * 0.5, fract(hc * 3.1) * 0.5 + 0.5, 0.02);
    float screen = notOffice * step(0.965, fract(hc * 53.3));
    float flicker = 0.75 + 0.25 * sin(uTime * (3.0 + 5.0 * hc) + hc * 40.0) * sin(uTime * 1.7 + hc * 9.0);
    lamp = mix(lamp * mix(1.0, ceiling, close), uWindowCool * 0.5 * flicker, screen);
    lamp *= 1.0 - close * (blind * 0.62 * slats + curtains * 0.55 + shape * 0.72);
    // The sash: two panes, one above the other, in a dark frame; offices have a slim mullion
    float frameEdge = 1.0 - smoothstep(0.0, 0.05, min(min(onPane.x, 1.0 - onPane.x), min(onPane.y, 1.0 - onPane.y)));
    float meeting = 1.0 - smoothstep(0.012, 0.03, abs(onPane.y - 0.52));
    float bar = 1.0 - smoothstep(0.012, 0.03, abs(onPane.x - 0.5));
    sash = max(frameEdge, mix(max(meeting, bar * step(0.5, fract(hc * 3.7))), bar * 0.8, isGlass)) * close;
    // an unlit pane catches the sky in soft streaks (the display's dark pixels keep the plain pane)
    paneLook *= 0.82 + 0.5 * vnoise(vec2(vUv.x * 1.4 + hc * 9.0, vUv.y * 0.35));
  }
#else
  lamp *= 1.0 - (1.0 - isGlass) * step(0.8, fract(hc * 7.9)) * smoothstep(0.55, 0.6, local.y) * 0.6;
#endif

  // the side of the opening, in shade, then the glass in its frame
  vec3 glassColour = mix(paneLook, lamp, lit) * (1.0 - sash * 0.72);
  vec3 reveal = litWall * 0.42 + lamp * lit * 0.12;
  col = mix(col, mix(reveal, glassColour, glass), win);

  // The stone around a masonry window: a sill catching the light, a lintel over it, and the weather's
  // streak below the sill. Fades out with distance, where the shader would only shimmer.
  float dressed = (1.0 - isGlass) * inside * upper * own;
  float sill = bandAA(local.y, lo.y - 0.07, lo.y - 0.015, aa.y) * bandAA(local.x, lo.x - 0.05, hi.x + 0.05, aa.x);
  float lintel = bandAA(local.y, hi.y + 0.012, hi.y + 0.075, aa.y) * bandAA(local.x, lo.x - 0.03, hi.x + 0.03, aa.x);
  col = mix(col, litWall * 1.5 + uStreetLight * 0.03 * uNight, max(sill, lintel * 0.7) * near * dressed);
  // a little of each lit room's light falls on the wall around its window
  vec2 outside = max(abs(local - (lo + hi) * 0.5) - (hi - lo) * 0.5, vec2(0.0));
  col += lamp * lit * (1.0 - smoothstep(0.0, 0.2, max(outside.x, outside.y))) * 0.08 * (1.0 - win) * own * inside * upper * uNight;
  // a faint cool rim where a wall turns away from the camera, after dark
  col += uMoonLight * pow(1.0 - max(dot(n, view), 0.0), 4.0) * 0.07 * uNight * wallFace;
  // a glass tower reflects the sky across its whole face
  col = mix(col, uSky * 0.45, isGlass * wallFace * fresnel * 0.4 * (1.0 - win * lit));

#ifdef DETAIL
  if (close > 0.001) {
    // Close up, masonry has more to it: a stone belt course every few floors with its shadow, drip marks
    // below the sills, and on a brick walk-up the iron of a New York fire escape.
    float belt = bandAA(mod(vUv.y, FLOOR * 6.0), 0.0, 0.12, aa.y * FLOOR);
    float beltShade = bandAA(mod(vUv.y, FLOOR * 6.0), FLOOR * 6.0 - 0.1, FLOOR * 6.0, aa.y * FLOOR);
    float masonry = (1.0 - isGlass) * own * upper * near;
    // and every floor is marked in the wall, a fine line of shadow under a course of stone
    float storey = 1.0 - smoothstep(0.0, 0.035, min(local.y, 1.0 - local.y));
    col *= 1.0 - storey * 0.26 * (1.0 - isGlass) * own * upper * close;
    col = mix(col, litWall * 1.28, belt * masonry);
    col *= 1.0 - beltShade * 0.3 * masonry;
    float drip = (1.0 - smoothstep(0.0, lo.y - 0.015, local.y)) * bandAA(local.x, lo.x, hi.x, aa.x) * step(0.35, fract(hc * 3.3));
    col *= 1.0 - drip * 0.2 * masonry * inside * (1.0 - win);
    // the fire escape: a landing at every floor and a ladder zig-zagging between them, on every other
    // stretch of six bays, standing a little off the wall so it throws a shadow
    float stretch = vUv.x / (bay * 6.0);
    float side = step(0.5, fract(floor(stretch) * 0.5)) * isBrick * own * upper * near * step(0.45, tone);
    vec2 onIron = vec2((fract(stretch) - 0.3) / 0.4, fract(vUv.y / FLOOR));
    float span2 = bandAA(onIron.x, 0.0, 1.0, aa.x * 0.6);
    float flip = step(0.5, fract(floor(vUv.y / FLOOR) * 0.5));
    float rung = abs(mix(onIron.x, 1.0 - onIron.x, flip) - onIron.y);
    float iron = span2 * max(max(bandAA(onIron.y, 0.0, 0.07, aa.y), bandAA(onIron.y, 0.26, 0.285, aa.y)), 1.0 - smoothstep(0.018, 0.04, rung));
    float ironShadow = span2 * bandAA(fract(onIron.y + 0.08), 0.0, 0.1, aa.y);
    col *= 1.0 - ironShadow * 0.4 * side;
    col = mix(col, uWindowDark * 0.7 + uStreetLight * 0.02, iron * side);
  }
#endif

  // Storefronts: a band of shop glass along the street, lit at night. (No dynamic branches in
  // this shader: under Direct3D they made it far slower, not faster.)
  {
    float shopBand = smoothstep(0.22, 0.3, vUv.y) * (1.0 - smoothstep(1.02, 1.1, vUv.y));
    float shopBay = step(0.12, fract(vUv.x / 2.2)) * (1.0 - step(0.9, fract(vUv.x / 2.2)));
    float shopLit = step(0.28, hash21(vec2(floor(vUv.x / 2.2), 0.0) + faceKey)) * (1.0 - isRow);
    vec3 shop = mix(uWindowWarm, uWindowCool, step(0.6, hash21(vec2(floor(vUv.x / 2.2) + 3.0, 1.0) + faceKey)));
    float bright = mix(0.18, 0.72, uNight);
#ifdef DETAIL
    if (close > 0.001) {
    // a shop has depth: brighter at the back ceiling, framed glass, a door, and a lit sign over it
    float inShop = (vUv.y - 0.3) / 0.72;
    float across = (fract(vUv.x / 2.2) - 0.12) / 0.78;
    float frames = 1.0 - smoothstep(0.02, 0.05, abs(fract(across * 3.0) - 0.5) - 0.44);
    float door = bandAA(across, 0.4, 0.58, 0.01) * step(0.5, hash21(vec2(floor(vUv.x / 2.2), 7.0) + faceKey));
    bright *= mix(0.42, 1.15, inShop) * (1.0 - frames * 0.8 * close) * (1.0 - door * 0.55 * close);
    float signRow = bandAA(vUv.y, 1.1, 1.24, 0.012) * bandAA(across, 0.06, 0.94, 0.01) * shopBay * shopLit * inside * own;
    col = mix(col, shop * 0.62 * mix(0.2, 1.0, uNight), signRow * close);
    }
#endif
    col = mix(col, mix(pane, shop * bright, shopLit), shopBand * shopBay * inside);
  }

  // Far away, a wall is drawn as its average, so the window grid never shimmers
  float blur = smoothstep(0.35, 0.85, max(fw.x, fw.y));
  float area = mix(0.3, 0.75, isGlass) * (1.0 - isTrim);
  vec3 average = mix(litWall, mix(pane, lamp, litShare * smoothstep(0.05, 0.35, uNight)), area);
  col = mix(col, average, blur * wallFace * upper);
  // the wall between a display's pixels steps back, so a word stays crisp on a wall the street has lit
  col *= 1.0 - 0.5 * disp.cell * wallFace;
  // the dark pixels of a display stay dark however far away it is
  col = mix(col, pane * 0.85, disp.dark * wallFace);

  // The street's light washes up the bottom of every wall at night
  col += uStreetLight * 0.17 * uNight * exp(-max(vWorld.y, 0.0) / 4.2) * wallFace;
  // and the sky catches the top edge of every parapet and setback
  float parapet = 1.0 - smoothstep(0.0, 0.22, vY0 + vFace.y - vWorld.y);
  col += uSky * 0.22 * parapet * wallFace * (1.0 - isTrim);

  // --- The story: an open finding is a crack up the street-level mass -----------------------
  {
  vec2 cu = vec2(vUv.x, vUv.y - vY0); // position on the tier's face
  vec2 cg = cu / CELL;
  vec2 ccell = floor(cg);
  vec2 clocal = fract(cg) - 0.5;
  // the sweep ignites a crack as the line passes it (scan.glsl)
  float crackOn = step(0.5, vState) * wallFace * (1.0 - step(0.5, vTier)) * scanIgnite(vAxis.x);
  float sealed = max(step(1.5, vState), isFocus * step(0.5, uSeal));
  float path = vFace.x * (0.5 + (vnoise(vec2(cu.y * 0.22, faceSeed)) - 0.5) * 0.55);
  float off = abs(cu.x - path) / CELL;
  float span = step(vFace.y * 0.18, cu.y) * step(cu.y, vFace.y * 0.92);
  float nearCrack = crackOn * span * (1.0 - step(1.6, off));

  // The patch, written from the bottom up: crack pixels below the line settle back into the grid
  // and stop flickering, in a neutral tone. Not lime: the fix is written but not yet verified.
  float patchLine = mix(vFace.y * 0.12, vFace.y * 0.96, uPatch);
  // a display owns its rectangle: the patch lights the windows round a word, never its pixels
  float patched = isFocus * step(0.001, uPatch) * (1.0 - step(patchLine, cu.y)) * (1.0 - sealed) * (1.0 - disp.cell);
  float settled = max(sealed, patched);

  float beat = floor(uTime * 7.0);
  vec2 slip = (vec2(hash21(ccell + beat), hash21(ccell - beat)) - 0.5) * 0.5 * (1.0 - settled);
  float crackSquare = 1.0 - smoothstep(PIXEL - 0.02, PIXEL + 0.04, max(abs(clocal.x + slip.x), abs(clocal.y + slip.y)));
  float flicker = mix(0.35 + 0.65 * step(0.3, hash21(ccell + beat * 0.37)), 1.0, settled);
  vec3 signal = mix(uOpen, uSealed, sealed) * crackLift(vIndex);
  // sealed but not merged: the lime is held low until a person merges it
  signal *= mix(1.0, mix(0.38, 1.0, uMerge), isFocus * step(0.5, uSeal));
  vec3 mended = uPixelLit * 0.55;
  col = mix(col, mix(signal * flicker, mended, patched), crackSquare * nearCrack);
  float line = crackOn * span * (1.0 - smoothstep(0.03, 0.09, abs(cu.x - path)));
  col = mix(col, mix(signal, mended, patched), line * (1.0 - sealed) * mix(0.9, 0.3, patched));
  col += signal * crackOn * span * exp(-off * 1.4) * 0.12 * (1.0 - patched);

  // The test fails: the crack flares, and a ring runs out across the wall from it
  float flare = exp(-uPulse * 3.0);
  float ring = (1.0 - smoothstep(0.0, 0.9, abs(off * CELL - uPulse * 9.0))) * exp(-uPulse * 1.6);
  col += uOpen * isFocus * crackOn * span * (1.0 - settled) * (flare * (nearCrack * 0.9 + 0.25) + ring * 0.55);

  // a far crack still reads as a warm smear on its wall
  col = mix(col, col + signal * nearCrack * 0.25, blur);
  }

  col *= focusDim(vIndex);

  // A tower of the results' row, once the light has reached it: its windows light in its result's
  // colour, held below the display's full strength so a numeral stands out on its own tower. (A
  // far wall lights evenly, so its window grid never shimmers.) The wall in the gap never turns.
  {
  float order = -vState;
  float turned = isRow * (1.0 - step(ROW_RUNS + 0.5, order)) * smoothstep(order - 1.0, order, uRowFront);
  vec3 result = mix(uSealed, uHold, step(uRowVerified + 0.5, order));
  float rowWin = mix(win * step(0.2, fract(hc * 29.1)), 0.42 * upper * wallFace, blur);
  // brighter as the night lifts, so the sealed towers stay lime against a dawn sky
  col = mix(col, result * (0.3 + 0.36 * fract(hc * 17.3)) * mix(1.9, 1.0, uNight), rowWin * turned);
  }

  // the lit pixels of a display are not dimmed with the building: a word stays readable when the
  // beat's focus is elsewhere. A pixel flashes white as the ripple reaches it.
  vec3 displayLit = mix(disp.colour * (0.9 + 0.45 * uNight), vec3(1.0), disp.flash * 0.55);
  col = mix(col, displayLit, disp.lit * wallFace);

  // The merge wave: as the lime front runs out along the streets it washes up the foot of every
  // wall it reaches and lights a third of the windows just behind it. Once merged, the sealed
  // tower's own windows light lime, so it stands alone in the dark city. (A far wall lights
  // evenly, so its window grid never shimmers.)
  {
  // a display's own pixels keep its word: the wave goes round them
  float other = (1.0 - isFocus) * (1.0 - disp.cell);
  float waveWin = mix(win * step(0.67, fract(hc * 29.1)), 0.2 * upper * wallFace, blur);
  col = mix(col, uSealed * (0.45 + 0.35 * fract(hc * 17.3)), waveWin * waveBehind(vWorld.xz) * other);
  col += uSealed * waveFront(vWorld.xz) * exp(-max(vWorld.y, 0.0) / 5.0) * 0.45 * wallFace * other;
  float towerWin = mix(win * step(0.3, fract(hc * 29.1)), 0.45 * upper * wallFace, blur);
  col = mix(col, uSealed * (0.55 + 0.45 * fract(hc * 17.3)), towerWin * isFocus * uLone);
  }
  // the scanner's line passes behind a display's word rather than washing it out
  col += scanLight(vWorld.x, normalize(vNormal).x) * (1.0 - disp.cell);
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
#ifdef FADE
  gl_FragColor.a = 1.0 - vClear;
#endif
  #include <colorspace_fragment>
}
