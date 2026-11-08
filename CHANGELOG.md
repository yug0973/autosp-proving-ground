# Changelog

## "One Fix": the exhibition at `/` (8 November 2026)

The front door is now an exhibition of one SQL-injection finding (CWE-89 in `app/repositories/invoices.py`) and how it was closed, room by room. The 3D city moved, unchanged, to `/tour/` as "The Annex", reached by a link. `PLAN.md` holds the decisions as they were made.

### Phase 1: plan, type, palette, a static build

- **PLAN.md.** The previous upgrade plan moved to `notes/plan-upgrade-2026-11.md`.
- **Type.** A specimen of three pairings (`specimen.html`). Your pick, Zodiak (room titles) with Switzer (placards and body; its figures are tabular), is self-hosted as four files, about 80 KB. Code uses the system monospace.
- **Palette.** Limestone, projection slate, celadon, paper and deep viridian walls. Ink and chalk for text; amber only for the finding, viridian only for a pass, red only for a failure. Every text colour is measured at 4.5:1 or better on every wall.
- **The exhibition.** Every room in its final copy, with no motion: Entrance, Finding, Proof, Clean Room, Three Gates, Guestbook, Signing, Results Wall, Gallery Rules, Invitation and Visitor Information.
  - The real numbers carry the caveat at full size.
  - Gallery Rules say "agreed per design partner" for scopes and retention.
  - The careless fix is refused at the third gate, as you chose.
- **The Annex at `/tour/`.** A `vite.config.ts` builds both pages, and all 13 of the city's suites pass there.

### Phase 2: the route line, the amber dot, the walls, quiet mode

- **The route line.** A hand-drawn line from the glass case down the left margin, drawing itself just ahead of the visitor. It merges into a faint "main" line at the Signing.
- **The amber dot.** It rests at each room's title and travels at the doorways.
- **The walls.** One page colour blends across the pale walls. The two dark rooms keep their own walls and are entered through a doorway.
  - This departs from the brief, for legibility. A blend from pale to dark dropped text to 3.3:1 on a laptop and 2.7:1 on a phone. With doorways, every word on screen stays at 4.5:1 or better at every scroll position.
  - The line inverts against the wall so it reads on both pale and dark.
- **Quiet mode.** On for reduced motion, Save-Data, 4 GB of memory or less, or 4 cores or fewer; `?quiet` and `?quiet=0` force it. Each room keeps its own wall, the line is drawn whole, and every room shows its final state.

### Phase 3: each room's moment

Each moment plays once, when its room's top reaches 70% of the way down the screen.

- **The Proof.** The run types line by line, with FAILED lines in muted red. "Run it again" replays it, and its status is announced.
- **The Clean Room.** The network wire snaps, a read-only seal stamps on, and a time bar drains. The bar has no number, because no limit has been stated. The patch is written, and the case empties.
- **The Three Gates.** A beam from each case runs through three arches: across on a wide screen, down on a phone.
  - The careless fix stops at the third arch with a red bar and "Rejected". AUTOSP's fix runs through with "Accepted".
  - The results are said aloud.
  - Lighting a case frames it, and the other case stays fully readable.
- **No layout shift.** Lines, results and verdicts waiting their turn keep their space, so the page never moves while a room plays.

### Phase 4: the Guestbook and the Signing

- **The Guestbook.** The printed fingerprints are the real SHA-256 chain, recomputed in the browser (`lib/sha256.ts`, shared with the Annex).
  - Tampering with entry 2 recomputes fingerprints 2 to 4. Their ink runs once (an SVG turbulence filter, removed afterwards), and they stay red as "No longer matches".
  - Restore dries them back.
- **The Signing.** Hold by pointer, Space or Enter, and the signature draws itself; letting go early retracts it.
  - A full hold merges: the dot turns viridian, main becomes one line, a phone gives a small tap, and entry 5 is written into the Guestbook with its own sealed fingerprint.
  - A screen reader's activation signs at once, as a plain button would.
  - Undo resets it.

### Phase 5: form, mobile, accessibility, performance

- **The form** (`rsvp.ts`). It sends to Web3Forms with every answer, and there is no mailto anywhere.
  - Each required field says what it needs under itself, tied to the field with `aria-describedby` and `aria-invalid`, and focus moves to the first one.
  - Sending shows on the button. A failure keeps every answer and says what to do. Success thanks the visitor in place, with their email.
  - Without a Web3Forms key built in, the form says it cannot send yet and sends nothing. Without script, it posts to Web3Forms directly.
- **The facts still to come** (`src/exhibit/site.ts`). The demo video and screening room, the curator (Room 9, which renumbers the rooms after it), Room 1's severity, the cost and self-hosting answers, and the privacy and terms links each appear only once filled in. Each was checked rendering once with sample values, which were then removed. The video loads nothing until Play.
- **Phones.** An "Apply for the free pilot" bar comes up after the Entrance and steps aside at the form. Every tap target is 44 px or taller, inputs are 16 px or more, and there's no sideways scroll at 375, 390 or 768 wide.
- **Accessibility.** One h1, with headings that never skip a level. Every control has a name, and every drawing is hidden from assistive technology. Every focus stop shows a ring, and every animated thing has a meaningful static state. Code panels lost an `aria-label` that `<pre>` may not carry, and have hidden captions instead.
- **Performance.** The route line placed its dot from a lookup table with one geometry query every 6 px of a page about 10,000 px long, run three times at load. That held a throttled phone up for over a second. It now uses 400 samples and lays out only when the page really changes size.

**Lighthouse,** on the production build (Lighthouse 12.8.2, mobile and desktop presets):

| | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| Mobile, before Phase 5 | 90 | 96 | 100 | 100 | 1.8 s | 360 ms | 0 |
| Mobile, after (two runs) | 100 | 100 | 100 | 100 | 1.5 s | 0 ms | 0 |
| Desktop, before Phase 5 | 100 | 96 | 100 | 100 | 0.4 s | 0 ms | 0 |
| Desktop, after | 100 | 100 | 100 | 100 | 0.4 s | 0 ms | 0 |

The page's script is about 6.5 KB gzipped against a 60 KB budget. It loads no WebGL, canvas, GSAP or video bytes. Only transform, opacity, stroke-dashoffset and the one wall colour move.

### Changed or not done, and why

- **Pale-to-dark wall blends** were replaced by doorways into the two dark rooms, for legibility, measured as above.
- **The careless fix stops at the third gate**, not the first, as you chose: it matches the repo's data and the Annex.
- **The clean room's timer has no number**, because no time limit has been stated.
- **Smooth scrolling (Lenis) was not added.** Native scrolling already keeps every moment smooth, and it would have cost budget for no gain.
- **60 fps on an Intel UHD 620 laptop was not measured on such a machine.** Nothing on the page animates layout, and nothing runs between scrolls.
- **A real finger holding on a touch screen was not tested**, because the automation can only tap. The hold uses pointer events with long-press and scroll-cancel blocked, so try it once on a phone.

### Still needed from you

- **The Web3Forms access key.** This checkout has no `.env.local`, so the built form cannot send yet. Put `VITE_WEB3FORMS_KEY=...` in `.env.local` (never committed) and rebuild.
- **In `src/exhibit/site.ts`:**
  - the demo video and its poster;
  - the curator's name, role, photo, two lines and email;
  - Room 1's severity;
  - the answers on cost after the pilot and on self-hosting;
  - privacy and terms URLs.
- **GitHub App scopes and retention.** Until you confirm them, Gallery Rules says "agreed per design partner".

### Tests

`tests/exhibit.py` (55 checks; 57 when built with a key, which adds the send, failure and thanks paths) covers:

- contrast measured frame by frame through a full scroll on a laptop, a phone and in quiet mode;
- the route and the dot;
- each moment and its final state;
- the Guestbook and the Signing;
- the form;
- accessibility;
- phone tap targets and the apply bar;
- the script budget, and that no placeholder, mailto or Gmail address appears.

The city's suites run against `/tour/`.

---

## The landing page upgrade (6 to 7 November 2026), now the Annex at `/tour/`

The brief's 37 items, phase by phase, as built between 6 and 7 November 2026, plus what was skipped or changed and why. `PLAN.md` holds the decisions as they were made; `DESIGN.md` §3 holds every colour and type token in one table.

Before the upgrade began, the owner kept the uncommitted work from the night of 6 November: the fix flying through three barriers at the checks, and the one-page Web3Forms form. Its regressions were fixed first: the tower words were switched back on, and the checks camera, which climbed and swung too fast, was slowed.

### Phase 1: first impression and readability

1. **Hero.** New headline, "Verified fixes for the findings your scanner keeps reporting." The sub-line spells out AUTOSP (the Autonomous Security Platform), as the owner chose, instead of an eyebrow label above the headline. A second button, "See how it works ↓", and a scroll cue that fades once the visitor scrolls.
2. **The white line.** Kept, as the owner chose: it is the backlog scanner. It is redrawn as a thinner beam with a soft trail, so it reads as a scan.
3. **Readability.** Tight dark scrims behind each block of chapter text, sized to it and moving with it. No blur, and nothing across the city. Secondary text is brighter (`--mist-300`). The worst chapter text measured off the pixels is 5.1:1.
4. **No overlapping UI.** A leaving chapter's words and box fade before the next ones arrive. The results box waits for its own section and leaves before the form. A test now sweeps the whole page and fails if two boxes are ever on screen together.
5. **Rail.** A solid, square backing, a fill showing progress, and `aria-current`. *Later removed by the owner (see the note after Phase 4).*
6. **Dead scroll.** The gaps in the descent are shorter (110svh to 65svh). Camera shots and tests are anchored to their sections, so they follow.

### Phase 2: trust and conversion

7. **Form backend and states.** Web3Forms is the backend: per-field errors tied to their fields, a sending state, error and success states. No Gmail address appears anywhere on screen; it is left only in the no-script fallback's `mailto:` link, which the page never displays. On success: "Thanks — we'll reply within 1 business day", plus the visitor's email. The reply-from address can be added in `src/lib/site.ts`.
8. **Two steps.** Step 1 is your team (size, scanners, Python services); step 2 is you (name, work email, company, notes). A progress bar and "Step 1 of 2". Next checks only that step. Back keeps the answers. Without script, both steps show as one form. The tower answers each step: it shows the team size, then the company.
9. **Book a call.** A "Book a 20-min call" button after sending. It stays hidden until a booking link is set in `src/lib/site.ts`.
10–13. **"Before you apply".** One box before the form:
    - the pilot week by week;
    - what AUTOSP can access;
    - a comparison table;
    - seven questions, one open at a time (native `<details name>`, with a script fallback).

    Answers use only the page's existing wording. Every fact the owner has not given is a dashed "To confirm" tag, never a guess. The box fades as it rises, so it never shares the screen with the form, and it slides under the top bar cleanly.
14. **Sample evidence pack.** `public/sample-evidence-pack.pdf`: two pages built only from the demo fix the page already shows, marked "illustrative" on every page. `tests/make-evidence-pack.py` regenerates it. It is linked from the Record chapter.
15. **Founder note.** A slot above the form, with placeholders and no photo.
16. **Footer.** Product, How it works, FAQ, Security, Privacy, Terms, Contact and Nexarise, on both pages. Security, Privacy, Terms and Contact point to routes that do not exist yet.

The phone page also gained the plan, the access summary, the questions and the footer.

### Phase 3: repetition and brand

17. **One badge.** A single corner badge, "Demo data — every scene is illustrative", replaces the line on every box. This was the owner's choice, and CLAUDE.md now names the badge. It steps aside at the footer, and the city's labels avoid it.
18. **Fingerprint chips.** Each step's fingerprint is a small muted chip ("Entry 2 · fead"). The chips light up in sky blue once the Record chapter is reached, and they link to it.
19. **Three new layouts, in the same box.**
    - Reproduce: the test run as a wide terminal under its words, with a leader line from either side.
    - Record: a centred statement over its chain.
    - Results: the heading on its own at the top right.
20. **Type and accent.** Headlines are Clash Display semibold, with self-hosted files credited in `public/fonts/CREDITS.md`. The bold was tried, and its letters ran together. One accent, Nexarise sky blue (`#8ab4ff`), which never means a state. Every colour and type token is in one table in `DESIGN.md` §3.
21. **Expand AUTOSP.** Already done in Phase 1.

### Phase 4: immersion

22. **Crack tooltips.** A crack under the pointer shows its CWE number, its name and, for the three you can follow, its file and "Click to follow this fix". The click goes to Pick with that finding chosen, and the hovered crack glows brighter.
23. **Hero glow.** On the first screen only, cracks near the pointer brighten a little. Nothing visible follows the pointer, and nothing happens on touch screens. This was the owner's choice: pointer effects were rejected before.
24. **Mini-map.** Built, then removed by the owner (see the note below).
25. **Test run.** The command types out, the output follows line by line, the failing lines flash orange once, and Skip (or a click on the output) shows the rest.
26. **Checks diff.** Highlighted Python, lines revealed in order, Copy patch (a unified diff on the clipboard). The added line turns lime only once every check passes.
27. **Step states.** Built on the rail, then removed with it.
28. **Primary buttons.** They lean slightly towards the mouse and give under a press. No lean with reduced motion.
29. **Keyboard shortcuts.** J and K for the next and previous chapter, M held to merge at the merge step, and `?` for the list, also opened from the footer. Shortcuts never fire while typing in a field. The ↑/↓ arrows keep scrolling the page, because taking them over would break keyboard scrolling.
30. **Sound.** Off by default, toggled from the top bar and remembered in the browser. A low city hum, a tick on a crack, and a chime on merge, all made with Web Audio: no files and no new dependency. This also completes the roadmap's Phase 9.

**After Phase 4, the owner's call:** the right-hand rail and the mini-map on it were removed, and the Record chapter was centred on one line, statement and chain together. CLAUDE.md now says not to add a rail or a map back.

### Phase 5: performance, accessibility, mobile

32. **Reduced motion.** The camera never travels: each chapter has a still frame, which now fades in over the last instead of cutting.
33. **Simple view.** A "Simple view" link in the top bar opens the calm page at any width (`?view=simple`): a normal scrolling page with no city, GSAP or WebGL. A "Back to the tour" link returns. It has no static images of the scenes, because the owner rejected a flattened copy of the cinematic page.
34. **Low power.** If the high tier spends most of three seconds below 40 frames a second, the world is rebuilt at the low tier once, for the rest of the visit: a lower pixel ratio, fewer buildings and trees, a simpler sky. Automated browsers are excluded so tests stay stable; `?test&lowpower` triggers it on purpose.
35. **Mobile.** The calm page is tested at 375, 390 and 768 wide. The hold-to-merge button now takes the touch whole (`touch-action: none`), so a finger that drifts no longer cancels the hold. The brief's "rail as a bottom progress bar" no longer applies, because the rail was removed.
36. **Accessibility audit (`tests/audit.py`).** Both pages:
    - one h1, with no skipped heading levels;
    - every control named and every field labelled;
    - errors tied to their fields;
    - the 3D scene hidden from assistive technology;
    - every focus stop shows a ring, and tabbing goes down the page.

    Fixed along the way:
    - the line-split animation put an `aria-label` on a paragraph, so paragraphs now keep a hidden copy of their words instead;
    - fingerprint buttons' names now start with their visible text;
    - `robots.txt` was being served as the page's HTML.
37. **Lighthouse,** desktop preset, on the production build:

| | Performance | Accessibility | Best practices | SEO | Total blocking time |
|---|---|---|---|---|---|
| Before (two runs) | 77, 72 | 97 | 100 | 91 | 450–610 ms |
| After (three runs) | 99, 99, 99 | 100 | 100 | 100 | 30–40 ms |

The big gain: the world's first frame compiled every shader on the main thread, a 627 ms freeze. The shaders now compile in parallel before the first draw, which cut that frame to 52 ms.

Phone page on Lighthouse's mobile preset (for the record): Performance 99, Accessibility 96, Best practices 100, SEO 100. The one accessibility finding is axe reading dark text against the page's base colour. That text actually sits on the bright dawn sky, a background image axe cannot see. The phone suite measures that contrast off the real pixels, and it passes.

### Skipped, or changed from the brief

- **Eyebrow label (1).** Not added. "No eyebrow labels" is a standing rule, so the owner chose to put the expansion in the sub-line.
- **Removing the white line (2).** Kept and redrawn: it is the scanner sweep.
- **Blurred scrims and pill backdrops (3, 5).** Glass and pills are banned, and wide shade layers were rejected before. Tight scrims and a square, solid backing instead.
- **Mini-map (24) and rail states (27).** Built, then removed with the rail at the owner's request.
- **Visible cursor spotlight (23).** Not drawn. Cracks near the pointer brighten instead (the owner's choice).
- **Preloader (31).** Skipped by the owner's choice. The hero shows its words and button at once, and a preloader would break the brief's own 1-second rule.
- **↑/↓ for chapters (29).** Left as page scrolling; J and K move between chapters.
- **Severity in the crack tooltip (22).** Not shown, because the page has no severity data and none was invented.
- **Static images in the simple view (33).** None. The calm page is the simple view, by the owner's earlier decision.

### Still needed from the owner

Each is shown on the page as a "To confirm" tag or a hidden control until it is provided:

- **In `src/lib/site.ts`:** the reply-from address and the booking link.
- **Pilot and product facts:**
  - the real pilot timeline;
  - the GitHub App permissions;
  - where containers are hosted;
  - data retention;
  - the scanners supported;
  - cost after the pilot;
  - time to the first verified pull request;
  - self-hosting;
  - time to start.
- **Comparison:** the Scanner alone and Hiring AppSec columns.
- **Founder:** the note and the name, and a photo if wanted.
- **Footer pages:** Security, Privacy, Terms and Contact.
- **Evidence pack:** the final format.

### Tests

The suites in `tests/`:

- `audit.py` (new)
- `immersion.py` (new)
- `panels.py`, `light.py`, `world.py`, `camera.py`
- `display.py` (runs on the dev server)
- `words.py`, `scan.py`, `results.py`, `dawn.py`, `arrival.py`, `hero.py`, `buildings.py`

Commands are listed in `CLAUDE.md`.
