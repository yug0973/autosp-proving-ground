# CLAUDE.md — AUTOSP: "One Fix" (the front door) and "The Proving Ground" (the Annex, at /tour)

Project instructions and architectural guidelines for Claude. Follow these rules alongside `DESIGN.md`.

## 0. Two pages since 8 November (the owner's brief, `PLAN.md`)
- **`/` is "One Fix"**: an exhibition of one SQL-injection finding and how it was closed, room by room (`index.html`, `src/exhibit/`). It is the same exhibition on every screen size, with no WebGL, canvas, GSAP or video background, at most 60 KB of JS gzipped, and a quiet mode. Its rules:
  - **Colour:** amber is only the finding, viridian only a fix that passed, red only a failure or a refusal. The walls are limestone, projection slate, celadon, paper and deep viridian. Tokens and measured contrast are in `src/exhibit/exhibit.css` and `PLAN.md`.
  - **Type:** Zodiak (room titles) with Switzer (placards and body). Code uses the system monospace.
  - **Placards** hold real facts. Never render a placeholder ("To confirm" or similar) to visitors. A part whose facts are missing is left out, and the rooms are renumbered so no gap shows.
  - **Avoid:** dark SaaS with neon, cream with terracotta serif, identical rounded cards, gradient washes, all-caps eyebrows, decorative monospace, and "→" on links.
- **`/tour/` is "The Annex"**: the 3D city below, unchanged, reached by a link and never the front door (`tour/index.html`). Its suites take `--base http://127.0.0.1:4174/tour/`. Everything in §1–§5 below describes the Annex.

## 1. The Story The Annex Tells
It starts in the bright Nexarise day sky, falls into the night city where the backlog lives, and rises into dawn once the fixes are made. **"Software that rises"** is the payoff. Every upgrade must serve that story or show a real step of the product (the failing test, the sandbox, the gates, the merge, the record). Nothing is added for decoration alone.

## 2. Core Architectural & Design Rules
- **Dependencies:** Pinned versions only. No new dependencies without explicit approval. Prefer Three.js, GSAP, Lenis, and Web Audio.
- **Colour carries meaning:**
  - `Orange` (`--signal-open`): open finding or failing exploit.
  - `Amber` (`--signal-hold`): needs a person or inconclusive.
  - `Lime` (`--signal-pass` / sealed): verified check, merged, sealed.
  - Never use signal colours decoratively.
  - One accent beside them, `--accent` (Nexarise sky blue): focus rings, links, the form's progress, the badge, the fingerprint chips at the record, Python keywords in diffs and "Click to follow this fix". It never means a state.
  - All colour and type tokens: `src/styles/world-tokens.css`, tabled in `DESIGN.md` §3. Headlines are Clash Display semibold.
  - The ground stays Nexarise navy and ink, never neutral grey.
- **No AI-template patterns:** No italic accent words, eyebrow labels, glass pill navs, card grids, gradient blobs, purple/neon cyberpunk, rain or neon puddle reflections.
- **The box:** each beat's panel is the one component (`styles/annotations.css`, `modules/annotations.ts`), adapted from Magic UI's Magic Card and Border Beam (MIT): a light on the edge follows the pointer, and a beam travels round it in the colour of the step's state. Panels stay where the cameras expect them, except three chapters the owner asked to vary on 7 November: Reproduce (a wide terminal under its words, `.track--stack`), Record (statement and chain centred on one line, `.chapter--centred`) and Results (the heading on its own at the top right, `.results__title`). **Rejected by the owner:** full-width subtitles, facts pinned to objects, wide shade layers (they slid across the city with hard edges), and a bright paper strip. Check a whole scroll sweep before reporting, not only settled frames.
- **No rail:** the right-hand step rail and its mini-map were removed by the owner on 7 November. Do not add a step rail or a map back.
- **The checks beat:** the fix flies off the sandbox roof through three barriers of lit pixels in the sky (`world/gates.ts`), timed to the three checks in the box (`lib/gates.ts`): a barrier turns lime as its check passes and strikes orange when it refuses, and a refused fix flies back. The owner chose this version on 7 November.
- **Honest Claims:** Use only numbers and statements already in the existing copy (e.g. 14/16 benchmark numbers). Never add or strengthen claims; keep benchmark caveats visible wherever numbers appear.
- **Legibility & Contrast:** Text on top of the 3D scene stays readable (body text at least 18px at 1440w, contrast >= 4.5:1, at most one panel per beat).
- **Labels:** One corner badge on the cinematic page ("Demo data — every scene is illustrative", `.demo-badge`) stands for every scene; the boxes no longer repeat it (owner's choice, 7 November). The tower's company field keeps its own Illustrative note.
- **Accessibility & Reduced Motion:**
  - `prefers-reduced-motion`: every phase must have a static or instant version (no camera sweeps, no counting, static storyboard).
  - All visual-only effects are `aria-hidden="true"`, with real text in the DOM. Full keyboard and screen-reader accessibility.
- **Performance:**
  - Hold 60fps on mid-range desktop, 30fps floor on mobile.
  - High quality tier gets heavy effects (depth of field, post-processing); low tier gets cheap fallbacks (fog, vignette) or none.

## 3. Key Commands
- **Exhibition (`/`):** `python tests/exhibit.py --base http://127.0.0.1:4174` (contrast frame by frame, route, moments, guestbook, signing, form, accessibility, phone, budget)
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
- **Accessibility Audit:** `python tests/audit.py --base http://127.0.0.1:5173`
- **Immersion Suite:** `python tests/immersion.py --base http://127.0.0.1:5173` (crack tooltips, hero crack glow, run skip, diff copy, shortcuts, sound)
- **Buildings Suite:** `python tests/buildings.py --base http://127.0.0.1:5173`
- **Close Views:** `python tests/close.py <LABEL> --base http://127.0.0.1:5173`
- **Frame Times:** `python tests/frames.py --base http://127.0.0.1:5173`
- **Screenshots:** `python tests/shots.py <LABEL>`

## 4. Phase Status
1. ✅ **Phase 1: Cinematic Camera & Depth of Field** (`shots.ts`, `depth-of-field.ts`, verified via `tests/camera.py`).
2. ✅ **Phase 2: Facade Display System** (`display.ts`, `display-font.ts`, `display.glsl`, verified via `tests/display.py`).
3. ✅ **Phase 3: Beat Keywords Spelled by the City** (`words.ts`, `word-planner.ts`, verified via `tests/words.py`). The sandbox and checks beats have no word: no tower in plain sight fits from their cameras, and words never go on a building the city has faded out of the line of sight.
4. ✅ **Phase 4: Scanner Sweep for Backlog Beat** (`scan.ts`, `scan.glsl`, verified via `tests/scan.py`).
5. ✅ **Phase 5: Results as a Skyline** (`skyline.ts`, verified via `tests/results.py`).
6. ✅ **Phase 6: Dawn Ending & Company on Tower** (`atmosphere.ts`, `skyline.ts`, verified via `tests/dawn.py`).
7. ❌ **Phase 7: Pixel Transitions & Pixel Cursor**. Dropped: the owner decided against it. Do not re-add.
8. ✅ **Phase 8: Arrival Handoff from Nexarise** (`modules/arrival.ts`, verified via `tests/arrival.py`).
9. ✅ **Phase 9: Optional Web Audio Sound** (`modules/sound.ts`, verified via `tests/immersion.py`): off by default, a toggle in the strip, remembered in the browser; a low city hum, a tick when the pointer finds a crack, a soft chime on the merge. Built as the upgrade's item 30 on 7 November.
10. ✅ **Phase 10: Lighthouse & Final Polish** (7 November, the upgrade's Phase 5): desktop Lighthouse 99 / 100 / 100 / 100 on the build; shaders compile in parallel before the first draw (`world.ts`); a low-power fallback to the low tier; a simple view (`?view=simple`); `tests/audit.py`. Mobile bottom sheets are replaced by the phone page.

## 5. Two Experiences, One URL
Under 60rem wide, or without WebGL or script: the **calm phone page** (`.calm` in `index.html`, `styles/light.css`, `modules/light.ts`, verified via `tests/light.py`). Words between a sun behind them and mist in front, over one sky that goes from night to dawn; smooth scroll with Lenis; the pilot form. Each step takes its own shape from what it says. **No city, no 3D, no GSAP, no flattened copy of the cinematic page**: the owner rejected that. Otherwise: the **cinematic page** (`modules/cinematic.ts`). They share the message and the form, not the design. Chosen once per load. The sky is rendered by `tests/make-sky.py`.
