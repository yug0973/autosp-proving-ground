/**
 * The sandbox: a clear volume that drops over the building carrying the chosen finding and closes
 * on the ground around it. It is drawn after the city, without writing depth, so the building
 * shows through it.
 */
import { AdditiveBlending, BoxGeometry, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three';
import type { Color } from 'three';
import type { Finding } from './city';
import sandboxVert from './shaders/sandbox.vert.glsl?raw';
import sandboxFrag from './shaders/sandbox.frag.glsl?raw';

/** Clearance around the building, in world units: sideways and above the roof. */
const MARGIN = { side: 1.6, top: 3 } as const;
/** How far above its resting place the volume starts its drop. */
const DROP_HEIGHT = 46;

export interface Sandbox {
  readonly mesh: Mesh;
  /** Places the volume around `finding`; `drop` runs 0 (high above, unseen) to 1 (closed). */
  update(finding: Finding, drop: number): void;
  dispose(): void;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function createSandbox(color: Color): Sandbox {
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  const size = new Vector3(1, 1, 1);
  const uniforms = {
    uColor: { value: color },
    uSize: { value: size },
    uShow: { value: 0 },
    uLanded: { value: 0 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: sandboxVert,
    fragmentShader: sandboxFrag,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  mesh.visible = false;

  return {
    mesh,
    update(finding, drop) {
      mesh.visible = drop > 0.001;
      if (!mesh.visible) return;
      // round the whole building, setbacks and roof tank included
      const { x, z, w, d } = finding.box;
      size.set(w + MARGIN.side * 2, finding.top + MARGIN.top, d + MARGIN.side * 2);
      mesh.scale.copy(size);
      mesh.position.set(x, (1 - easeOutCubic(drop)) * DROP_HEIGHT, z);
      uniforms.uShow.value = Math.min(drop * 3, 1);
      uniforms.uLanded.value = Math.max((drop - 0.92) / 0.08, 0);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
