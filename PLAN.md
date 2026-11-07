# Plan: AUTOSP landing page upgrade

## What the repo is

- **Framework:** none. Vite 8, TypeScript (strict), plain DOM modules. One `index.html` holds both experiences.
- **3D:** three.js 0.186, hand-written (no R3F). The world is `src/world/` (`world.ts` drives it; `city.ts`, `shots.ts` cameras, `scan.ts`, `display.ts` facade displays, `words.ts`, `skyline.ts`, `tear.ts`), bridged to the page by `src/modules/world-stage.ts`.
- **Scroll and camera:** Lenis + GSAP (`modules/scroll.ts`). Each chapter is a `<section>` (`.track`, sticky) whose scroll progress (`lib/track.ts`, `modules/tracks.ts`) drives the camera through ranges in `world/shots.ts`.
- **Chapters:** hero `.beat--sky` → descent → `#backlog` → `#pick` → `#reproduce` → `#sandbox` → `#gates` → `#merge` → `#record` → `#results` → `#apply`, each with its own step module (`pick.ts`, `reproduce.ts`, `sandbox-step.ts`, `gates-step.ts`, `merge-step.ts`, `record.ts`, `numerals.ts`).
- **Styling:** plain CSS in cascade layers: `world-tokens.css` (tokens), `base.css`, `world.css` (cinematic), `annotations.css` (the box, form, counters), `light.css` (phone page).
- **Form:** `modules/apply.ts` (composes a mailto), `modules/stepper.ts` (one step at a time).
- **Two experiences:** under 60rem wide, or without WebGL or script, visitors get the calm phone page (`.calm`, `modules/light.ts`), with no city and no 3D. Several mobile items below land there, not on the cinematic page.
- **Tests:** Playwright suites in `tests/*.py` (world, camera, display, words, scan, results, dawn, arrival, hero, panels, light, buildings).

## Where the brief meets rules you set earlier (please decide)

These come from your `CLAUDE.md`, `DESIGN.md` and earlier decisions in this project. I won't silently override either side.

| Item | Brief asks | Earlier rule or decision |
|---|---|---|
| 1 | Eyebrow "AUTOSP · Autonomous Security Platform" above the H1 | "No eyebrow labels" (CLAUDE.md) |
| 2 | Remove the white line sweeping the city | That line is the backlog scanner sweep (Phase 4, approved): the line that lights each crack and counts the findings |
| 3 | "Blurred backdrop" scrims | Glass is banned; wide shade layers were rejected for sliding across the city with hard edges |
| 5 | "Pill backdrop" for the rail | "No glass pill navs" |
| 8 | Step 1 team, step 2 you | Built yesterday the other way round (you, team, scanners, check and send) |
| 17 | One corner badge instead of "Illustrative" on every card | "Every interactive demo must carry an Illustrative label" |
| 20 | A second accent colour | "Colour carries meaning; never decorative". An accent outside the three signals is fine if it never means a state |
| 22–23 | Cursor spotlight, crack hover glow | Phase 7 (pixel cursor, pointer ripple) was rejected |
| 31 | Preloader before the hero | The hero already shows its text and button within 1 s; a preloader would delay that, against the brief's own definition of done |
| 33, 35 | Simple view; mobile at 375 / 768 | Phones and portrait tablets already get the calm phone page; the cinematic page never runs below 960 px |

### Decided (7 November)

- **1:** no eyebrow. The expansion goes in the sub-line: "AUTOSP, the Autonomous Security Platform, …".
- **2:** the scanner sweep stays, redrawn as a softer, thinner beam with a trailing glow, so it reads as a scan.
- **3:** tight scrims, sized to each text block and moving with it. No blur, nothing across the city.
- **5:** the rail's backdrop is square-cornered and solid.
- **17:** badge only. The per-box "Illustrative" lines go; the CLAUDE.md label rule now names the badge.
- **19:** vary three chapters, same box: Reproduce (wide terminal), Record (centred statement), Results (heading out of the box, top right).
- **20:** Clash Display for headlines (semibold: the bold ran its letters together), and Nexarise sky blue `#8ab4ff` as the one accent, never a state.
- **23:** no visible spotlight; cracks near the pointer glow a little, hero only, never on touch.
- **24:** the mini-map sits above the rail, on the same solid backing; hidden under 60rem and at the form.
- **27:** the waiting / running / passed states go on the existing rail; no second sticky bar.
- **31:** skipped; the hero keeps showing at once.
- **21:** already done in Phase 1 (the sub-line expands AUTOSP).

### Status

- **Phase 1: done (7 November).** Built on top of last night's uncommitted work (gates flight, Web3Forms form), which the owner chose to keep.
- **Phase 5: done (7 November). All five phases are done; CHANGELOG.md summarises every change.** Lighthouse desktop before 77/72 · 97 · 100 · 91, after 99 · 100 · 100 · 100.
- **After Phase 4 (7 November), the owner's call:** the right-hand rail and the mini-map on it are removed (so items 24 and 27 are gone with them), and the Record chapter is centred: its statement and its chain on one centre line.
- **Phase 4: done (7 November).** Crack tooltips with click to follow (22); cracks near the pointer brighten on the first screen, nothing drawn (23); the run types its command, flashes its failures and can be skipped (25); a highlighted diff with Copy patch, its added line lime once every check passes (26); magnetic primary buttons with a press (28); J, K, M held and ? (29; the arrow keys keep scrolling); optional sound (30). No preloader (31). Severity is not shown in the tooltip: the page has no severity data and none was invented.
- **Phase 3: done (7 November).** One corner badge replaces the per-box Illustrative lines; the steps' fingerprints are small chips that light in sky blue once the record is reached; Reproduce, Record and Results have their own layouts; Clash Display semibold for headlines and `--accent` (#8ab4ff), tabled in DESIGN.md §3. The face is wider than Cabinet Grotesk: the phone footer name went from 26vw to 21vw, and tight negative tracking was removed everywhere.
- **Phase 2: done (7 November), done.** Two-step form, no Gmail address on screen, success words and a booking button (hidden until there is a link), one "Before you apply" box (week-by-week plan, access, comparison, questions) that fades as it rises so it never shares the screen with the form's box, a sample evidence pack drawn from the page's own demo fix (`tests/make-evidence-pack.py`), a founder note and footer links. The phone page has the plan, the access and the questions before its form, and the same footer. Its form stays on one page.
- **Regressions from last night's work, fixed:** the tower words were switched off (restored); the gates camera climbed and swung too fast (the climb off the roof now has its own stretch of scroll, and the swing to the side ends with the chapter); the form test now accepts the field's extra error link.

## Facts only you can give (placeholders until then)

No numbers, scopes or names will be invented. These stay as clearly marked placeholders until you provide them:

- Form backend (7): Web3Forms is wired. Still needed: the reply-from address (`src/lib/site.ts`, `replyFrom`).
- Booking link (9): Cal.com or Calendly URL (`src/lib/site.ts`, `bookingUrl`; the button shows once it is set).
- GitHub App scopes, where code runs, data retention (10).
- FAQ answers: cost after the pilot, time to first verified PR, self-hosting (11).
- The real pilot timeline (12).
- Comparison facts, especially "time to start" (13).
- Sample evidence pack (14): a two-page sample marked "illustrative" is in `public/`; the final pack format is to confirm.
- Founder name, photo and note (15).
- Footer routes: Security, Privacy, Terms, Contact (16). They link to `/security`, `/privacy`, `/terms` and `/contact`, which do not exist yet.

## Item → files

### Phase 1: first impression and readability
1. Hero overlay: `index.html` (`.beat--sky`), `world.css` (hero), `modules/reveal.ts`, `modules/scroll.ts` (the two CTAs). New H1 and sub-line, a secondary "See how it works ↓" and a scroll cue that fades as the descent begins. The hero already fades as the visitor falls.
2. The line: `world/scan.ts`, `modules/world-stage.ts` (`driveScan`), `shaders/scan.glsl`, `tests/scan.py`. Per your answer: remove, or keep it off the hero and make it read as a scanner.
3. Scrims and contrast: `world-tokens.css` (`--mist-300` → #C9CED8 equivalents), `world.css` (`.beat__text`, `.track__text`, `.beat__note`, `.hold__hint`), `tests/panels.py` (pixel contrast, which already reads every box).
4. Transition overlaps: `world.css` (`.track__panel` `--shown`, `--reveal`), `modules/tracks.ts`, `modules/world-stage.ts` (label avoidance), `tests/panels.py` sweep (one more check: no two beats' panels or texts on screen at once).
5. Rail: `index.html` (`.rail`), `modules/rail.ts`, `world.css` (`.rail`). Backdrop, click to scroll (it already links), progress fill, `aria-current`.
6. Dead scroll: `world.css` (`.descent__gap`, `.track` heights), `world/shots.ts` (camera ranges are shares of each section, so they follow), `tests/camera.py`.

### Phase 2: trust and conversion
7. `modules/apply.ts` (fetch to the backend, states), `index.html` (status region), `annotations.css`, `light.ts` and `.calm-form` (the phone page uses the same backend).
8. `index.html` form steps, `modules/stepper.ts` (reorder; the tower already follows the company field), `tests/panels.py`, `tests/world.py`.
9. `index.html` success state, `modules/apply.ts`.
10–13, 15. New sections before `#apply` in `index.html`, styled in `annotations.css` (`world.css` for layout), mirrored in the phone page (`.calm`, `light.css`). FAQ: native `<details>` with one open at a time (`modules/faq.ts`).
14. `public/sample-evidence-pack.pdf` (placeholder), link in `#record`.
16. `index.html` `.foot` and `.calm-foot`.

### Phase 3: repetition and brand
17. `index.html` (remove `.panel__note` lines), a fixed badge in `annotations.css`.
18. `annotations.ts` (`.tape__fp`), `annotations.css`.
19. `world.css` / `annotations.css` per chapter (three chapters get new layouts). The camera framing in `shots.ts` must be checked for each.
20. `world-tokens.css` (tokens), `public/fonts`. Two or three typeface options for you to choose from first.
21. `index.html` hero.

### Phase 4: immersion
22. `world/world.ts` (screen hit-test on findings, which already project to the screen), `modules/world-stage.ts` (tooltip, click → `#pick`).
23. `world/world.ts` + `shaders/facade.frag.glsl` (a pointer uniform), hero only, not on touch.
24. `modules/minimap.ts` (2D canvas from `city.buildings` and the camera), hidden below 60rem.
25. `modules/reproduce.ts` (it already types its run line by line), `annotations.css` (flash).
26. `modules/gates-step.ts` (highlighting, line reveal, Copy patch).
27. `modules/pipeline.ts`, `world.css` (sticky stepper synced to `trackProgress`).
28. `annotations.css` + `modules/annotations.ts` (magnetic hover, press feedback).
29. `modules/keys.ts` (J/K, arrows, M, ? overlay; ignored in fields).
30. `modules/sound.ts` (Web Audio, toggle in the strip, `localStorage`). This is Phase 9 of the roadmap.
31. `index.html` + `modules/world-stage.ts` (only if you still want it, see the table above).

### Phase 5: performance, accessibility, mobile
32. `world/world.ts` still mode, `world.css`: crossfades between still frames.
33. A toggle in the strip that opens the calm page (`lib/experience.ts` + the head script, `?view=simple`).
34. `modules/world-stage.ts` (sustained frame time → quality tier), `world/world.ts` (DPR, building count).
35. The calm page at 375 and 768 (`tests/light.py`), and the cinematic page between 960 and 1280.
36. Audit across `index.html` and the modules; `tests/*` gain the checks.
37. Lighthouse before and after (`npx lighthouse`), on the build.

## Working method

Each phase: build, typecheck, lint, the test suites on a production build, a full scroll sweep reviewed frame by frame, then a summary. I stop after each phase until you say "continue". `CHANGELOG.md` at the end.
