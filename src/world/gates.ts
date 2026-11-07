/**
 * The gates: three checks standing in the air above the rooftops as barriers of lit square pixels,
 * and the fix itself, a small block of pixels that rises off the sandbox roof and flies through them
 * with a short trail of pixels behind it.
 *
 * Each barrier waits dim, with a scan line; as the fix passes it turns lime, spreading out from the
 * crossing; a refusing barrier strikes orange-red, its pixels jolt, rings pulse out from the
 * impact, and the fix recoils and flies back to the sandbox. The flight follows the gates' timeline
 * (lib/gates.ts), so the fix reaches each barrier just as that check reports in the panel. The
 * strikes are timed from the moment they happen (not from the scroll), so the flash reads the same
 * however fast the visitor scrolls; scrolling back before an event resets it.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { Color, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
/** The trail: how many pixels, how far apart along the path (as travel), and their size. */
const TRAIL = { count: 14, spacing: 0.006, size: 0.5 } as const;

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
  readonly objects: Object3D[];
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
  /** The top edge of barrier `i`, written into `out`, while the gates show; null when they do not. */
  top(i: number, out: Vector3): Vector3 | null;
  /** Each barrier's state as of the last update: 0 waiting, 1 passed, 2 refused. */
  state(i: number): number;
  /** Drawing-buffer pixels per world unit at one unit away, so the trail's pixels keep their size. */
  setViewScale(pixels: number): void;
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

const TRAIL_VERTEX = /* glsl */ `
attribute float aFade;
uniform float uSize;
uniform float uScale;
varying float vFade;
void main() {
  vFade = aFade;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uScale * aFade / -view.z;
  gl_Position = projectionMatrix * view;
}
`;
const TRAIL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uShow;
varying float vFade;
void main() {
  // square pixels, as everything in the dot matrix is
  gl_FragColor = vec4(uColor, vFade * 0.8 * uShow);
  #include <colorspace_fragment>
}
`;

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

  // its trail: pixels left behind along the path, smaller and fainter the further back they are
  const trailPositions = new Float32Array(TRAIL.count * 3);
  const trailFade = new Float32Array(TRAIL.count);
  for (let i = 0; i < TRAIL.count; i += 1) trailFade[i] = 1 - i / TRAIL.count;
  const trailGeometry = new BufferGeometry();
  const trailAttribute = new BufferAttribute(trailPositions, 3);
  trailGeometry.setAttribute('position', trailAttribute);
  trailGeometry.setAttribute('aFade', new BufferAttribute(trailFade, 1));
  const trailUniforms = {
    uColor: { value: colors.passed.clone() },
    uShow: { value: 0 },
    uSize: { value: TRAIL.size },
    uScale: { value: 900 },
  };
  const trailMaterial = new ShaderMaterial({
    uniforms: trailUniforms,
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const trail = new Points(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  trail.visible = false;
  trail.renderOrder = 12;

  const scratch = new Vector3();
  const flagAt = new Vector3();
  let flagShown = false;
  let shown = false;
  const tops = GATE_AT.map(() => new Vector3());

  const gates: Gates = {
    objects: [...barriers.map((barrier) => barrier.mesh), packet, trail],
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
      if (travel <= RISE_END) return out.lerpVectors(path.start, path.rise, Math.max(travel, 0) / RISE_END);
      return out.lerpVectors(path.rise, path.end, (travel - RISE_END) / (1 - RISE_END));
    },
    update(path, moment, refusedAt, show, seconds, still) {
      const yaw = Math.atan2(path.along.x, path.along.z);
      flagShown = false;
      shown = show > 0.5;
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
        tops[i]?.copy(scratch).addScaledVector(UP, GATE.h / 2 + 0.6);
        if (state === BARRIER_STATE.refused) {
          flagAt.copy(scratch).addScaledVector(UP, GATE.h / 2 + 0.6);
          flagShown = show > 0.5;
          // the fix shudders back off the barrier it struck
          if (since < 2) recoil = Math.sin(since * 26) * Math.exp(-since * 4) * 0.7;
        }
      });
      const colour = moment.refused ? colors.refused : moment.cleared ? colors.cleared : colors.passed;
      packet.visible = show > 0.001;
      if (packet.visible) {
        gates.pointAt(path, moment.travel, packet.position);
        packet.position.addScaledVector(path.along, -Math.abs(recoil));
        packet.rotation.y = yaw;
        packetMaterial.color.copy(colour);
      }
      // the trail follows the fix while it moves, and fades away once it rests
      trail.visible = packet.visible && !still;
      if (trail.visible) {
        const heading = moment.refused ? 1 : -1; // a fix flying home leaves its trail ahead of it
        for (let i = 0; i < TRAIL.count; i += 1) {
          gates.pointAt(path, Math.max(moment.travel + heading * (i + 1) * TRAIL.spacing, 0), scratch);
          trailPositions.set([scratch.x, scratch.y, scratch.z], i * 3);
        }
        trailAttribute.needsUpdate = true;
        trailUniforms.uColor.value.copy(colour);
        const moving = moment.travel > 0.005 && moment.travel < 0.995;
        trailUniforms.uShow.value = show * (moving ? 1 : 0);
      }
    },
    flag(out) {
      return flagShown ? out.copy(flagAt) : null;
    },
    top(i, out) {
      const at = tops[i];
      return shown && at ? out.copy(at) : null;
    },
    state(i) {
      return barriers[i]?.state ?? BARRIER_STATE.waiting;
    },
    setViewScale(pixels) {
      trailUniforms.uScale.value = pixels;
    },
    dispose() {
      geometry.dispose();
      for (const barrier of barriers) barrier.material.dispose();
      packetGeometry.dispose();
      packetMaterial.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
    },
  };
  return gates;
}
