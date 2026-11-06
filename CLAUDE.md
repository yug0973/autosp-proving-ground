# CLAUDE.md — AUTOSP "The Proving Ground"

Project instructions and architectural guidelines for Claude. Follow these rules alongside `DESIGN.md`.

## 1. The Story The Page Tells
It starts in the bright Nexarise day sky, falls into the night city where the backlog lives, and rises into dawn once the fixes are made. **"Software that rises"** is the payoff. Every upgrade must serve that story or show a real step of the product (the failing test, the sandbox, the gates, the merge, the record). Nothing is added for decoration alone.

## 2. Core Architectural & Design Rules
- **Dependencies:** Pinned versions only. No new dependencies without explicit approval. Prefer Three.js, GSAP, Lenis, and Web Audio.
- **Colour carries meaning:**
  - `Orange` (`--signal-open`): open finding or failing exploit.
  - `Amber` (`--signal-hold`): needs a person or inconclusive.
  - `Lime` (`--signal-pass` / sealed): verified check, merged, sealed.
  - Never use signal colours decoratively.
  - The ground stays Nexarise navy and ink, never neutral grey.
- **No AI-template patterns:** No italic accent words, eyebrow labels, glass pill navs, card grids, gradient blobs, purple/neon cyberpunk, rain or neon puddle reflections.
- **The box:** each beat's panel is the one component (`styles/annotations.css`, `modules/annotations.ts`), adapted from Magic UI's Magic Card and Border Beam (MIT): a light on the edge follows the pointer, and a beam travels round it in the colour of the step's state. Panels stay where the cameras expect them. **Rejected by the owner:** full-width subtitles, facts pinned to objects, wide shade layers (they slid across the city with hard edges), and a bright paper strip. Check a whole scroll sweep before reporting, not only settled frames.
- **Honest Claims:** Use only numbers and statements already in the existing copy (e.g. 14/16 benchmark numbers). Never add or strengthen claims; keep benchmark caveats visible wherever numbers appear.
- **Legibility & Contrast:** Text on top of the 3D scene stays readable (body text at least 18px at 1440w, contrast >= 4.5:1, at most one panel per beat).
- **Labels:** Every interactive demo must carry an "Illustrative" label.
- **Accessibility & Reduced Motion:**
  - `prefers-reduced-motion`: every phase must have a static or instant version (no camera sweeps, no counting, static storyboard).
  - All visual-only effects are `aria-hidden="true"`, with real text in the DOM. Full keyboard and screen-reader accessibility.
- **Performance:**
  - Hold 60fps on mid-range desktop, 30fps floor on mobile.
  - High quality tier gets heavy effects (depth of field, post-processing); low tier gets cheap fallbacks (fog, vignette) or none.

## 3. Key Commands
- **Dev server:** `npm run dev` (starts on `http://127.0.0.1:5173`)
- **Typecheck & Build:** `npm run typecheck && npm run build`
- **Lint & Format:** `npm run lint` / `npm run format`
- **Smoke Tests:** `python tests/world.py --base http://127.0.0.1:5173`
- **Camera Suite:** `python tests/camera.py --base http://127.0.0.1:5173`
- **Display Suite:** `python tests/display.py --base http://127.0.0.1:5173`
- **Words Suite:** `python tests/words.py --base http://127.0.0.1:5173`
- **Scan Suite:** `python tests/scan.py --base http://127.0.0.1:5173`
- **Results Suite:** `python tests/results.py --base http://127.0.0.1:5173`
- **Dawn Suite:** `python tests/dawn.py --base http://127.0.0.1:5173`
- **Arrival Suite:** `python tests/arrival.py --base http://127.0.0.1:5173`
- **Panels Suite:** `python tests/panels.py --base http://127.0.0.1:5173`
- **Hero Suite:** `python tests/hero.py --base http://127.0.0.1:5173`
- **Phone Page Suite:** `python tests/light.py --base http://127.0.0.1:5173`
- **Buildings Suite:** `python tests/buildings.py --base http://127.0.0.1:5173`
- **Close Views:** `python tests/close.py <LABEL> --base http://127.0.0.1:5173`
- **Frame Times:** `python tests/frames.py --base http://127.0.0.1:5173`
- **Screenshots:** `python tests/shots.py <LABEL>`

## 4. Phase Status
1. ✅ **Phase 1: Cinematic Camera & Depth of Field** (`shots.ts`, `depth-of-field.ts`, verified via `tests/camera.py`).
2. ✅ **Phase 2: Facade Display System** (`display.ts`, `display-font.ts`, `display.glsl`, verified via `tests/display.py`).
3. ✅ **Phase 3: Beat Keywords Spelled by the City** (`words.ts`, `word-planner.ts`, verified via `tests/words.py`). The sandbox beat has no word: no tower fits from its camera.
4. ✅ **Phase 4: Scanner Sweep for Backlog Beat** (`scan.ts`, `scan.glsl`, verified via `tests/scan.py`).
5. ✅ **Phase 5: Results as a Skyline** (`skyline.ts`, verified via `tests/results.py`).
6. ✅ **Phase 6: Dawn Ending & Company on Tower** (`atmosphere.ts`, `skyline.ts`, verified via `tests/dawn.py`).
7. ❌ **Phase 7: Pixel Transitions & Pixel Cursor**. Dropped: the owner decided against it. Do not re-add.
8. ✅ **Phase 8: Arrival Handoff from Nexarise** (`modules/arrival.ts`, verified via `tests/arrival.py`).
9. ⏳ **Phase 9: Optional Web Audio Sound** (ambient city bed, fingerprint ticks, merge thud, refusal buzz).
10. ⏳ **Phase 10: Lighthouse & Final Polish**. Mobile bottom sheets are replaced by the phone page.

## 5. Two Experiences, One URL
Under 60rem wide, or without WebGL or script: the **calm phone page** (`.calm` in `index.html`, `styles/light.css`, `modules/light.ts`, verified via `tests/light.py`). Words between a sun behind them and mist in front, over one sky that goes from night to dawn; smooth scroll with Lenis; the pilot form. Each step takes its own shape from what it says. **No city, no 3D, no GSAP, no flattened copy of the cinematic page**: the owner rejected that. Otherwise: the **cinematic page** (`modules/cinematic.ts`). They share the message and the form, not the design. Chosen once per load. The sky is rendered by `tests/make-sky.py`.
