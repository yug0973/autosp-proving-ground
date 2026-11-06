# Module 3 plan: the proving sequence (frontend-design, two passes)

The memorable element (DESIGN.md §2, §6.2): one vulnerable line's journey from reported to approved,
pinned and scrubbed by scroll, fully reversible.

## Pass 1: compact plan

**Palette and type:** module 1 and 2 tokens only. The three signals carry their meanings:

- open: the finding, and the reproduction that returns every row;
- pass: each check that passes, and the approved state;
- hold: unused here.

The code is the same five-line statement as the hero, in `--step-code`-scale JetBrains Mono (a new
`--step-code-panel` a step smaller, because the proving panel holds more than the hero).

**Layout** (pinned stage, one viewport tall while pinned):

```
desktop
[ 1  Reported     | SQL injection in invoice lookup      Reported ]
[ 2  Reproduced   | app/repositories/invoices.py · CWE-89          ]
[ 3  Patched      |                                                ]
[ 4  Verified     |   cur.execute(                                 ]
[ 5  Approved     |       "SELECT * FROM invoices"                 ]
[   (rail fills   |       " WHERE id = '" + invoice_id + "'"       ]  <- morphs at stage 3
[    1 -> 5)      |   )                                            ]
[                 | ----------------------------------------       ]
[                 | (panel below: failing test / checks / PR)     ]
   columns 1-4        columns 5-12

phone / short viewport: the static stacked version (below)
```

**The five stages**, driven by one GSAP timeline on a pinned ScrollTrigger
(`scrub: 0.6`, `pin: true`, `anticipatePin: 1`), about 450vh of scroll:

1. **Reported.** The vulnerable line, file path and CWE, a chip "Reported by your scanner." The line's
   concatenation is underlined in open red, as in the hero.
2. **Reproduced.** A second panel slides in: a failing test, red status, and the leaked rows (the same
   five sample invoices from module 2). The underline stays.
3. **Patched.** The line morphs character by character into the parameterized query
   `cur.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,))`. Surviving characters stay put,
   removed ones fade, added ones type in. The red underline retracts. A `+1 -1` diff mark appears.
4. **Verified.** Three check rows resolve one at a time, each flipping from pending to pass:
   exploit retest, attack variants, regression with diff audit and re-scan.
5. **Approved.** The pull-request card assembles: title, branch, files changed,
   "Untouched: tests, CI, linter and scanner config", ending "Waiting for your reviewer."

**Purity (§6.2):** the timeline sets everything from progress alone — opacity, transform, and the
morph's per-character opacity — so scrubbing up restores earlier states exactly. No sound and no
one-shot side effect is tied to the scrub (see "Sound" below).

**The rail** on the left fills 1 to 5 as the sequence advances, re-using the idea but driven by this
timeline's progress (not a separate scroll timeline).

**Controls (§8):**

- A **Previous stage / Next stage** pair scrolls the page to each stage's scroll position, so keyboard
  users step through the same states the scrub produces.
- A **Skip animation** button jumps past the pinned section to the backlog (module 5's anchor; until
  then, to the page end).
- Both sit in a bar that is visually subdued but always in the tab order.

**Static fallback (§6.2, §8):** with reduced motion, or a viewport under 700 px tall, there is no pin
and no scrub. The five stages render stacked, each at its final state, in document order, with their
headings. This is the version phones get (they are under 700 px tall in portrait, and also report
reduced-motion far less, so the height gate is what catches them).

**Sound:** none in this module. §6.2 requires a scroll-position-pure timeline, and §7 lists sound only
as a response to discrete visitor actions (run exploit, edit log, merge, expand FAQ), not scrubbing.
The "check pass" sound therefore belongs to a discrete event elsewhere, not to the scrubbed checks.
Flagged to the founder.

**No JavaScript:** the static stacked version is the HTML default; the pinned build is layered on by
script, so without JavaScript the five stages are readable in order.

## Pass 2: review against DESIGN.md, and what changed

- **Canvas vs DOM morph, decided.** §6.2 allows Canvas 2D or a keyed-span DOM diff. I chose the DOM
  diff: it keeps the code as real selectable text, inherits the font and colour tokens, and reverses
  cleanly under scrub. Canvas would need its own font loading and a separate accessible copy.
- **"Attack variants" label, kept verbatim.** It is one of AUTOSP's three verification checks, named
  the same way on the old site and in §6.2's table. It describes a defensive retest (the fix is run
  against known variations of the finding), so it stays as the product's own term.
- **Pin wrapper, added.** Pinning with Lenis needs a stable wrapper ScrollTrigger pins, so the stage
  has an inner `.proving__pin` that holds the viewport-height frame; the outer `.proving` provides the
  ~450vh of scroll. This is structural, not decoration.
- **Numbered stages, allowed.** §4 bans numbered markers unless the content is a real sequence; §6.2
  says this one is, so 1–5 are shown. This is the only numbering on the page.
- **Second entrance removed (self-critique).** My first sketch slid each stage's panel up as it
  entered. That reads as the generic per-section entrance §7 bans. The panels now cross-fade in place
  from the timeline; only the one pinned sequence moves.
- **Reduced-motion rail.** In the static version the rail is shown full (all five reached), not
  animated, so it still reads as "all steps done".
