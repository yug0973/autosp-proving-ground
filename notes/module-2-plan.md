# Module 2 plan: the hero stage and exploit demo (frontend-design, two passes)

## Pass 1: compact plan

**Palette:** the module 1 tokens, with no new colours. The signals appear only for results:

- **pass:** one row returned;
- **open:** rows leaked;
- **hold:** the query failed.

The underline under the vulnerable code is `--signal-open`: it marks a real open finding.

**Type:**

- **The protagonist:** the vulnerable line in JetBrains Mono, sized to the viewport through a new `--step-code` token (about 56 px at 1440, 21 px at 390). It's real code, so the mono face is allowed (§4).
- **Product sentence:** General Sans at `--step-1`.
- **Demo labels:** `--step--1`.
- **Hidden heading:** the page's `h1` is visually hidden. The spec makes the code line the first visible thing, and it isn't a heading. The `h1` gives screen readers and search engines the page's subject.

**Layout:**

```
desktop (12 columns)
[ cur.execute(                                              ]  code: columns 1-12, the protagonist
[     "SELECT * FROM invoices"                              ]
[     " WHERE id = '"            ~~~~~~~~ (red wavy)        ]
[     + invoice_id + "'"         ~~~~~~~~                   ]
[ )                                                         ]
[ app/repositories/invoices.py                              ]
[                                                           ]
[ invoice_id [ 1042        ] [Run exploit]  | AUTOSP reproduces each finding ... ]
[ (result strip, aria-live)                 | [Apply for the free pilot]        ]
[ Simulated query on sample data.           | See a fix, step by step           ]
   columns 1-7                                 columns 8-12

phone: one column in the same order (code, demo, sentence, buttons)
```

**The code's line breaks:**

- **Why break it:** as one line, the 70-character statement can only be about 31 px wide at 1440 and 8 px at 390, which isn't "large code type" anywhere.
- **The format:** five lines in black-style formatting, using Python's implicit string concatenation. It's the same statement with the same tokens, and still valid Python.
- **Size:** the longest line is 28 characters, so the code reaches about 56 px on desktop and 21 px on a phone.
- **Module 3:** it morphs the same five lines.

**Principles:**

1. **The code line is the only loud element in the hero.** The demo, the sentence and the buttons stay plain.
2. **The demo is a real simulation.** It concatenates the visitor's input into the same string the vulnerable code builds, then runs a small SQL evaluator over five sample rows. Any tautology leaks the rows, not just the example payload, and a stray quote fails the way a real database would.
3. **Each state carries a text label and an icon shape**, not only a colour:
   - pass: a circle with a check;
   - open: a triangle with an exclamation mark;
   - hold: a diamond.

   Each result is announced through a polite live region.

4. **Motion has three parts:**
   - One page-load reveal: the code types in over `--dur-slow`, then the underline draws over `--dur-slow`. Opacity and transform only.
   - One response: the 120 ms glitch on a leak, through a new `--dur-glitch` token.
   - The cursor ring: it follows the pointer and grows over the code and the controls.
5. **Reduced motion:** the code and underline are simply there, with no glitch and no cursor ring.
6. **Without JavaScript:** the code, the sentence and the buttons are all visible. A CSS failsafe shows the code if the reveal never starts. The demo needs JavaScript, and says so in a `<noscript>` line.

**The exploit sound** plays only when sound is on and a leak happens. It's synthesised (about 220 ms) and measured offline against the 300 ms and -18 LUFS limits.

## Pass 2: review against DESIGN.md, and what changed

- **Pinning, revised.** The wireframe marks the hero as pinned from 0 to 100vh, but §6.1 gives the hero nothing to scrub, and pinning a still frame only delays the proving sequence. The hero is a normal 100vh stage in module 2. If module 3 needs the hero held while the sequence starts, it will pin it then. This is flagged to the founder.
- **"Attack demo" chrome, revised.** My first sketch framed the code like a terminal window, with dots and a title bar. That's a generic default and decoration, so it's gone. Only the file path stays, because it's evidence: it says whose code this is.
- **Glow, revised.** I had considered a glow on the underline. That's decoration too, so it's gone: the underline is a flat 2 px wavy stroke.
- **The leak: revised, then put back to the spec.** At first I kept the rows in `--bone-100`, with only the status line in red, to keep the strip quiet. §6.1 says the strip "shows all rows leaking in `--signal-open`" and the benign row in `--signal-pass`, and the brief's words win, so the rows take the signal colour. Both clear AA on the page ground (5.96:1 and 10.4:1).
- **The cursor's colour change, removed (self-critique, rule 5).** The ring changed colour as well as size over controls. The scale alone says enough.
- **CTA targets, noted.** "Apply for the free pilot" points at `#apply` (module 6) and "See a fix, step by step" at `#proving` (module 3). Until those modules land, the links change the URL hash and nothing else; the scroll module ignores missing targets.
- **The custom cursor, kept here.** Module 1 deferred it to the first interactive module, which is this one. It's additive: the native cursor is never hidden.
