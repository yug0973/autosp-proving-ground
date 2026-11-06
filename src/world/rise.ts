/**
 * The merge: sealed pixels lift off the crack and rise into the night ("software that rises").
 * The points are laid out once per building on the wall that faces the overview, inside the
 * crack's band, and only move after `start`.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import type { Color } from 'three';
import type { Finding } from './city';
import riseVert from './shaders/rise.vert.glsl?raw';
import riseFrag from './shaders/rise.frag.glsl?raw';

const COUNT = 180;
/** The overview camera's resting position; the points start on the wall facing it. */
const OVERVIEW = new Vector3(26, 27, 50);

export interface Rise {
  readonly points: Points;
  /** Seconds since the merge, or a negative number to hide the points. */
  update(finding: Finding, seconds: number, pixelRatio: number): void;
  dispose(): void;
}

export function createRise(color: Color): Rise {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) seeds[i] = (i * 0.6180339887) % 1;
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  const uniforms = { uColor: { value: color }, uTime: { value: 0 }, uScale: { value: 320 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: riseVert,
    fragmentShader: riseFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 13;
  let laidOutFor: Finding | null = null;

  /** Scatters the points over the crack band on the wall that faces the overview. */
  function layOut(finding: Finding): void {
    const { x, z, w, d, h } = finding.box;
    const dx = OVERVIEW.x - x;
    const dz = OVERVIEW.z - z;
    const alongX = Math.abs(dx) <= Math.abs(dz); // the wall facing the overview runs along x
    for (let i = 0; i < COUNT; i += 1) {
      const s = seeds[i] ?? 0;
      const across = (((i * 0.7548776662) % 1) - 0.5) * 0.5;
      const up = 0.18 + ((i * 0.569840291) % 1) * 0.74;
      positions[i * 3] = alongX ? x + across * w : x + Math.sign(dx) * (w / 2 + 0.2);
      positions[i * 3 + 1] = up * h + s * 0.3;
      positions[i * 3 + 2] = alongX ? z + Math.sign(dz) * (d / 2 + 0.2) : z + across * d;
    }
    (geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    laidOutFor = finding;
  }

  return {
    points,
    update(finding, seconds, pixelRatio) {
      points.visible = seconds >= 0 && seconds < 6.5;
      if (!points.visible) return;
      if (laidOutFor !== finding) layOut(finding);
      uniforms.uTime.value = seconds;
      uniforms.uScale.value = 320 * pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
