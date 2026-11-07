# DESIGN.md — AUTOSP "The Proving Ground"

This file is the single source of truth for the AUTOSP landing page redesign. Claude Code must read it fully before writing any code and must re-read the relevant section before starting each module.

## 1. Product context

- **Product:** AUTOSP reproduces each scanner finding with a failing test, writes the fix in a sealed sandbox, runs three automated checks, and opens a pull request with the evidence. A person decides what merges.
- **Audience:** engineering leads and developers on teams of 20 to 150 engineers, running Semgrep, CodeQL, Snyk Code or osv-scanner on GitHub-hosted Python services, with no dedicated AppSec hire.
- **Primary job of the page:** make a skeptical engineer believe, within one scroll, that the fix is proven and that a human stays in control. The single conversion is "Apply for the free pilot".
- **Brand truth:** restraint and honesty. Claims stay small and verifiable. Every interactive demo is labeled as illustrative. The page never overclaims.

## 2. Concept

One vulnerable line of code is the protagonist. The page is its journey from report to merge, driven by scroll and by the visitor's own input.

**The one memorable element** is the pinned, scroll-scrubbed, reversible fix sequence (section 6.2). Everything else on the page stays quiet and disciplined so that this sequence lands. Do not add decorative motion, parallax, gradient washes or floating shapes anywhere else.

## 3. Design tokens

All tokens live in `src/styles/tokens.css` as CSS custom properties. No hard-coded colors, sizes or durations anywhere else.

```css
:root {
  /* Color: base */
  --slate-950: #101517; /* page background, deepest */
  --slate-900: #151b1d; /* default surface */
  --slate-800: #1d2528; /* raised surface (cards, code panels) */
  --slate-700: #2b3639; /* borders and dividers */
  --bone-100: #ebe7db; /* primary text */
  --bone-300: #b4b0a4; /* secondary text (min 7:1 on slate-900) */
  --bone-500: #7d7a70; /* tertiary text, disabled (large text only) */

  /* Color: semantic signals. These carry meaning. Never use them decoratively. */
  --signal-open: #ff5a47; /* open or failing finding, exploit success */
  --signal-hold: #f2b134; /* inconclusive, needs review */
  --signal-pass: #3ddc97; /* check passed, verified, merged */

  /* Type families */
  --font-display: 'Cabinet Grotesk', 'Helvetica Neue', Arial, sans-serif;
  --font-body: 'General Sans', 'Helvetica Neue', Arial, sans-serif;
  --font-code: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  /* Type scale (fluid) */
  --step--1: clamp(0.82rem, 0.79rem + 0.15vw, 0.9rem);
  --step-0: clamp(1rem, 0.96rem + 0.2vw, 1.125rem);
  --step-1: clamp(1.25rem, 1.15rem + 0.5vw, 1.55rem);
  --step-2: clamp(1.6rem, 1.35rem + 1.2vw, 2.4rem);
  --step-3: clamp(2.2rem, 1.6rem + 2.8vw, 4rem);
  --step-4: clamp(3.2rem, 1.8rem + 6vw, 7.5rem);
  --step-5: clamp(3.6rem, 0.6rem + 13vw, 12.5rem); /* hero statement only */

  /* Spacing (8px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --space-8: 4.5rem;
  --space-9: 7rem;
  --space-10: 11rem;

  /* Layout */
  --gutter: clamp(1.25rem, 4vw, 3.5rem);
  --measure: 62ch; /* max body line length */
  --max-content: 90rem;

  /* Radius: deliberate hierarchy, not one value everywhere */
  --radius-control: 0.5rem; /* buttons, inputs */
  --radius-panel: 0.25rem; /* code panels, log blocks */

  /* Motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 140ms;
  --dur-base: 280ms;
  --dur-slow: 640ms;
}
```

Tokens added in module 1, alongside the list above (all in `tokens.css`):

| Token                                            | Value                           | Use                                                                    |
| ------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------- |
| `--nav-ground`                                   | `--slate-950` at 92%            | the fixed nav's ground; no border, no blur                             |
| `--nav-height`                                   | `4.5rem`, or `4rem` under 40rem | nav height, and the anchor landing offset through `scroll-padding-top` |
| `--target-min`                                   | `2.75rem`                       | 44 px minimum touch target                                             |
| `--focus-width`, `--focus-offset`                | `2px`, `3px`                    | the §8 focus ring                                                      |
| `--leading-body`                                 | `1.55`                          | body line height (§4)                                                  |
| `--leading-display-tight`, `--leading-display`   | `0.9`, `1.05`                   | display line heights (§4)                                              |
| `--tracking-display-large`, `--tracking-display` | `-0.04em`, `-0.025em`           | display tracking (§4)                                                  |

Media-query breakpoints (`40rem`, `56rem`) are written as literals, because custom properties can't be used inside media queries.

Tokens added in module 2:

| Token                            | Value                                            | Use                                                                 |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `--step-code`, `--leading-code`  | `clamp(1.1rem, 0.45rem + 3.35vw, 3.5rem)`, `1.2` | the hero's vulnerable code: about 56 px at 1440, about 20 px at 390 |
| `--dur-glitch`                   | `120ms`                                          | the one-time glitch on a leak (§6.1)                                |
| `--reveal-failsafe`              | `2.5s`                                           | if the reveal script never runs, the code shows anyway              |
| `--cursor-size`, `--cursor-grow` | `1.75rem`, `1.7`                                 | the custom cursor ring, and its scale over controls and the code    |
| `--wave-height`, `--wave-period` | `0.3em`, `0.6em`                                 | the red wavy underline                                              |

## 4. Typography

- **Display: Cabinet Grotesk** (weight 800, Fontshare, free for commercial use). Used for headlines only. Tight tracking (`-0.04em` at `--step-4` and above, `-0.025em` below), line-height `0.9` to `1.05`.
- **Body: General Sans** (400 and 500). Line-height `1.55`, line length capped at `--measure` (under 80 characters).
- **Code: JetBrains Mono.** Used only for real code, payloads, hashes and file paths. Never for decorative labels or section tags.
- Self-host all fonts as WOFF2 with `font-display: swap` and preload the display and body files used above the fold.
- Headlines are set as large type that does real work. The hero statement is allowed to run edge to edge at `--step-5`.
- Banned treatments: accenting a single word of a headline with italic or color, tracked-out all-caps eyebrow labels above headings, middle-dot meta strings ("A · B · C"), arrows appended to link text, numbered markers on anything that is not a true sequence.
- Numbering is allowed only for the pipeline stages in section 6.2, because they are a real sequence.

## 5. Layout principles

- Left-aligned text throughout. No centered body copy.
- Asymmetric 12-column grid with generous negative space. Headlines hang on the left; evidence (code, log, PR) sits on the right or runs full bleed.
- Section padding: `--space-9` desktop, `--space-8` mobile. Define section spacing in one place (a `.stage` and `.band` primitive), and avoid mixing type selectors with class selectors for padding or margin so rules never cancel each other.
- Structure carries information only: a border means a boundary of evidence (a code panel, a log block), a divider separates genuinely distinct records. No decorative rules.
- Wireframe of the page flow:

```
[ nav: wordmark ........ links ........ Apply ]

[ HERO STAGE (pinned, 0 to 100vh)                  ]
[   huge vulnerable line, red underline            ]
[   [ payload input ]  [ Run exploit ]             ]
[   one sentence of product copy, left, 62ch      ]

[ PROVING SEQUENCE (pinned, ~450vh, scrubbed)     ]
[   stage 1 Reported   -> 2 Reproduced -> 3 Patched ]
[   -> 4 Verified -> 5 Approved                    ]

[ THE BACKLOG (short, 100vh)                      ]
[ SEALED SANDBOX (100vh, small scene)             ]
[ THE LOG: live hash chain (100vh, interactive)   ]
[ THE MERGE: visitor presses the only merge button ]
[ EVIDENCE PACK + SAMPLE RESULTS (honest stats)   ]
[ FAQ + final CTA + footer                        ]
```

## 6. Sections and interaction specs

### 6.1 Hero stage

- The first thing visible is the vulnerable line in large code type with a red wavy underline: `cur.execute("SELECT * FROM invoices WHERE id = '" + invoice_id + "'")`.
- Below it, a single-line input prefilled with a benign ID (`1042`) and a button labeled "Run exploit".
- Behavior (all client-side, no network):
  - With a benign ID, a result strip shows one invoice row in `--signal-pass`.
  - With a payload containing a quote and a boolean tautology (for example `' OR '1'='1`), the strip shows all rows leaking in `--signal-open` and the line glitches once (120ms, one time).
  - A small caption reads "Simulated query on sample data."
- Product sentence under the demo: "AUTOSP reproduces each finding with a failing test, writes the fix in a sealed sandbox and opens a pull request with the evidence. A person still decides what merges."
- Primary CTA "Apply for the free pilot" is in the nav and below the hero copy. Secondary link "See a fix, step by step" scrolls (Lenis) to the proving sequence.
- Page-load motion: one orchestrated reveal only (the line types in, then the underline draws). No other entrance animations on the page.

Decisions made while building module 2:

- **The code is set on five lines** in black-style formatting, using Python's implicit string concatenation:
  ```python
  cur.execute(
      "SELECT * FROM invoices"
      " WHERE id = '"
      + invoice_id + "'"
  )
  ```
  - **Why:** as one 70-character line it could only be about 31 px wide at 1440 and 8 px at 390, which is not large code type anywhere.
  - **What stays the same:** it's the same statement, and still valid Python.
  - **Underline:** only the two concatenation lines are underlined, because they build the query from input.
  - **Module 3** morphs these same five lines.
- **The hero is a normal 100vh stage, not pinned.** It has nothing to scrub, and pinning a still frame would only delay the proving sequence. If module 3 needs the hero held while the sequence starts, it will pin it then.
- **The demo is a real simulation, not a lookup table** (`src/lib/sql-sim.ts`). It concatenates the input exactly as the vulnerable line does and evaluates the WHERE clause with SQLite semantics. So:
  - any tautology leaks;
  - a stray quote fails in `--signal-hold` with SQLite's own kind of error;
  - a second statement is refused, as Python's sqlite3 module refuses it.

  The strip also shows the query that ran. Leaked and found rows take the signal colour, as specified.

- **There is a visually hidden `h1`** ("AUTOSP: verified fixes for what your scanner finds"). The spec makes the code the first visible thing, and code isn't a heading.
- **The custom cursor is hidden on any device with touch input** (`any-pointer: coarse`), not only when the primary pointer is coarse.
- **The exploit, pass and merge sounds** measure -34 to -37 LUFS (BS.1770, one 400 ms block) and 151–208 ms long.

### 6.2 Proving sequence (the memorable element)

Pinned container, scrubbed by GSAP ScrollTrigger (`scrub: 0.6`, `pin: true`, `anticipatePin: 1`), fully reversible. A single master timeline drives five stages; the stage index and name are shown in a fixed left column (this is a true sequence, so numbering is appropriate).

| Stage        | What the visitor sees                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Reported   | The vulnerable line, tagged with file path and CWE. A small chip reads "Reported by your scanner."                                                             |
| 2 Reproduced | A failing test appears in a second panel, red status. The exploit payload visibly returns every row.                                                           |
| 3 Patched    | The line morphs character by character into the parameterized query (`cur.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,))`). Diff marks `+1 -1`. |
| 4 Verified   | Three check rows resolve one at a time: exploit retest, attack variants, regression with diff audit and re-scan. Each flips from pending to `--signal-pass`.   |
| 5 Approved   | The pull request card assembles (title, branch, files changed, "Untouched: tests, CI, linter and scanner config") and ends in "Waiting for your reviewer."     |

Implementation notes:

- Render the code morph with Canvas 2D or a keyed-span DOM diff, not a video. Characters that survive the change stay in place; removed characters fade; added characters type in.
- Provide a "Skip animation" button, and a static stacked version for `prefers-reduced-motion` and for viewports under 700px tall.
- The timeline must be scroll-position-pure (no time-based side effects), so scrolling up exactly restores earlier states.

Decisions made while building module 3:

- **The morph is a monospace character grid** (`src/lib/code-morph.ts`), the keyed-span option §6.2 allows, not Canvas. Both versions sit on one grid; a cell that is the same in both keeps its place, and a cell that changes stacks its old and new glyph. Chosen over Canvas so the code stays real text and inherits the font and colour tokens.
- **Old glyphs fade out, then new ones type in** (they don't cross-fade at once). The vulnerable and fixed lines differ enough that overlapping them read as a smear; sequencing keeps it legible, and it still reverses exactly under scrub.
- **The animated pin needs width ≥ 896px as well as height ≥ 700px.** Its two-column pinned frame is a desktop layout, so phones and narrow tablets get the static stacked version (this, not just the height gate, is what routes phones to static).
- **No sound in this module.** §6.2 requires a scroll-position-pure timeline and §7 lists sound only as a response to discrete actions, not scrubbing, so the scrubbed checks are silent. The "check pass" sound therefore belongs to a discrete event in a later module, not here.
- **The rail fills and the live counter update from timeline progress**, so they are derived state, not one-shot side effects, and they too restore on scrub-back.
- **Keyboard:** Previous/Next stage scroll to each stage's scroll position (so keyboard users reach the same scrubbed states); Skip animation jumps past the pin. The counter is an `aria-live="polite"` region.
- The redundant filename under the stage-3 diff was removed in the self-critique pass (it already appears in the finding header above the code and in the pull-request card).

### 6.3 The backlog

Short band, left headline "Finding it was the easy part." with a right-hand list of five open findings (SQL injection, reflected XSS, cross-tenant read, vulnerable dependency, second SQL injection). As the visitor scrolls past, the first row resolves to a green "Fixed" state to link back to the proving sequence. Label the list "Illustrative backlog."

### 6.4 Sealed sandbox

A small scene (SVG or Canvas 2D, not WebGL) showing a sandbox box with four properties animating in on enter: network lines severed, read-only filesystem lock, non-root user badge, and a hard timer counting down from a fixed value. One-time on-enter animation, then static.

### 6.5 The log (interactive proof)

- Five blocks: Reported, Reproduced, Patched, Verified, Approved. Each shows a 4-character short hash.
- Each block's hash is computed live with `crypto.subtle.digest("SHA-256", ...)` over `previousHash + payloadText`. Show the full hash on hover or focus.
- Payload text in each block is editable (contenteditable or inline input). Editing any block recomputes it and all following blocks; every changed downstream block turns `--signal-open` with the label "No longer matches."
- A "Restore" button resets to the original text.
- Caption: "Your auditor gets an evidence pack for each assessment."

Decisions made while building module 4:

- **Inline `<input>` per block, not contenteditable** (§6.5 allows either): a real accessible name, a
  stable value, predictable caret behaviour and easy testing.
- **The chain is SHA-256 over the empty-string genesis** (`src/lib/sha256.ts`, Web Crypto). The helper
  is checked against `SHA-256("abc") = ba7816bf…` and the live chain against an independent SHA-256 in
  the test. The five original short hashes (ebdd, 7c2b, 6ebf, 85cf, 557b) are baked into the HTML, so
  the sealed chain is readable without JavaScript; on load the module recomputes and verifies them.
- **Editing a block breaks that block and every block after it** (open-red, "No longer matches"), with
  the downstream hashes recomputed; the blocks before it stay sealed. A polite live region names the
  broken range. Restore resets every payload, reseals, disables itself and announces.
- **A sealed block is neutral, not green.** Green means "a check passed" (§3); an intact log entry hasn't
  passed anything, it is simply unbroken, so intact is `--bone-300` and only the break is coloured.
- **The full hash shows on hover and on focus** of the hash control, and a click keeps it shown (touch
  and keyboard). To satisfy "label in name" (WCAG 2.5.3), the control's accessible name is its visible
  text and the full hash is its `aria-describedby` target, not an `aria-label` that would replace the name.
- **No sound** (editing the log is not one of the three UI sounds), and no section entrance (§7).
- **Self-critique removal:** sealed blocks dropped their border and sit on a raised surface instead, so a
  visible border now means a break (§5), which also makes the break read louder.
- **Placement:** `#log` currently follows the proving sequence; modules 5 and 6 will arrange the backlog,
  sandbox, merge, results and FAQ around it into the §5 page order.

### 6.6 The merge

A pull request card with a single button, "Merge". It is disabled until the visitor scrolls the card fully into view, to avoid accidental clicks. Pressing it turns the status `--signal-pass`, and the counter beneath updates: "Merges made by AUTOSP: 0. Merges made by you: 1." This makes the "a person decides" guarantee tangible.

### 6.7 Sample results

Keep the two honest stats ("2/2 misses closed as inconclusive, with no patch written" and "0 merges made by AUTOSP") with the existing caveat: test applications and a development model, not customer code, a small sample from the 15 October 2026 baseline, an early signal and not a benchmark. Do not add new numbers that are not backed by data.

Decisions made while building the results skyline (world upgrade, Phase 5):

- **The row stands at the city's south edge, in `src/world/skyline.ts`.** Nothing lies behind it, so the gap in the skyline is really dark. No earlier beat looks south, so the row and the blocks cleared in front of it change none of their shots.
- **What the row shows only moves forward.** A stage, once reached, stays, so a visitor who stops scrolling never sees a partial number on a tower. The towers light and the number counts together in about a second and a half.
- **The third number stands on a low dark wall in the gap,** because a display needs a wall to stand on. It is far lower than any tower, so the gap still reads as a gap.
- **Tower heights mean nothing.** They are a fixed scatter so the row reads as a skyline.
- **The panel keeps every statement and the caveat on screen** (on small screens, the current statement and the caveat; the others stay for screen readers). Without WebGL it falls back to the sixteen squares and drawn numbers, in the page flow.

Decisions made while building the dawn ending (world upgrade, Phase 6):

- **The company's name stands on its own tower, not on one of the 16.** A lime or amber tower is a result, so a name on one would look like a real scan. The visitor's tower stands apart past the gap, is the tallest in that view, stays unlit, and its sign is neutral white. Taller towers exist in the far city, out of this shot.
- **Nothing typed leaves the field for anything but the sign and the visitor's own email.** No storage, no request.
- **A phone cannot show the sealed row and a readable sign together,** so the phone's last frame holds the sign, and the lime is seen on the flight just before it.

The first screen: the tear (world upgrade, after Phase 8):

- **One enormous rip in a bright cloud deck, with the live night city burning under it.** The cloud layer between what a team sees and the backlog beneath it is the page's whole argument, in one frame. The visitor's pointer pulls the tear; scrolling falls through it.
- **It is night down there from the first frame, so the day is only the deck.** The old slow turn from day through dusk is gone: the fall through the tear is the change of day.
- **The first screen is in ink,** because the ground is bright sky and cloud; ink holds at least 4.5:1 on both, the sky's blue included. Without WebGL there is no deck, and the words stay white on the night ground.
- **The tear never reaches behind the page's words,** so they always stand on sky and cloud, never the city, wherever the pointer pulls it. The clouds look the same behind the words as anywhere. In the fall the words fade before the deck goes, so nothing is left floating.
- **Arriving from Nexarise, the deck is whole for a second and then rips.** It takes only continuity from that site, not its picture: the sky's blue, sampled from `nexarise-website.vercel.app`, and the bright cloud.
- **The clouds are soft banks worn thin by turbulence, with the sun's light walked through them,** because round billows read as cotton. All of it is baked once into a tile, so the pass costs little, and while the tear is small the city is drawn only inside it.

Decisions made while making the buildings read as real (world upgrade, after Phase 8):

- **Blockers clear with a true fade, not a dither.** The pieces in the camera's way draw once, transparent, while the push is under way, and not at all after. The dither speckled the whole frame.
- **Close-up detail runs only in the pushed-in shots, on the high tier.** Glass set back in its opening runs everywhere. Rooms behind the glass, sashes, belt courses, fire escapes and shop frames run only where the camera is close enough to see them, because the overview cannot show them and cannot afford them.
- **The large close-up shaders compile in the background, three seconds after load,** so the first push does not freeze the page. It costs about a second of stall while the hero sits still.
- **The depth of field's passes go to the GPU as separate batches,** because on an integrated GPU one long batch could reset the driver and lose the whole world.
- **Windows change on slow clocks,** so the city is lived in. Reduced motion freezes the clock, so it stays still.

Decisions made while polishing the streets (world upgrade, after Phase 8):

- **Cars are one extruded body stretched into four kinds of vehicle** (saloon, SUV, van, box truck), so they stay one draw call. Wheels are boxes: there are thousands, and each is a few pixels at most.
- **Street trees are dark on purpose,** so green never competes with the lime of a sealed fix. They clear out of the camera's way with everything else.
- **Lamp pools turn into an even wash with distance,** so the far city is not a field of blurred blobs.

### 6.8 FAQ and final CTA

- Native `<details>` elements, styled, one open at a time via a small script.
- Fix the "What is a design partner?" question: either define it in the answer in one sentence ("A team that uses the pilot early and tells us what to fix.") or remove it.
- Final CTA: "Your scanner did its job. Let's finish it." with "Apply for the free pilot" and the line "Nothing touches your code until you've signed a scope agreement."
- Footer keeps: "AUTOSP does not guarantee that an application is secure."
- Remove the Unsplash hero photo and its credit.

### 6.8b The box

- **One component on every beat,** adapted from Magic UI's Magic Card and Border Beam (MIT), rebuilt in plain CSS with no new dependency. A light on the edge follows the pointer; a beam travels round the edge.
- **The beam's colour carries meaning:** orange while a test fails or a fix is refused, amber while it waits for a person, lime once it has passed or merged, plain mist otherwise.
- **The form follows Aceternity's Signup Form:** labels above, filled fields with no border, one full-width action.
- **Tried and rejected:** dark cards with pills, a bright paper strip, full-width subtitles with facts pinned to objects. The wide shade layers those needed moved with the scroll and showed hard edges across the city.

### 6.8c The checks, the form and the small motions

- **The checks fly through three barriers in the sky,** timed to the checks in the box: each barrier turns lime as its check passes or strikes orange when it refuses, and a refused fix flies back to the sandbox. (An earlier version ran the checks on the building itself; on 7 November the owner chose this one.)
- **The form is one page** with a work email, team-size tiles and scanner chips, sent through Web3Forms (`modules/apply.ts`), falling back to the visitor's mail app. (An earlier step-by-step version was replaced on 7 November.)
- **Counters and fingerprints,** after React Bits' Counter and Decrypted Text: the results' 14 and 2 roll up like an odometer as the box arrives, and a rewritten record entry decrypts each later fingerprint into its new value. The real text stays in the page; neither moves with reduced motion.

### 6.8d Upgrade, Phase 1 (7 November, PLAN.md)

- **The first screen:** "Verified fixes for the findings your scanner keeps reporting." on two lines, and a sub-line that expands the name ("AUTOSP, the Autonomous Security Platform, …"); no eyebrow. Two ways in: "Apply for the free pilot" and "See how it works ↓". A scroll cue leaves as soon as the visitor scrolls.
- **The scanner sweep** is a thinner, softer beam with a faint trail behind it, so it reads as a scan, not a glitch.
- **Words over the city** stand on a tight scrim sized to each block of text and moving with it (no blur, nothing across the city). Light text is #c9d3ee; the smallest hints are 14 px. Every chapter's words measure at least 5:1 down the whole page.
- **One chapter at a time:** a chapter's words and box fade out over the last few per cent of its scroll; the results' box waits for its section and leaves before the form. `tests/panels.py` fails if two boxes are ever on screen together.
- **The rail** stands on a solid square backing, with a fill showing how far the visitor has come; the 3D finding labels keep clear of it.
- **The fall** below the clouds is about 40 % shorter.

### 6.9 Two experiences, one URL

- **One HTML file holding both, chosen before paint.** It is the calm phone page as written; a small script in the head turns it cinematic on a screen at least 60rem wide that can draw WebGL. Chosen once per load: rotating or resizing keeps what the visit started with.
- **The phone page is its own design, not the desktop story made smaller.** A first version showed every beat as flat diagrams; the owner rejected it as a 2D copy. It is now type over one sky.
- **One sky, three rendered plates.** Night, before dawn and dawn (`tests/make-sky.py`) crossfade by opacity with the scroll, on the same idea as the desktop page: software that rises. The sun comes up in the one empty stretch after the results, so no words ever sit on the middle of the change, and the pilot form is in daylight.
- **Depth, not text on a picture.** Mist lies in front of the words, so each thing rises out of it, and clears for the form. A sun comes up behind them in the empty stretch. Headings rise a word at a time.
- **Each step has its own shape:** the failing test is as large as it goes, the sandbox is shut in a solid block, the checks are three large lines, a person comes first in amber, the fingerprints climb.
- **Signal colours keep their meaning.** Only the state a step ends in, the three checks and the sixteen runs use them.
- **Dropped on the phone, on purpose:** the city, the picker, the failing-test run, the careless fix, hold to merge and the editable record. Those are the cinematic page's proof.
- **Downloads:** Lenis, and never GSAP or three.js.

## 7. Motion rules

- Smooth scroll: Lenis (`lerp: 0.1`, `smoothWheel: true`), synced to GSAP's ticker; `ScrollTrigger.update` on every Lenis scroll event.
- Motion is only for (a) the single page-load reveal, (b) the scrubbed proving sequence, (c) responses to visitor actions (run exploit, edit log, merge, expand FAQ).
- No fade-and-slide entrances on sections, no hover lift on cards.
- Easing: `--ease-out` for responses, `--ease-in-out` for state swaps. Durations from tokens only.
- Custom cursor: a small ring that grows over interactive elements and over the code line. Hidden on touch devices and when `prefers-reduced-motion` is set. The native cursor is never hidden over inputs or text selection.
- Sound: off by default. Keep the existing mute toggle in the nav, and if sound is added, limit it to three short UI sounds (exploit hit, check pass, merge), each under 300ms and under -18 LUFS.

## 8. Accessibility

- WCAG 2.2 AA minimum. All text meets contrast against its actual background, including `--bone-300` on `--slate-900`.
- Visible focus ring on every interactive element: 2px `--bone-100` outline with 3px offset.
- Every scroll-driven stage is also reachable by keyboard through a "Previous stage / Next stage" control pair and the "Skip animation" button.
- `prefers-reduced-motion: reduce`: no pinning, no scrub, no cursor effects, no glitch. Show the five stages as a static stacked sequence with final states.
- Color is never the only signal: pass, hold and open states also carry a text label and an icon shape.
- The hash chain and exploit demo are operable by keyboard and announced with `aria-live="polite"` result strips.

## 9. Performance budget

- 60fps scroll on a mid-range laptop and on a 4-year-old phone for the proving sequence.
- Largest Contentful Paint under 2.0s on a throttled 4G profile. Cumulative Layout Shift under 0.05.
- JavaScript for the first view under 150 KB gzipped (Lenis plus GSAP core plus ScrollTrigger plus app code). No Three.js unless a later phase justifies it.
- Animate only `transform` and `opacity` where possible. No layout-triggering properties inside scroll timelines.
- Pause or tear down any timeline, canvas loop and listener when its section is off-screen (IntersectionObserver).

## 10. Content and copy rules

- Plain verbs, sentence case, active voice. A button says exactly what it does, and the same action keeps the same name everywhere ("Merge" produces "Merged").
- Describe what AUTOSP does in plain terms. Do not use marketing filler ("supercharge", "revolutionize", "seamless").
- Errors and empty states say what happened and what to do next, with no apology.
- Break the staccato rhythm: no more than two consecutive short declarative lines anywhere. Mix in longer, plainer sentences.
- Every simulated element carries a short honest label such as "Simulated query on sample data" or "Illustrative example."

## 11. Tech stack

- Vite, TypeScript (strict), vanilla DOM modules. No framework unless the app grows beyond this page.
- GSAP (core plus ScrollTrigger), Lenis, Web Crypto API. Canvas 2D or SVG for the code morph and the sandbox scene.
- Plain CSS with the tokens above, using cascade layers (`@layer reset, tokens, base, components, utilities`) so specificity never fights.
- Tooling: ESLint, Prettier, Playwright for visual checks.
- Suggested structure:

```
src/
  main.ts
  styles/{tokens,base,components}.css
  modules/{scroll,cursor,hero-demo,proving-sequence,backlog,sandbox,hash-log,merge}.ts
  lib/{sha256,code-morph,reduced-motion}.ts
public/fonts/
```

## 12. Claude Code operating rules

Follow these on every task in this repository.

1. **Use the `frontend-design` skill** before designing or restyling any section. Run its two-pass process: write a compact plan (palette, type, layout, principles), review it against this file, revise anything generic, then build.
2. **One module at a time.** Deliver one file at a time, finish the module completely (no placeholders, no TODOs, production-quality code, typed, with cleanup and reduced-motion handling) before starting the next.
3. **Library docs:** use Context7 to fetch current GSAP, ScrollTrigger and Lenis documentation before writing their code.
4. **Visual verification loop with Playwright:** after each module, take screenshots at 1440x900 and 390x844, scroll to several positions for pinned sections, compare against this file, list every deviation, and fix them before moving on.
5. **Self-critique pass:** before reporting a module done, remove one decorative element, confirm that no banned treatment from section 4 slipped in, and confirm the memorable element is still the only loud thing on the page.
6. **No invented data.** Technical values, stats and claims come only from this file or from real product facts the user provides.
7. **Keep this file current.** If a decision changes, update the relevant section in the same change.

## 13. Build order and acceptance criteria

| Order | Module                                                       | Done when                                                                                                         |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1     | `tokens.css`, base styles, fonts, nav, Lenis and GSAP wiring | Tokens are the only source of color, type and spacing; smooth scroll works; Lighthouse accessibility 100          |
| 2     | Hero stage with exploit demo                                 | Benign and malicious payloads produce correct states; keyboard operable; single page-load reveal only             |
| 3     | Proving sequence                                             | All five stages scrub forward and backward exactly; static fallback works; 60fps                                  |
| 4     | Hash-chain log                                               | Editing any block invalidates all following blocks; Restore works; hashes verified against a known SHA-256 vector |
| 5     | Backlog, sandbox scene                                       | One-time animations, off-screen teardown, honest labels                                                           |
| 6     | Merge card, sample results, FAQ, final CTA, footer           | Merge counter works; FAQ one-at-a-time; copy matches section 10                                                   |
| 7     | Polish and QA                                                | Performance budget met; reduced-motion and mobile pass; cross-browser check in Chrome, Safari and Firefox         |

## 14. First prompt for Claude Code

```
Read DESIGN.md completely. Then use the frontend-design skill and run its two-pass
process for module 1 of section 13: write the compact plan (palette, type, layout,
principles), review it against DESIGN.md, and state anything you revised.

Then build module 1 only, one file at a time, complete and production-quality:
tokens.css, base styles, self-hosted font setup, the nav, and the Lenis plus GSAP
ScrollTrigger wiring with the reduced-motion guard.

When finished, use Playwright to screenshot the page at 1440x900 and 390x844, list any
deviation from DESIGN.md, fix them, and stop. Do not start module 2 until I confirm.
```
