# Module 4 plan: the hash-chain log (frontend-design, two passes)

The interactive proof (DESIGN.md §6.5): five record blocks whose hashes chain together, so editing any
entry visibly breaks every entry after it. This makes the append-only log tangible.

## Pass 1: compact plan

**Palette and type:** module 1-3 tokens. The one signal here is `--signal-open`: a block that no longer
matches the sealed record turns open-red with the label "No longer matches." A sealed block is neutral
(`--bone-300`), not green — nothing has "passed," it is simply intact.

- **Labels and hashes:** JetBrains Mono (`--font-code`): the step label, the 4-character short hash and
  the full hash are all literal data.
- **Payload text:** JetBrains Mono inside the editable input, because it is the record's literal bytes.
- **Heading and caption:** General Sans.

**The record (illustrative, honest):** each block's payload is one short true-to-product line:

1. Reported — `finding f-6239 CWE-89 app/repositories/invoices.py`
2. Reproduced — `exploit reproduced, 5 rows returned`
3. Patched — `parameterized query +1 -1`
4. Verified — `3 checks passed`
5. Approved — `approved by your reviewer`

**The chain:** `hash_i = SHA-256(hash_{i-1} + payload_i)`, with `hash_0 = ""`. Computed live with
`crypto.subtle.digest` (`src/lib/sha256.ts`). The sha256 helper is checked against the published vector
`SHA-256("abc") = ba7816bf…` in the test, and on load the module recomputes the chain and asserts it
matches the short hashes baked into the HTML (so no-JS shows the same sealed chain JS verifies).

**Layout:**

```
desktop (the five blocks in a row, each feeding the next)
[ 1 Reported ]→[ 2 Reproduced ]→[ 3 Patched ]→[ 4 Verified ]→[ 5 Approved ]
  payload        payload           payload        payload        payload
  hash 3f9a      hash 8c12         hash e190      hash 7d44      hash 02aa
  sealed         sealed            sealed         sealed         sealed

phone: the same blocks stacked, each linked to the next by a short vertical connector
```

The arrow/connector between blocks encodes the dependency (each hash feeds the next), so it is
structural, not decoration (§5).

**Interaction:**

- Each block's payload is an inline `<input>` (more robust and testable than contenteditable).
- Editing any block recomputes its hash and every following hash. Every block whose hash now differs
  from its sealed original turns `--signal-open` and reads "No longer matches" — the edited block and
  all after it, which is exactly how a hash chain exposes tampering.
- A **Restore** button (disabled until something changes) resets every payload and reseals the chain.
- The **full hash** shows on hover or focus of a block's hash control, and a click keeps it shown
  (for touch and keyboard). The control's accessible name carries the full 64-character hash.
- An `aria-live="polite"` region announces, e.g., "Edited block 3. Blocks 3 to 5 no longer match the
  sealed record." Restore announces "Record restored. All five blocks match again."

**Motion (§7):** only the colour/label change on edit (a response to a visitor action), over `--dur-fast`
with `--ease-out`; no movement, and no section entrance. No sound (editing the log is not one of the
three UI sounds).

**Static / no-JS (§10, §8):** the five blocks, their payloads and their baked short hashes are all in
the HTML, so without JavaScript the sealed chain is fully readable; the inputs just don't recompute.
With reduced motion the colour change is instant (no transition).

**Captions:** "Illustrative chain. Edit any line to break it." and the required
"Your auditor gets an evidence pack for each assessment."

**Placement:** a new `<section id="log">` (the nav's "The log"), added after the proving sequence for
now; modules 5 and 6 will slot the backlog, sandbox, merge, results and FAQ around it into the §5 order.

## Pass 2: review against DESIGN.md, and what changed

- **Input over contenteditable, decided.** §6.5 allows either. An `<input>` has a real accessible name,
  a stable value, and predictable caret and selection behaviour, and it is trivial to drive in tests.
  Contenteditable would need extra ARIA and sanitising for no upside here.
- **Sealed blocks are neutral, not green (self-critique).** My first sketch coloured intact blocks in
  `--signal-pass`. But green means "a check passed" (§3); an untouched log entry hasn't passed anything,
  it is just unbroken. Using green would spend a meaning it doesn't own and make the break less legible.
  Intact is `--bone-300`; only the break is coloured.
- **The genesis hash is the empty string**, stated in a short note, so the first block's hash is honestly
  reproducible rather than hiding a secret seed.
- **No "verify" affordance beyond editing.** I considered a "tamper" demo button that auto-edits a block.
  That is redundant with the editable fields and adds chrome, so it's cut; the fields are the demo.
- **The connector is a thin mono arrow (→ equivalent drawn, not the literal character appended to text),**
  so it does not fall under §4's "arrows appended to link text" ban — it is a diagram element between
  blocks, not a suffix on a link.
