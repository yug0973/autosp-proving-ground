# PLAN: "One Fix", the AUTOSP landing page as an exhibition

An exhibition of one SQL-injection finding (CWE-89 in `app/repositories/invoices.py`) and how it was closed, room by room. The 3D city moves to `/tour` and becomes "The Annex", reached by a link and never the front door. The previous upgrade plan is in `notes/plan-upgrade-2026-11.md`, and `CHANGELOG.md` records what it built.

## What the repo gives us

- **Stack.** Vite 8, TypeScript (strict), vanilla DOM, CSS cascade layers. Dependencies: three, GSAP, Lenis. Tests are Playwright, written in Python.
- **The city** (`index.html` cinematic page plus `src/modules/cinematic.ts`, `src/world/*`) moves whole to `tour/index.html`. It keeps its own tests, pointed at `/tour/`.
- **Already working, reused:**
  - `modules/apply.ts`: the form, sent through Web3Forms with inline validation and states. The key is in `.env.local`.
  - `lib/fixes.ts` and `lib/gates.ts`: the CWE-89 test, the diff, the careless fix and the gate reports.
  - `modules/record.ts`: real SHA-256 fingerprints, computed in the browser.
  - `modules/merge-step.ts`: the hold with pointer, Space and Enter, plus a screen-reader path.
  - `public/sample-evidence-pack.pdf`.
- **Not reused on this page:** three.js, GSAP and the WebGL world (all `/tour` only). The budget is ≤ 60 KB gzipped of JS, and they don't fit it. Lenis (about 4 KB gzipped) is used only outside quiet mode and touch.

## Decisions for you (your brief meets earlier rules)

| | The brief | What stands today |
|---|---|---|
| Front door | The exhibition at `/`, the city at `/tour` | CLAUDE.md §1: the page *is* the sky → night city → dawn story |
| Phones | The same exhibition, not a lesser one | CLAUDE.md §5: phones get the calm page, with no city |
| Colour meaning | Amber = the finding, viridian = fixed, red = failing or rejected; walls in limestone, slate, celadon, paper and viridian | Orange = open, amber = needs a person, lime = verified; the ground "stays Nexarise navy, never grey" |
| Where the careless fix stops | Its beam "stops at the first gate" | `lib/gates.ts` (the city's story, and the evidence pack): stripping quotes passes the reproduction test (1 passed) and the suite (214 passed), and the **third** gate, a fresh static scan, refuses it ("SQL still built from strings"). That is also the more believable story. I'd make the beam pass two arches and stop at the third, unless you say otherwise |
| Placeholders | Never render "To confirm" | Phase 2 put dashed "To confirm" tags on the page |

### Decided (8 November)

- **Type:** A, Zodiak (room titles) with Switzer (placards and body).
- **Gates:** the careless fix passes two arches and is refused at the third, the fresh static scan, as the repo's data has it.
- **Form:** Web3Forms stays, since it is already live.
- **Missing facts:** the demo video and screening room, the curator, the FAQ's cost and self-hosting answers, and Room 1's severity line are left out until you send them. Each switches on from `src/exhibit/site.ts`.
- **The rest of the table:** the brief's direction (exhibition at `/`, city at `/tour`, the same exhibition on phones, the new colour meanings). CLAUDE.md will be updated to match.

## Facts only you can give (nothing is invented; until each arrives, its part is left out, not stubbed)

- **Form endpoint.** Web3Forms is already live (key in `.env.local`). Keep it, or name Formspree, Resend or your API.
- **The 2-minute demo video and its poster.** Until they exist, the "Watch the 2-minute demo" button and the screening room are not rendered.
- **Curator:** name, photo path, email. Until then, Room 9 is not rendered.
- **FAQ:** cost after the pilot and self-hosting. Until answered, those two questions are not shown. The rest come from facts you have already given (Python on GitHub; Semgrep, CodeQL, Snyk Code, osv-scanner; it never merges by itself; where code runs).
- **Room 1's severity.** The acquisition record shows rule, CWE, file and line. A severity line needs the level your scanner gave this finding; it is left off until you name it.
- **Gallery Rules: GitHub App scopes and retention.** Shown as "agreed per design partner", exactly as you asked.
- **Footer:** privacy and terms pages.

## Status

- **Phase 1, done (8 November):** the plan, the specimen and the palette, and a static build of every room. The city moved to `/tour/`, where all 13 of its suites pass.
- **Phase 2, done (8 November):** the route line, the amber dot, the walls and quiet mode (`src/exhibit/route.ts`, `quiet.ts`; `tests/exhibit.py`, 22 checks).
  - **A change from the brief, for legibility.** The page's colour blends only across the pale walls (limestone, celadon, paper). The two dark rooms keep their own walls and are entered through a doorway. Measured frame by frame, a pale-to-dark blend dropped text to 3.3:1 on a laptop and 2.7:1 on a phone; with the doorways, every word stays at or above 4.5:1 at every scroll position.
  - **The line reads on both kinds of wall.** It inverts against the wall behind it, dark on pale and pale on dark. The dot sits on its own layer and keeps its amber.

- **Phase 3, done (8 November):** each room's moment (`proof.ts`, `clean-room.ts`, `gates.ts`, `moment.ts`); `tests/exhibit.py`, 33 checks.
  - **The Proof:** the run types out once, line by line, with Run it again and a spoken status.
  - **The Clean Room:** the wire snaps, the read-only seal stamps on and a time bar drains. The bar shows no number, because no limit has been stated. Then the patch is written and the case empties.
  - **The Gates:** a beam from each case runs through three arches, across on a wide screen and down on a narrow one. The careless fix stops at the third with a red bar and "Rejected"; AUTOSP's runs through with "Accepted". The results are said aloud, and lighting a case frames it without dimming the other.
  - **No layout shift:** lines, verdicts and results waiting their turn keep their space, so the page never moves while a room plays.
  - **Moments start by position:** each begins when its room's top reaches 70% of the way down the screen, so tall rooms on phones still play.

- **Phase 4, done (8 November):** the Guestbook and the Signing (`guestbook.ts`, `signing.ts`); `tests/exhibit.py`, 44 checks.
  - **The Guestbook:** the printed fingerprints are the real chain, recomputed in the browser (`lib/sha256.ts`, shared with the Annex). Tampering rewrites entry 2 to "passed". Fingerprints 2 to 4 are recomputed, run once in ink (an SVG turbulence filter, then removed) and stay red as "No longer matches". Restore dries them back.
  - **The Signing:** hold by pointer, Space or Enter, and the signature draws along the line. Letting go early retracts it. A full hold merges: the dot turns viridian, main becomes one line, a phone gives a small tap, and entry 5 is written into the Guestbook with its own sealed fingerprint. A screen reader's activation signs at once, and Undo puts it back.

- **Phase 5, done (8 November):** the form (`rsvp.ts`), the facts still to come (`site.ts`), the phone's apply bar (`apply-bar.ts`), and the accessibility, mobile and performance passes. Lighthouse went from 90 / 96 / 100 / 100 to 100 / 100 / 100 / 100 on mobile, and from 100 / 96 / 100 / 100 to 100 / 100 / 100 / 100 on desktop. `tests/exhibit.py` has 55 checks. `CHANGELOG.md` covers every phase.

## Rooms → build

| Room | Wall | Holds | Moment (once, on entry) | Reuses |
|---|---|---|---|---|
| 0 Entrance | limestone | Glass case with the amber line, headline, one plain line, buttons, Annex link | The amber glow breathes (opacity, 6 s); the route line starts at the case | — |
| 1 The Finding | limestone | Acquisition record: rule, CWE, file, line | — | `lib/fixes.ts` |
| Screening room | slate | Poster, click to play | — (no bytes until play) | needs the video |
| 2 The Proof | projection slate | The test, the run typing once, FAILED in muted red, Run it again | Line-by-line typing | `modules/reproduce.ts` (re-skinned) |
| 3 The Clean Room | celadon | The case sealed: network line snaps, read-only seal, timer, 1-line diff, case empties | Snap, seal, diff, empty | `lib/fixes.ts` |
| 4 The Three Gates | limestone | Two cases (careless / AUTOSP) with a code comparison; three arches; beams; Accepted / Rejected placards; toggle | Beams travel (stroke-dashoffset) | `lib/gates.ts` |
| 5 The Guestbook | paper | Five ink entries with SHA-256; Tamper / Restore; PDF link | Ink bleeds once on tamper (SVG turbulence, removed after) | `modules/record.ts`, `hash-log.ts` |
| 6 The Signing | deep viridian | The PR as a document; hold to sign; signature path draws | Signature draws while held; the dot turns viridian; the route merges into main | `modules/merge-step.ts` (hold logic) |
| 7 Results Wall | limestone | 16 cast tiles (14 viridian, 2 unpainted), plaque "0 merges made by AUTOSP", the caveat full size | Tiles set in once | — |
| 8 Gallery Rules | limestone | May / May not, from your brief | — | — |
| 9 The Curator | limestone | Photo, two lines, email | — | needs your facts |
| 10 Invitation | paper | RSVP form; programme Week 1 / 2 / 4 | — | `modules/apply.ts` |
| 11 Visitor Information | limestone | Information-desk FAQ; exit footer (Nexarise, the Annex, privacy, terms) | — | `modules/faq.ts` |

**The three threads:**

- **Route line:** one SVG path in the left gutter, drawn by `stroke-dashoffset` from scroll.
- **Amber dot:** placed along the path with `getPointAtLength`.
- **Wall colour:** one `--wall` custom property interpolated between room colours.

All three run from one `requestAnimationFrame` loop. Each room's moment runs under an IntersectionObserver, plays once, then stops.

## Files

- `index.html`: the exhibition. Each room is a `<section class="room" data-wall="…">` with a placard.
- `tour/index.html`: the city, moved as it is. A `vite.config.ts` gains the second input.
- `src/exhibit/`: `main.ts`, `route.ts` (line, dot, walls), `quiet.ts`, `proof.ts`, `clean-room.ts`, `gates.ts`, `guestbook.ts`, `signing.ts`, `results.ts`, `sticky-cta.ts`.
- `src/styles/exhibit/`: `tokens.css` (the palette and the type below, one table), `rooms.css`, `cases.css`.
- `tests/exhibit.py`: still frames (no half-faded text), quiet mode, keyboard, live regions, no placeholder text, JS budget, mobile.

## Quiet mode

It turns on for any of these: `prefers-reduced-motion`, Save-Data, `deviceMemory ≤ 4`, or `hardwareConcurrency ≤ 4`.

When quiet: no Lenis, no filters, the route line drawn whole, every room in its final state. The interactive demos still work.

## Palette (measured; `specimen.html`)

| Wall | Hex | Text on it (contrast) |
|---|---|---|
| Limestone | `#E2DFD6` | ink `#16191E` 13.2 · ink-soft `#4A4F57` 6.2 · amber `#8A5300` 4.7 · viridian `#1E6B52` 4.8 · red `#A3271D` 5.5 |
| Projection slate | `#26303F` | chalk `#EEF0EA` 11.6 · chalk-soft `#B9C0C2` 7.2 · amber `#F0B357` 7.2 · viridian `#7FD6B4` 7.7 · red `#F29A90` 6.2 |
| Celadon | `#D3DFD0` | ink 12.8 · ink-soft 6.0 · amber 4.6 · viridian 4.6 · red 5.3 |
| Paper | `#EAE4D6` | ink 13.9 · ink-soft 6.5 · amber 5.0 · viridian 5.1 · red 5.8 |
| Deep viridian | `#17352E` | chalk 11.5 · chalk-soft 7.2 · amber 7.1 · viridian 7.7 · red 6.2 |

Every pair clears AA (4.5:1) for body text. The amber glow behind the exhibit line is `#E8A43A`, a light, never text.

## Type (picked: A; `specimen.html`)

- **A. Zodiak + Switzer** (Fontshare): a sharp gallery serif with Swiss placards.
- **B. Bricolage Grotesque + Schibsted Grotesk** (Google Fonts, open licence): a contemporary art centre.
- **C. Gloock + Hanken Grotesk** (Google Fonts, open licence): an ink-drawn serif for a written record.

Code stays in a system monospace, so it adds no font file. The chosen pair is self-hosted as at most 4 subset files.

## Phases (each ends with your review)

1. This plan, the specimen, the palette, then a static build of every room with final copy (after your type pick).
2. Route line, amber dot, wall interpolation, quiet mode.
3. The Proof typing, the Clean Room seal, the gates beams and placards.
4. Guestbook tamper with ink bleed, hold to sign.
5. Form backend, mobile pass, accessibility pass, Lighthouse before and after, CHANGELOG.md.

## Budget checks, every phase

- JS ≤ 60 KB gzipped for `/`, measured from the build's manifest.
- Animate only transform, opacity and stroke-dashoffset.
- LCP < 2.0 s and CLS < 0.05 on Lighthouse's mobile profile.
- Lighthouse mobile Performance ≥ 85, Accessibility ≥ 95.
