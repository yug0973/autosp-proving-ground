# The world: build plan

One continuous three.js scene; scroll moves the camera through it. Text stays in the DOM over
the canvas. Built one module at a time, each finished (typecheck, build, browser check) before
the next starts.

1. ✅ **Sky descent and the city.** Nexarise-blue sky and cloud decks, the drop through them to
   dusk and night, a city built from the dot matrix (windows are pixels), open findings as
   orange-red cracks labelled with their CWE, the quiet top strip and the first three beats.
2. ✅ **Pick a finding.** SQL injection, XSS or IDOR; the camera pushes into that building and the
   code diff appears as a small panel.
3. ✅ **Reproduce.** The cracked pixels fail a test: a short red pulse and the failing assertion.
4. ✅ **The sealed sandbox.** A glass volume drops over the building; orbitable; the fix is written
   inside it (no internet, read-only file system).
5. ✅ **Three gates.** The camera passes three light barriers; the failing case is refused at one
   and sent back.
6. ✅ **Hold to merge.** The crack is sealed but dim until the visitor presses and holds; the pixels
   turn lime and rise. This is also the call to action.
7. ✅ **Record, results, pilot form.** The hash-chained log, the 14/16 numbers with caveats, the
   form; then the mobile (8 to 10 screens) and reduced-motion storyboard pass.

Rules: colour only carries state (open, hold, sealed); no glass pill, card grids, gradient blobs,
eyebrows, italic accent words or two-part headings; mono only for real code; every demo says
it is illustrative.

State shared between modules lives in `src/lib/story.ts` (the chosen finding); the code for each
finding is in `src/lib/fixes.ts`. The proposed fix is shown in neutral colours until module 6
seals it in lime.

Tests: `python tests/world.py --base http://127.0.0.1:5173` walks the whole story on desktop, a
390px phone (which must stay 8 to 10 screens) and reduced motion, then checks the page without
script. The tests for the earlier page are kept in `tests/legacy/`.

## New York upgrade (2026-10-30)

The dot-matrix city became New York: `src/world/grid.ts` defines a Manhattan grid (long
east-west blocks, one-way avenues and cross streets) shared by JavaScript and, as #defines, by the
shaders. `city.ts` plans walk-ups, pre-war blocks (setbacks, cornices, water tanks), deco towers
(stepped tiers, spires) and glass towers per lot, with a Midtown core behind the findings and
height caps under the camera's path. `streets.ts` paints roads, lanes, crosswalks, sidewalks and
streetlight pools from world position; `traffic.ts` moves cars (with headlight and tail-light
points) and pedestrians in closed form in their vertex shaders. `src/modules/reveal.ts` adds the
GSAP motion layer (line reveals, settles, the results count-up).

Colour rule kept: windows are cool white or pale cream, tail lights a dim red, no yellow cabs and
no red or amber signals, so orange-red, amber and lime still only mean open, hold and sealed.

Performance notes: the building and prop materials come in pairs, and only the CLEARING variant
may discard (a discarding shader loses early depth testing); instances draw nearest first; the
sky dome draws after the city. No dynamic branches in facade.frag: under Direct3D (ANGLE) they made
it far slower. GPU time is about 5 to 10 ms a frame on this laptop's integrated GPU. Headless
Chrome on this machine loses its WebGL context after 10 to 30 s regardless; a real browser does
not, so take screenshots from fresh page loads (each capture within a few seconds of loading).
`?test&no=cars,lamps,people,streets,city,ground,props,masses` hides parts of the scene for measuring.

Polish (2026-10-30): towers keep out of the findings' ring (Midtown sits behind it); offices light
in zones of six bays per floor; masonry shows brick courses, stone joints and window sills up
close (faded out with distance); roofs are gravel with a sky-lit parapet; the street wash on walls
is stronger; night asphalt is dark with crisp lamp pools. The line-of-sight clearing now removes
whole pieces (a tier, a tank, a spire) whose column the sightline passes near, aimed at the middle
of the focused building from wherever the camera stands, so blockers fade away instead of showing
cut holes, and the close-up, sandbox and merge views all see the building.

## Phase 1: cinematic camera and depth of field (2026-10-31)

The shots and the depth of field already existed (`src/world/shots.ts`, `depth-of-field.ts`); the
audit of them found the camera whipping and not reversing, and Phase 1 fixed that.

What was wrong, measured by scrolling the whole page down and back at 1440x900 and reading the
camera after every step (`tests/camera.py`), in world units per 100 px of scroll (the descent, the
fastest shot on purpose, peaks at about 10):

| Beat           | Before | After | Cause                                                           |
| -------------- | ------ | ----- | --------------------------------------------------------------- |
| gates (camera) | 101    | 26    | double ease, 230 px; the fix climbed 6 times faster than it ran |
| merge          | 71     | 12    | parked for 900 px, then 225 px to dive                          |
| outro rise     | 41     | 15    | double ease                                                     |
| sandbox        | 23     | 9     | double ease                                                     |
| pick           | 19     | 10    | `cubicInOut`                                                    |

Scrolling back also landed up to 60 units from where scrolling down had been (the sandbox's
unbounded `drift`); now it is exact (0.00) with the sway off.

Decisions:

- Every camera timing lives in `shots.ts`: the overview pose, where the camera comes over the city,
  and the gates (`chaseIn`, `sideOut`), merge (`enter`) and outro (`rise`) moves. A move is eased once,
  there; the timelines in `lib/` and `world-stage.ts` hand over linear progress.
- A move's range is in its section's scroll progress, and negative means before the section has
  reached the top of the screen. The gates and merge moves start as their panel slides up.
- The fix's rise takes 40% of its trip (was 12%), and the gates are placed as shares of the run, so
  they stand exactly where they did.
- `drift` (unbounded, on the clock) is now `sway`, 0.05 rad over 18 s. `?test&sway=off` holds it
  still, as `?test&dof=off` does for the blur.
- The gates beat has its own speed cap (28): the camera rides the fix, so it moves as fast as the fix.
- The low-tier vignette is the ink token, and fades in with the night, so the day sky is clean.

Checks: `python tests/camera.py --quality high` and `--quality low` (34 and 26 checks). Open item:
`.stage::after` still hard-codes `rgb(5 8 22)`; it should use the token (outside Phase 1).

## Phase 2: facade display system (2026-11-02)

Any tower's wall can show a bitmap (a word or a number) in its own windows. Phases 3, 4, 5 and 6 use
it. The pieces: `src/world/display.ts` (slots, ripple, placement), `display-font.ts` (the pixel
font and `sanitiseLabel`), `shaders/display.glsl` (inside the facade shader).

How it works:

- A display belongs to one tier and one face of one building. Inside its rectangle the facade
  shader replaces the window cells with square pixels on a grid of its own (the pitch, one storey by
  default, snapped to floor lines): a lit pixel is a lit window in the display's colour, a dark pixel
  a dark one. The old windows and sills under it are not drawn.
- Up to 8 displays, bitmaps up to 128 by 128, in one R8 atlas. Changing a bitmap re-uploads the
  atlas (128 kB); the ripple costs nothing to move.
- One `reveal` per display, 0 to 1, plays the ripple: each pixel waits in proportion to its
  distance from a start point (with scatter), flashes white as it arrives, and plays off the same
  way in reverse. `to(1, seconds)` animates it, `set(x)` lets the scroll drive it, and with reduced
  motion every change is instant.
- Tones: neutral (white), sealed (lime), open (orange), amber (needs a person), all from the palette.
  Lit pixels are applied after the focus dimming, so a word stays readable when a beat's focus is
  elsewhere. A far display fades to its average coverage so it cannot shimmer.
- Which faces carry a display is set on the CPU (`City.setDisplaySlot`, an attribute a box), so
  the vertex shader only reads it and the fragment shader skips the block everywhere else. The
  first version searched the slots in every fragment and cost about 45% more per frame.
- On every face `vUv.x` runs to the viewer's left; the display measures from the right-hand
  coordinate so text is not mirrored.

What a word needs: facades are 3 to 11 units wide, so a word is stacked, one letter above the next
(SANDBOX is 4 pixels wide and 41 tall). At full pixels that needs a tower about 48 units tall, and
shorter words fit more towers. At the street-level beats (the pick above all) few towers stand in
plain sight, so Phase 3 chooses a tower for each beat, and keeps words clear of the text panels,
which cover parts of the world.

Checks: `python tests/display.py` (font and label rules, slots, ripple, reduced motion, tones, and
legibility: at each beat's camera the word is put on the tower it reads best on and the screenshot
is read back at every visible pixel and compared with the bitmap), and
`python tests/display-frames.py DIR` (a ripple sequence and a frame a tone).

Open item: in software rendering the final shader is still about 17% slower per frame on the high
tier and about 37% on the low tier than before Phase 2 (a CPU-shaded renderer, so only the
direction means anything). Measure on a real GPU and a phone.

## Phase 3: beat keywords spelled by the city (2026-11-03)

Seven words (`WORDS` in `src/world/words.ts`): BACKLOG, TEST, SANDBOX, GATES, MERGE, RECORD, RESULTS.
The beat at the middle of the screen (`world-stage.ts`, `beatWords`) sets the active word; it ripples
on from the foot of its tower over 1.6 s and ripples off over 0.9 s when the beat leaves (instant with
reduced motion). The real headline is untouched, and the world canvas is aria-hidden.

Where a word goes (`on` in `WORDS`):

- 'tower': `word-planner.ts` (a generator run 4 ms a frame) chooses, among towers roughly in view, the
  biggest pixel for the distance (towers far beyond the focus distance rank lower), at the crown, with
  at least 60% of its pixels on screen, in plain sight (no other box in the way) and outside a
  keep-clear mask (the page's lines, cards, buttons, header and rail links, and the focused
  building's box). A beat's camera is still moving when it arrives, so a word that finds no tower is
  planned again every 0.7 s, up to 8 times, from the camera as it is then. Results are cached per
  finding.
- 'subject': TEST goes on the failing tower itself. The close beats' cameras are in the street among
  low buildings, with no other tower in view that a word fits on without covering the subject or the
  panels. The renderer clears whatever stands in the sightline to the focused building, so building
  occlusion is ignored for these words (the boxes say it is hidden; it is not).

Measured (tests/words.py, software GL, 1440x900, depth of field on, read back off the canvas alone):

| Beat    | Word    | Result                                                        |
| ------- | ------- | ------------------------------------------------------------- |
| backlog | BACKLOG | 98% read back, stacked 3x41, 112 units, 7.6 px a pixel        |
| test    | TEST    | 100%, on the failing tower, 19 units, 22.9 px a pixel         |
| sandbox | SANDBOX | none (see below)                                              |
| gates   | GATES   | 100%, 119 units, 11.1 px                                      |
| merge   | MERGE   | 86.7% (a 21x5 row, 71 units, 5.2 px); the bar is 85% with DoF |
| record  | RECORD  | 100%, 105 units, 14.7 px                                      |
| results | RESULTS | 100%, 62 units, 12.9 px                                       |

Also passing: the word clears and gives its slot back when the beat is left; with reduced motion it
is on at once; no script errors.

Open:

- SANDBOX has no word. On the sandboxed tower the planner reports it in sight but it does not appear
  in the frame (the sandbox seems to draw its own copy of the building over the real one; not
  confirmed), and no other tower in view fits it from that camera. In the last run that beat was
  reported "cleared before it could be read" and not understood.
- The pixel test passes, but at page scale the words are understated, and in the gates frame the word
  still sits behind the rail labels and under the lime gate sheets (gate meshes and the sandbox glass
  are not in the occluder list). The keep-clear mask uses the layout at planning time, so it can go
  stale in the scrolling chapters. Judge the words in `tests/output/phase3/word-*-page.png`.
- The Phase 2 frame-time overhead is unmeasured on a GPU.

## Phase 4: scanner sweep for the backlog beat (2026-11-04)

One thin line of light crosses the city, left to right, once, when the backlog beat arrives.
Each crack ignites orange as the line passes it, the finding's label appears with it, and a counter
in the beat counts the cracks the line has passed, up to every finding in the scene.

How it works (`src/world/scan.ts`, `shaders/scan.glsl`):

- The line is a plane of world x. `SCAN` holds the data: 3.4 seconds to cross; it runs from 70 units
  before the first finding to 45 past the last (what the beat's camera sees of the city, so the
  findings light one after another through the middle of the sweep and not all at once); and the
  line's width, glow and ignition softness.
- The facade, street and crack-glow shaders read three shared uniforms (`uScanX`, `uScanOn`,
  `uScanColor`). A crack is drawn only behind the line (`scanIgnite`), the glow sprites likewise, and
  the line itself is added to every surface (`scanLight`). Walls that face along x lie inside the
  plane from edge to edge, so they are held back: otherwise the line lights them as slabs.
- The line is the Nexarise lit white: neutral, so it is not mistaken for a finding.
- The count is `world.findings.length`, read from the scene, never written into the page. The number
  that counts up is `aria-hidden`; a visually hidden line gives the total once ("7 findings in this
  scene"). The number is orange because every crack is an open finding.
- The stage (`world-stage.ts`, `driveScan`) plays it once, on the first frame the backlog beat is
  current. Before that the cracks are dark. A visitor who is already past the beat (a link to a later
  step) or who asks for reduced motion gets every crack lit and the final count at once, with no line.
  `?test&scan=0.5` holds the sweep at a point, for screenshots and tests.

Checks: `python tests/scan.py [--shots DIR]` (28 checks: the count is read from the scene; dark
before, lit after, rising in steps (0, 3, 4, 7 at 0, 0.45, 0.6, 1); labels wait for their crack; played
live it climbs to every finding and plays once; reduced motion is lit and final at once; the number is
at least 18px and hidden from screen readers; no script errors).

Open: the frame-time cost of the extra shader work is not measured (software rendering only, and the
Phase 2 overhead is still unmeasured on a GPU). On a phone the line shows on the low tier but only
one or two labels fit beside the text.
