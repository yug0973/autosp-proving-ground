/**
 * The three gates every fix must pass (the reproduction test, the existing suite and a fresh
 * static scan), what each one reports for each finding, and a careless fix per finding that one
 * gate refuses. Also the timeline that turns scroll progress through the gates section into what
 * the world shows and what the gate list says, so the two always agree.
 */
import type { DiffLine } from './fixes';
import type { FindingId } from './story';

export const GATE_NAMES = [
  'Reproduction test passes',
  'Existing test suite passes',
  'Static scan is clear',
] as const;

export type GateIndex = 0 | 1 | 2;

/** Each check's short name, for the flag a refusing barrier raises in the scene. */
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

/** The rise takes this share of the whole trip, the run through the gates the rest. The rise is
 * about as long as the run, so giving it a fair share keeps the fix (and the camera riding behind
 * it) from launching several times faster than it cruises. */
export const RISE_END = 0.4;
/** Where each gate stands along the run, as a share of the run: 5/22, a half and 17/22 of it. */
const GATE_ALONG = [5 / 22, 1 / 2, 17 / 22] as const;
/** Where each gate stands along the path, as a share of the whole trip. */
export const GATE_AT = [
  RISE_END + (1 - RISE_END) * GATE_ALONG[0],
  RISE_END + (1 - RISE_END) * GATE_ALONG[1],
  RISE_END + (1 - RISE_END) * GATE_ALONG[2],
] as const;

export interface GateMoment {
  /** How far the fix has travelled along the path, 0 (on the sandbox roof) to 1 (past the last gate). */
  travel: number;
  /** How many gates it has passed. */
  passed: number;
  /** True once the refusing gate has said no. */
  refused: boolean;
  /** True once a good fix has passed all three. */
  cleared: boolean;
  /** The section's scroll progress, negative while it is still coming up the screen. The camera
   * moves behind the fix and then out to the side over ranges of this (shots.ts). */
  at: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The gates at scroll progress `g` through the section (0 to 1, or negative while it is still
 * coming up the screen). `refusedAt` is null for the good
 * fix. With `still` (reduced motion) the section jumps straight to its final state once entered.
 */
export function gateMoment(g: number, refusedAt: GateIndex | null, still: boolean): GateMoment {
  const p = still ? (g > 0.12 ? 1 : 0) : g;
  // with reduced motion the camera has either not begun (-1) or is at the end of its moves (1)
  const at = still ? (g > 0.12 ? 1 : -1) : g;
  if (refusedAt === null) {
    const travel = smoothstep(0.08, 0.62, p);
    return {
      travel,
      passed: GATE_AT.filter((gate) => travel >= gate).length,
      refused: false,
      cleared: travel >= 0.98,
      at,
    };
  }
  // A careless fix runs up to the refusing gate, is stopped there, then goes back to the sandbox
  const stop = GATE_AT[refusedAt] - 0.02;
  const forward = smoothstep(0.08, 0.46, p) * stop;
  const back = smoothstep(0.6, 0.9, p);
  return {
    travel: forward * (1 - back),
    passed: GATE_AT.filter((gate) => forward >= gate).length,
    refused: p >= 0.46,
    cleared: false,
    at,
  };
}
