/**
 * The streets: the painted ground (street.frag.glsl draws the whole grid from world position) and
 * the streetlights standing along every sidewalk. The ground follows the camera so its edge is
 * never reached; the poles are instanced, and their heads glow at night.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { IUniform } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldPalette } from './palette';
import { mergeUniforms, scanUniforms } from './uniforms';
import type { SharedUniforms } from './uniforms';
import type { Quality } from './sky';
import { ROW } from './skyline';
import { GRID, blockCentres, gridDefines, seeded } from './grid';
import { instanced, materialPair } from './city';
import type { City } from './city';
import commonGlsl from './shaders/common.glsl?raw';
import fogGlsl from './shaders/fog.glsl?raw';
import mergeGlsl from './shaders/merge.glsl?raw';
import focusGlsl from './shaders/focus.glsl?raw';
import planeVert from './shaders/plane.vert.glsl?raw';
import streetFrag from './shaders/street.frag.glsl?raw';
import scanGlsl from './shaders/scan.glsl?raw';
import propsVert from './shaders/props.vert.glsl?raw';
import propsFrag from './shaders/props.frag.glsl?raw';
import haloVert from './shaders/lamphalo.vert.glsl?raw';
import haloFrag from './shaders/lamphalo.frag.glsl?raw';

/** A pole is this tall; its head (the part that glows) starts at HEAD. */
const POLE = 2.1;
const HEAD = 1.95;
/** Street trees: how many stand in a block, by tier, how far in from the kerb, and their spacing. */
const TREES: Record<Quality, number> = { high: 8, low: 4 };
const TREE_INSET = 0.5;

export interface Streets {
  readonly group: Group;
  /** Moves the ground with the camera. */
  update(camera: Vector3): void;
  dispose(): void;
}

export function createStreets(
  palette: WorldPalette,
  shared: SharedUniforms,
  quality: Quality,
  focus: Record<string, IUniform>,
  buildings: Pick<City, 'track'>,
): Streets {
  const defines = { ...gridDefines(quality), CITY_END: ROW.z.toFixed(1) };
  const { city } = palette;

  const groundGeometry = new PlaneGeometry(1400, 1400);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new ShaderMaterial({
    defines,
    uniforms: {
      uAsphalt: { value: city.asphalt },
      uSidewalk: { value: city.sidewalk },
      uPaint: { value: city.paint },
      uStreetLight: { value: city.streetLight },
      uSealed: { value: palette.sealed },
      uWindowWarm: { value: city.windowWarm },
      uNight: shared.uNight,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uAmbient: shared.uAmbient,
      uMoonLight: shared.uMoonLight,
      uGrade: shared.uGrade,
      ...mergeUniforms(shared),
      ...scanUniforms(shared),
    },
    vertexShader: planeVert,
    fragmentShader: commonGlsl + fogGlsl + mergeGlsl + scanGlsl + streetFrag,
  });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.frustumCulled = false;
  ground.renderOrder = 1; // after the buildings, so the ground under them is never shaded

  // Streetlights: the same spacing the ground shader uses for its pools of light
  const positions: Array<[number, number]> = [];
  const halfX = GRID.blockX / 2 - 0.4;
  const halfZ = GRID.blockZ / 2 - 0.4;
  for (const block of blockCentres(quality)) {
    for (let x = -GRID.blockX / 2 + GRID.lightSpacing; x < GRID.blockX / 2; x += GRID.lightSpacing) {
      positions.push([block.x + x, block.z - halfZ], [block.x + x, block.z + halfZ]);
    }
    positions.push([block.x - halfX, block.z], [block.x + halfX, block.z]);
  }
  const poleParts = [
    new BoxGeometry(0.07, POLE, 0.07).translate(0, POLE / 2, 0),
    new BoxGeometry(0.22, 0.12, 0.22).translate(0, HEAD + 0.06, 0),
  ];
  const poleGeometry = mergeGeometries(poleParts);
  for (const part of poleParts) part.dispose();
  const polePair = materialPair({
    defines,
    uniforms: {
      ...focus,
      uGlow: { value: city.streetLight },
      uGlowFrom: { value: HEAD },
      uNight: shared.uNight,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uAmbient: shared.uAmbient,
      uMoonLight: shared.uMoonLight,
      uGrade: shared.uGrade,
      ...mergeUniforms(shared),
    },
    vertexShader: propsVert,
    fragmentShader: commonGlsl + fogGlsl + mergeGlsl + focusGlsl + propsFrag,
  });
  const poleMaterial = polePair.plain;
  const colour = city.trim.clone().multiplyScalar(0.6);
  const poles = instanced(
    poleGeometry,
    poleMaterial,
    positions.map(([x, z]) => new Matrix4().setPosition(x, 0, z)),
    {
      aColor: { data: Float32Array.from(positions.flatMap(() => [colour.r, colour.g, colour.b])), size: 3 },
      aIndex: { data: new Float32Array(positions.length).fill(-1), size: 1 },
      aEmit: { data: new Float32Array(positions.length).fill(1), size: 1 },
    },
  );

  buildings.track(poles, polePair);

  // Street trees along the long sidewalks, between the streetlights. They share the props' material,
  // so they clear out of the camera's way with everything else.
  const treeRandom = seeded(0x54524545); // "TREE"
  const canopyParts = [
    new BoxGeometry(0.09, 0.9, 0.09).translate(0, 0.45, 0),
    new IcosahedronGeometry(0.5, 0).translate(0, 1.15, 0),
    new IcosahedronGeometry(0.36, 0).translate(0.16, 1.45, 0.1),
  ].map((part) => (part.index ? part.toNonIndexed() : part));
  const treeGeometry = mergeGeometries(canopyParts);
  for (const part of canopyParts) part.dispose();
  const treeSpots: Array<{ matrix: Matrix4; r: number; g: number; b: number }> = [];
  const treeHalfX = GRID.blockX / 2;
  const treeHalfZ = GRID.blockZ / 2 - TREE_INSET;
  for (const block of blockCentres(quality)) {
    for (let k = 0; k < TREES[quality]; k += 1) {
      const side = k % 2 === 0 ? -1 : 1;
      const slot = Math.floor(k / 2) + 0.5;
      const x =
        -treeHalfX + (slot / Math.ceil(TREES[quality] / 2)) * GRID.blockX + (treeRandom() - 0.5) * 0.8;
      const size = 0.9 + treeRandom() * 0.5;
      const colour = city.trees[treeRandom() < 0.5 ? 0 : 1] ?? city.bark;
      const tint = 0.8 + treeRandom() * 0.45;
      treeSpots.push({
        matrix: new Matrix4()
          .makeRotationY(treeRandom() * Math.PI * 2)
          .scale(new Vector3(size, size, size))
          .setPosition(block.x + x, 0, block.z + side * treeHalfZ),
        r: colour.r * tint,
        g: colour.g * tint,
        b: colour.b * tint,
      });
    }
  }
  const treePair = materialPair({
    defines,
    uniforms: {
      ...focus,
      uGlow: { value: city.streetLight },
      uGlowFrom: { value: 99 },
      uNight: shared.uNight,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uAmbient: shared.uAmbient,
      uMoonLight: shared.uMoonLight,
      uGrade: shared.uGrade,
      ...mergeUniforms(shared),
    },
    vertexShader: propsVert,
    fragmentShader: commonGlsl + fogGlsl + mergeGlsl + focusGlsl + propsFrag,
  });
  const trees = instanced(
    treeGeometry,
    treePair.plain,
    treeSpots.map((spot) => spot.matrix),
    {
      aColor: { data: Float32Array.from(treeSpots.flatMap((s) => [s.r, s.g, s.b])), size: 3 },
      aIndex: { data: new Float32Array(treeSpots.length).fill(-1), size: 1 },
      aEmit: { data: new Float32Array(treeSpots.length), size: 1 },
    },
  );
  buildings.track(trees, treePair);

  // The soft glow in the air around each streetlight's head, on the high tier
  const haloGeometry = new BufferGeometry();
  haloGeometry.setAttribute(
    'position',
    new BufferAttribute(Float32Array.from(positions.flatMap(([x, z]) => [x, HEAD + 0.06, z])), 3),
  );
  const haloMaterial = new ShaderMaterial({
    uniforms: {
      uStreetLight: { value: city.streetLight },
      uNight: shared.uNight,
      uScale: { value: 300 * Math.min(window.devicePixelRatio || 1, 1.75) },
      ...mergeUniforms(shared),
    },
    vertexShader: haloVert,
    fragmentShader: mergeGlsl + haloFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const halos = new Points(haloGeometry, haloMaterial);
  halos.frustumCulled = false;
  halos.renderOrder = 5;
  halos.visible = quality === 'high';

  const group = new Group();
  group.add(ground, poles, trees, halos);
  return {
    group,
    update(camera) {
      ground.position.x = camera.x;
      ground.position.z = camera.z;
    },
    dispose() {
      groundGeometry.dispose();
      groundMaterial.dispose();
      poleGeometry.dispose();
      polePair.plain.dispose();
      polePair.clearing.dispose();
      polePair.fading.dispose();
      treeGeometry.dispose();
      treePair.plain.dispose();
      treePair.clearing.dispose();
      treePair.fading.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
    },
  };
}
