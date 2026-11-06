# Module 1 plan (frontend-design, two passes)

## Pass 1: compact plan

**Palette** (DESIGN.md §3, used as given):

| Token           | Value     | Role                |
| --------------- | --------- | ------------------- |
| `--slate-950`   | `#101517` | page ground         |
| `--slate-900`   | `#151b1d` | surface             |
| `--slate-800`   | `#1d2528` | raised surface      |
| `--slate-700`   | `#2b3639` | evidence boundaries |
| `--bone-100`    | `#ebe7db` | text                |
| `--bone-300`    | `#b4b0a4` | secondary text      |
| `--signal-open` | `#ff5a47` | open or failing     |
| `--signal-hold` | `#f2b134` | inconclusive        |
| `--signal-pass` | `#3ddc97` | passed              |

Measured contrast:

- `--bone-100`: 14.1:1 on `--slate-900`.
- `--bone-300`: 8.0:1 on `--slate-900` (the spec asks for at least 7:1).
- `--bone-500`: 4.05–4.28:1, so it is restricted to large text, as the spec says.
- The primary button (`--slate-950` text on `--bone-100`): 14.9:1.

**Type** (DESIGN.md §4):

- **Display:** Cabinet Grotesk 800, for headlines and the wordmark.
- **Body:** General Sans 400 and 500.
- **Code:** JetBrains Mono, for real code only.
- **Loading:** all self-hosted WOFF2 with `font-display: swap`. The display font and General Sans 400 are preloaded; JetBrains Mono is preloaded in module 2, when the hero line puts it above the fold.

**Layout:**

- A 12-column grid in `--max-content`, with `--gutter` margins.
- `.stage` (one viewport or more) and `.band` (shorter) are the only places section padding is set: `--space-9`, or `--space-8` on phones.
- **Nav, desktop:**
  ```
  [ AUTOSP ......... How it's proven  The log  Results  FAQ   (sound)  [Apply for the free pilot] ]
  ```
- **Nav, phone:**
  ```
  [ AUTOSP ................................................. (sound)  [Apply] ]
  ```
  The section links drop below 900 px. The page is one scroll, so there is no menu button.
- The nav is a solid `--slate-950` bar, 92% opaque, fixed. It has no border and no blur: a border would be a decorative rule (§5), and a blur would compete with the proving sequence.

**Principles:**

1. The nav stays quiet. Its only filled element is the one conversion, "Apply for the free pilot".
2. Every value comes from `tokens.css`, and the layers keep specificity flat.
3. Smooth scrolling is Lenis on GSAP's ticker, with `ScrollTrigger.update` on every Lenis scroll. With reduced motion there is no Lenis, and anchors jump instantly.
4. Anchor jumps move keyboard focus to their target, so keyboard and screen-reader users land where the scroll lands.

## Pass 2: review against DESIGN.md, and what changed

- **Nav border, revised.** My first sketch had a hairline under the fixed nav. §5 allows a border only as a boundary of evidence, so it's gone; the opaque ground separates the nav from the page.
- **Nav blur, revised.** A frosted nav is a generic default, and a second "material" would compete with the one memorable element (§2). It's gone too.
- **Wordmark, checked.** Plain "AUTOSP" in the display face, with no tracking. A tracked-out all-caps label is a banned treatment, and the wordmark is a name, not a label.
- **Link text, checked.** No arrows on "See a fix, step by step" or any other link (§4).
- **The green signal, flagged.** frontend-design names "near-black with one bright green accent" as a common default. DESIGN.md fixes this palette, and the brief's own words win. What keeps it from reading as a default is §3's rule: green appears only where something has passed, never as decoration or as the button colour. The primary button is bone on slate.
- **Sound toggle, kept** (§7, "keep the existing mute toggle"). In module 1 it only stores the visitor's choice; the three sounds it controls arrive with the modules that play them (exploit hit in module 2, check pass in 3, merge in 6).
- **Custom cursor, not in module 1.** It isn't part of module 1 in §13. It will come with the first interactive module, where it has something to grow over.
