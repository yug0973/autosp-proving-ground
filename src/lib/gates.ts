/**
 * The three gates every fix must pass (the reproduction test, the existing suite and a fresh
 * static scan), what each one reports for each finding, and a careless fix per finding that one
 * check refuses. Also the timeline that turns scroll progress through the section into what the world
 * shows on the building and what the list says, so the two always agree.
 */
import type { DiffLine } from './fixes';
import type { FindingId } from './story';

export const GATE_NAMES = [
  'Reproduction test passes',
  'Existing test suite passes',
  'Static scan is clear',
] as const;

export type GateIndex = 0 | 1 | 2;

/** Each check's short name, for the flag a refusing check raises over the building. */
export const GATE_SHORT = ['Reproduction test', 'Existing suite', 'Static scan'] as const;

/** One gate's report: passed, or refused with the reason. */
export interface GateReport {
  readonly passed: boolean;
  readonly detail: string;
}

export interface CarelessFix {
  readonly diff: readonly DiffLine[];
  /** The gate that refuses it. */
  readonly refusedAt: GateIndex;
  /** What the gates report for it, up to and including the refusal. */
  readonly reports: readonly GateReport[];
}

export interface GateCase {
  /** What the gates report for the fix written in the sandbox: all three pass. */
  readonly good: readonly [GateReport, GateReport, GateReport];
  readonly careless: CarelessFix;
}

export const GATES: Readonly<Record<FindingId, GateCase>> = {
  'CWE-89': {
    good: [
      { passed: true, detail: '1 passed' },
      { passed: true, detail: '214 passed' },
      { passed: true, detail: '0 findings' },
    ],
    careless: {
      diff: [
        { kind: '-', text: `    cur.execute("SELECT * FROM invoices WHERE id = '" + invoice_id + "'")` },
        { kind: '+', text: `    safe_id = invoice_id.replace("'", "")` },
        { kind: '+', text: `    cur.execute("SELECT * FROM invoices WHERE id = '" + safe_id + "'")` },
      ],
      refusedAt: 2,
      reports: [
        { passed: true, detail: '1 passed' },
        { passed: true, detail: '214 passed' },
        { passed: false, detail: '1 finding: SQL still built from strings, invoices.py line 3' },
      ],
    },
  },
  'CWE-79': {
    good: [
      { passed: true, detail: '1 passed' },
      { passed: true, detail: '187 passed' },
      { passed: true, detail: '0 findings' },
    ],
    careless: {
      diff: [
        { kind: '-', text: '    return f"<h1>Hello {name}</h1>"' },
        { kind: '+', text: '    return escape(f"<h1>Hello {name}</h1>")' },
      ],
      refusedAt: 1,
      reports: [
        { passed: true, detail: '1 passed' },
        { passed: false, detail: '1 failed: test_greeting_renders_a_heading' },
      ],
    },
  },
  'CWE-639': {
    good: [
      { passed: true, detail: '1 passed' },
      { passed: true, detail: '342 passed' },
      { passed: true, detail: '0 findings' },
    ],
    careless: {
      diff: [
        { kind: '-', text: '    order = Order.query.get_or_404(order_id)' },
        { kind: '+', text: '    order = Order.query.filter_by(owner_id=current_user.id).first_or_404()' },
      ],
      refusedAt: 0,
      reports: [{ passed: false, detail: '1 failed: assert 200 == 404' }],
    },
  },
};

/**
 * When each check runs, as a share of the section's scroll progress: it starts, plays out on the building,
 * and reports at the end of its span. One after another, as AUTOSP runs them.
 */
export const CHECK_SPANS = [
  [0.08, 0.3],
  [0.34, 0.6],
  [0.64, 0.88],
] as const;

/**
 * The fix's flight through the gates in the sky (world/gates.ts): where along its path each barrier
 * stands (0 is the sandbox's roof, 1 past the last barrier), and where the climb off the roof ends.
 */
export const GATE_AT = [0.32, 0.56, 0.8] as const;
export const RISE_END = 0.12;
/** The gates come into play this far before their section reaches the top (negative progress), as the
 * camera comes round behind the fix. */
export const GATES_FROM = -0.35;

/** Smooth from `a` to `b` over [x0, x1] of `x`: the fix slows into each barrier and away from it. */
function stretch(x: number, x0: number, x1: number, a: number, b: number): number {
  return a + (b - a) * smoothstep(x0, x1, x);
}

export interface GateMoment {
  /** How far each check has got, 0 (not started) to 1 (reported). A check after a refusal never runs. */
  checks: readonly [number, number, number];
  /** How many checks have passed. */
  passed: number;
  /** True once the refusing check has said no. */
  refused: boolean;
  /** True once a good fix has passed all three. */
  cleared: boolean;
  /** The section's scroll progress, negative while it is still coming up the screen. The camera
   * moves to the building over ranges of this (shots.ts). */
  at: number;
  /** How far the fix has flown along its path, 0 (the sandbox's roof) to 1 (past the last barrier). It
   * reaches each barrier just as that check reports, and a refused fix flies back to the roof. */
  travel: number;
  /** The camera: how far it has come round behind the fix (0 to 1), then out to the side to see the
   * barriers it has been through. */
  chase: number;
  side: number;
}

/** Where the fix is at progress `p`: off the roof, then to each barrier as its check reports. */
function flight(p: number, refusedAt: GateIndex | null): number {
  const points: Array<[number, number]> = [
    // the climb off the roof is the tallest move of the beat: it gets a long stretch of scroll, so the
    // camera riding behind the fix climbs no faster than the scroll
    [0.0, 0],
    [0.26, RISE_END],
  ];
  CHECK_SPANS.forEach(([, end], i) => {
    const at = GATE_AT[i] ?? 1;
    // a refused fix stops at the barrier that refuses it, a little short of it
    points.push([end, refusedAt !== null && i === refusedAt ? at - 0.03 : at]);
  });
  points.push([0.96, 1]);
  let travel = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, a] = points[i - 1] ?? [0, 0];
    const [x1, b] = points[i] ?? [1, 1];
    if (refusedAt !== null && i - 2 > refusedAt) break;
    if (p >= x0) travel = stretch(p, x0, x1, a, b);
  }
  if (refusedAt === null) return travel;
  // sent back: after the strike it flies home to the sandbox's roof
  const struck = CHECK_SPANS[refusedAt][1];
  return travel * (1 - smoothstep(struck + 0.04, struck + 0.3, p));
}

function ramp(a: number, b: number, x: number): number {
  return Math.min(Math.max((x - a) / (b - a), 0), 1);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The checks at scroll progress `g` through the section (0 to 1, or negative while it is still coming
 * up the screen). `refusedAt` is null for the good fix. With `still` (reduced motion) the section jumps
 * straight to its final state once entered.
 */
export function gateMoment(g: number, refusedAt: GateIndex | null, still: boolean): GateMoment {
  const p = still ? (g > 0.12 ? 1 : 0) : g;
  // with reduced motion the camera has either not begun (-1) or is at the end of its moves (1)
  const at = still ? (g > 0.12 ? 1 : -1) : g;
  const raw = CHECK_SPANS.map(([from, to]) => smoothstep(from, to, p));
  const checks = raw.map((amount, i) => (refusedAt !== null && i > refusedAt ? 0 : amount)) as [
    number,
    number,
    number,
  ];
  const done = (i: number): boolean => (checks[i] ?? 0) >= 1;
  // the camera comes round behind the fix as the section arrives, and out to the side once it is
  // through (or, for a refused fix, to watch it go back)
  // Both are plain ramps over long stretches of scroll, eased once by the camera (shots.ts): a short
  // stretch, or a second ease on top, would swing the camera faster than the scroll that drives it
  const chase = still ? (g > 0.12 ? 1 : 0) : ramp(GATES_FROM, 0.1, g);
  const outFrom = refusedAt === null ? 0.8 : CHECK_SPANS[refusedAt][1] + 0.02;
  // out to the side by the end of the section, so it is done before the merge's camera begins
  const side = still ? (g > 0.12 ? 1 : 0) : ramp(outFrom, Math.max(outFrom + 0.16, 1), g);
  const travel = still ? (g > 0.12 ? (refusedAt === null ? 1 : 0) : 0) : flight(g, refusedAt);
  if (refusedAt === null) {
    return {
      checks,
      passed: [0, 1, 2].filter(done).length,
      refused: false,
      cleared: done(2),
      at,
      travel,
      chase,
      side,
    };
  }
  return {
    checks,
    passed: [0, 1, 2].filter((i) => i < refusedAt && done(i)).length,
    refused: done(refusedAt),
    cleared: false,
    at,
    travel,
    chase,
    side,
  };
}
