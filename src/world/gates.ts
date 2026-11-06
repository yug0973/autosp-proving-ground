/**
 * The gates: three checks standing in the air above the rooftops as barriers of lit square
 * pixels, and the fix itself, a small block of pixels that rises off the sandbox roof and flies
 * through them.
 *
 * Each barrier waits dim, with a scan line; as the fix passes it turns lime, spreading out from the
 * crossing; a refusing barrier strikes orange-red, its pixels jolt, rings pulse out from the
 * impact, and the fix recoils and goes back the way it came. Those events are timed from the
 * moment they happen (not from the scroll), so the flash reads the same however fast the visitor
 * scrolls; scrolling back before an event resets it.
 */
import {
  BoxGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Color } from 'three';
import type { Finding } from './city';
import { GATE_AT, RISE_END } from '../lib/gates';
import type { GateIndex, GateMoment } from '../lib/gates';
import commonGlsl from './shaders/common.glsl?raw';
import barrierVert from './shaders/barrier.vert.glsl?raw';
import barrierFrag from './shaders/barrier.frag.glsl?raw';

/** Path: how far above the roof it flies, and how far it flies. Gate size is width x height. */
const ALTITUDE = 12;
const LENGTH = 70;
const GATE = { w: 13, h: 9 } as const;
const SANDBOX_TOP = 3; // the sandbox's clearance above the roof (sandbox.ts MARGIN.top)
const UP = new Vector3(0, 1, 0);
/** The overview camera's resting position; the path runs across the view from it. */
const OVERVIEW = new Vector3(26, 27, 50);
/** "Since" for a barrier that has not decided, or when there is no motion to show. */
const LONG_AGO = 99;
const BARRIER_STATE = { waiting: 0, passed: 1, refused: 2 } as const;

export interface GateColors {
  readonly waiting: Color;
  readonly passed: Color;
  readonly refused: Color;
  readonly cleared: Color;
}

export interface GatePath {
  /** Start (sandbox roof), the top of the rise, the end of the path. */
  readonly start: Vector3;
  readonly rise: Vector3;
  readonly end: Vector3;
  /** Unit vectors: along the path, and out to the side the overview camera is on. */
  readonly along: Vector3;
  readonly side: Vector3;
}

export interface Gates {
  readonly meshes: Mesh[];
  /** The path for `finding`, written into `out`. */
  path(finding: Finding, out: GatePath): void;
  /** Where the fix is at `travel` (0 to 1) along `path`. */
  pointAt(path: GatePath, travel: number, out: Vector3): Vector3;
  /**
   * Places and colours everything for this moment; `show` 0 hides the gates. `seconds` is the
   * clock; `still` (reduced motion) shows each barrier's end state at once.
   */
  update(
    path: GatePath,
    moment: GateMoment,
    refusedAt: GateIndex | null,
    show: number,
    seconds: number,
    still: boolean,
  ): void;
  /** The top edge of the refusing barrier while it holds the fix back, or null. */
  flag(out: Vector3): Vector3 | null;
  dispose(): void;
}

export function createGatePath(): GatePath {
  return {
    start: new Vector3(),
    rise: new Vector3(),
    end: new Vector3(),
    along: new Vector3(),
    side: new Vector3(),
  };
}

/** The tallest point within a radius of (x, z), so the path can fly above the skyline. */
export type HeightAround = (x: number, z: number, radius: number) => number;

export function createGates(colors: GateColors, heightAround: HeightAround): Gates {
  // The flight height for each building's path, worked out once: high enough to clear every
  // roof and spire under the path by a few storeys.
  const altitudes = new Map<number, number>();
  const geometry = new PlaneGeometry(GATE.w, GATE.h);
  const barriers = GATE_AT.map(() => {
    const uniforms = {
      uSize: { value: new Vector2(GATE.w, GATE.h) },
      uState: { value: BARRIER_STATE.waiting as number },
      uSince: { value: LONG_AGO },
      uTime: { value: 0 },
      uShow: { value: 0 },
      uIdle: { value: colors.waiting },
      uPass: { value: colors.cleared },
      uRefuse: { value: colors.refused },
    };
    const material = new ShaderMaterial({
      uniforms,
      vertexShader: barrierVert,
      fragmentShader: commonGlsl + barrierFrag,
      transparent: true,
      // the pixels write depth (the gaps between them are discarded), so the depth of field sees
      // the barrier where it stands rather than the sky behind it
      depthWrite: true,
      side: DoubleSide,
      blending: NormalBlending,
    });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 11;
    mesh.frustumCulled = false;
    mesh.visible = false;
    const state: number = BARRIER_STATE.waiting;
    return { mesh, material, uniforms, state, decidedAt: -1 };
  });

  // the fix itself: a 3 x 3 grid of pixels facing along the path, so the camera riding behind it
  // sees a small piece of the dot matrix
  const PIXEL = 0.44;
  const PITCH = 0.6;
  const pixels = [-1, 0, 1].flatMap((x) =>
    [-1, 0, 1].map((y) => new BoxGeometry(PIXEL, PIXEL, 0.3).translate(x * PITCH, y * PITCH, 0)),
  );
  const packetGeometry = mergeGeometries(pixels);
  for (const pixel of pixels) pixel.dispose();
  const packetMaterial = new MeshBasicMaterial({ color: colors.passed.clone(), toneMapped: false });
  const packet = new Mesh(packetGeometry, packetMaterial);
  packet.renderOrder = 12;
  packet.visible = false;

  const scratch = new Vector3();
  const flagAt = new Vector3();
  let flagShown = false;

  const gates: Gates = {
    meshes: [...barriers.map((barrier) => barrier.mesh), packet],
    path(finding, out) {
      const { x, z } = finding.box;
      out.start.set(x, finding.top + SANDBOX_TOP, z);
      out.side.set(OVERVIEW.x - x, 0, OVERVIEW.z - z).normalize();
      out.along.crossVectors(UP, out.side).normalize();
      let altitude = altitudes.get(finding.building);
      if (altitude === undefined) {
        let clear = 0;
        for (let s = 6; s <= LENGTH + 8; s += 4) {
          clear = Math.max(clear, heightAround(x + out.along.x * s, z + out.along.z * s, GATE.w / 2 + 2));
        }
        altitude = Math.max(finding.top + SANDBOX_TOP + ALTITUDE, clear + GATE.h + 4);
        altitudes.set(finding.building, altitude);
      }
      out.rise.copy(out.start).setY(altitude);
      out.end.copy(out.rise).addScaledVector(out.along, LENGTH);
    },
    pointAt(path, travel, out) {
      if (travel <= RISE_END) return out.lerpVectors(path.start, path.rise, travel / RISE_END);
      return out.lerpVectors(path.rise, path.end, (travel - RISE_END) / (1 - RISE_END));
    },
    update(path, moment, refusedAt, show, seconds, still) {
      const yaw = Math.atan2(path.along.x, path.along.z);
      flagShown = false;
      let recoil = 0;
      barriers.forEach((barrier, i) => {
        const state =
          refusedAt === i && moment.refused
            ? BARRIER_STATE.refused
            : i < moment.passed
              ? BARRIER_STATE.passed
              : BARRIER_STATE.waiting;
        if (state !== barrier.state) {
          barrier.state = state;
          barrier.decidedAt = state === BARRIER_STATE.waiting ? -1 : seconds;
        }
        const since = still || barrier.decidedAt < 0 ? LONG_AGO : seconds - barrier.decidedAt;
        barrier.uniforms.uState.value = state;
        barrier.uniforms.uSince.value = since;
        barrier.uniforms.uTime.value = still ? 0 : seconds;
        barrier.uniforms.uShow.value = show;
        barrier.mesh.visible = show > 0.001;
        gates.pointAt(path, GATE_AT[i] ?? 0, scratch);
        barrier.mesh.position.copy(scratch);
        barrier.mesh.rotation.y = yaw;
        if (state === BARRIER_STATE.refused) {
          flagAt.copy(scratch).addScaledVector(UP, GATE.h / 2 + 0.6);
          flagShown = show > 0.5;
          // the fix shudders back off the barrier it struck
          if (since < 2) recoil = Math.sin(since * 26) * Math.exp(-since * 4) * 0.7;
        }
      });
      packet.visible = show > 0.001;
      if (packet.visible) {
        gates.pointAt(path, moment.travel, packet.position);
        packet.position.addScaledVector(path.along, -Math.abs(recoil));
        packet.rotation.y = yaw;
        packetMaterial.color.copy(
          moment.refused ? colors.refused : moment.cleared ? colors.cleared : colors.passed,
        );
      }
    },
    flag(out) {
      return flagShown ? out.copy(flagAt) : null;
    },
    dispose() {
      geometry.dispose();
      for (const barrier of barriers) barrier.material.dispose();
      packetGeometry.dispose();
      packetMaterial.dispose();
    },
  };
  return gates;
}
