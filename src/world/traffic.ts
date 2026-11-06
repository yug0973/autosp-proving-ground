/**
 * Life on the street: cars along every lane (grid.ts) and pedestrians walking the sidewalks. Both
 * move in closed form in their vertex shaders, from the shared clock and each one's lane or block,
 * so the CPU does no work per frame however many there are. At night each car also carries four
 * lamps, drawn as glowing points, which turn the avenues into streams of light.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Shape,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldPalette } from './palette';
import { mergeUniforms } from './uniforms';
import type { SharedUniforms } from './uniforms';
import type { Quality } from './sky';
import { GRID, blockCentres, gridDefines, laneLength, lanes, seeded } from './grid';
import commonGlsl from './shaders/common.glsl?raw';
import fogGlsl from './shaders/fog.glsl?raw';
import mergeGlsl from './shaders/merge.glsl?raw';
import trafficGlsl from './shaders/traffic.glsl?raw';
import carVert from './shaders/car.vert.glsl?raw';
import carFrag from './shaders/car.frag.glsl?raw';
import carlightVert from './shaders/carlight.vert.glsl?raw';
import carlightFrag from './shaders/carlight.frag.glsl?raw';
import beamVert from './shaders/carbeam.vert.glsl?raw';
import beamFrag from './shaders/carbeam.frag.glsl?raw';
import personVert from './shaders/person.vert.glsl?raw';
import personFrag from './shaders/person.frag.glsl?raw';

/** Gaps between cars along a lane, in world units: avenues run denser than cross streets. */
const SPACING = { avenue: [6, 12], street: [9, 17] } as const;
/** People per block, and how fast they walk (units per second; about 1.4 m/s). */
const PEOPLE: Record<Quality, number> = { high: 8, low: 3 };
const WALK = 0.47;
/**
 * The kinds of vehicle, as a stretch of the same body (length, height) and how common each is: a saloon
 * most of all, then an SUV, a van and a long box truck. One body, so they share one draw call.
 */
const VEHICLES: ReadonlyArray<{ readonly shape: readonly [number, number]; readonly share: number }> = [
  { shape: [1, 1], share: 0.62 },
  { shape: [1.04, 1.24], share: 0.22 },
  { shape: [1.2, 1.5], share: 0.11 },
  { shape: [1.65, 1.85], share: 0.05 },
];

/** A car from the side, as a closed outline (z forward, y up), extruded across its width: bonnet,
 * sloped windscreen, roof, sloped rear window and boot. */
function carBody(): BufferGeometry {
  const side = new Shape();
  const outline: ReadonlyArray<readonly [number, number]> = [
    [-0.76, 0.1],
    [0.76, 0.1],
    [0.78, 0.28],
    [0.72, 0.36],
    [0.32, 0.4],
    [0.12, 0.62],
    [-0.34, 0.63],
    [-0.54, 0.42],
    [-0.76, 0.38],
    [-0.78, 0.26],
  ];
  outline.forEach(([z, y], i) => {
    if (i === 0) side.moveTo(z, y);
    else side.lineTo(z, y);
  });
  side.closePath();
  const width = 0.62;
  const shell = new ExtrudeGeometry(side, { depth: width, bevelEnabled: false });
  // the outline was drawn in the x-y plane: turn it so z runs forward and it spans the car's width
  shell.rotateY(-Math.PI / 2);
  shell.translate(width / 2, 0, 0);
  const parts: BufferGeometry[] = [shell];
  for (const z of [-0.48, 0.48]) {
    for (const x of [-0.3, 0.3]) {
      // a wheel is a few pixels at most, and there are thousands: a box, with the shader's round hub
      const wheel = new BoxGeometry(0.05, 0.23, 0.23).translate(x + Math.sign(x) * 0.03, 0.115, z);
      parts.push(wheel.toNonIndexed());
    }
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/** The four lamps, car-local (x across, y up, z forward), and which kind each is. */
const LAMPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.22, 0.24, 0.76, 0],
  [0.22, 0.24, 0.76, 0],
  [-0.22, 0.24, -0.76, 1],
  [0.22, 0.24, -0.76, 1],
];

function instancedGeometry(
  base: BufferGeometry,
  count: number,
  attributes: Record<string, { data: Float32Array; size: number }>,
): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.copy(base as InstancedBufferGeometry);
  geometry.instanceCount = count;
  for (const [name, { data, size }] of Object.entries(attributes)) {
    geometry.setAttribute(name, new InstancedBufferAttribute(data, size));
  }
  return geometry;
}

export interface Traffic {
  readonly group: Group;
  dispose(): void;
}

export function createTraffic(palette: WorldPalette, shared: SharedUniforms, quality: Quality): Traffic {
  const random = seeded(0x434152); // "CAR"
  const defines = gridDefines(quality);
  const lengths = laneLength(quality);
  const { city } = palette;

  // --- Cars ---------------------------------------------------------------------------------
  const laneData: number[] = [];
  const phaseData: number[] = [];
  const paintData: number[] = [];
  const shapeData: number[] = [];
  for (const lane of lanes(quality)) {
    const len = lane.axis === 'x' ? lengths.x : lengths.z;
    const [lo, hi] = lane.axis === 'z' ? SPACING.avenue : SPACING.street;
    let s = random() * hi;
    while (s < len - lo) {
      laneData.push(
        lane.axis === 'x' ? 0 : 1,
        lane.at,
        lane.direction,
        lane.speed * (0.92 + random() * 0.16),
      );
      phaseData.push(s);
      const paint = city.carPaints[Math.floor(random() * city.carPaints.length)] ?? city.carPaints[0];
      paintData.push(paint?.r ?? 0, paint?.g ?? 0, paint?.b ?? 0);
      let pick = random();
      const vehicle =
        VEHICLES.find((kind) => {
          pick -= kind.share;
          return pick <= 0;
        }) ?? VEHICLES[0];
      shapeData.push(vehicle?.shape[0] ?? 1, vehicle?.shape[1] ?? 1);
      s += lo + random() * (hi - lo);
    }
  }
  const cars = phaseData.length;
  const body = carBody();
  const lane4 = Float32Array.from(laneData);
  const phase1 = Float32Array.from(phaseData);
  const shape2 = Float32Array.from(shapeData);
  const carGeometry = instancedGeometry(body, cars, {
    aLane: { data: lane4, size: 4 },
    aPhase: { data: phase1, size: 1 },
    aPaint: { data: Float32Array.from(paintData), size: 3 },
    aShape: { data: shape2, size: 2 },
  });
  body.dispose();
  const carMaterial = new ShaderMaterial({
    defines,
    uniforms: {
      uTime: shared.uTime,
      uNight: shared.uNight,
      uSky: shared.uSky,
      uHeadlight: { value: city.headlight },
      uTaillight: { value: city.taillight },
      uWindowDark: { value: city.windowDark },
      uStreetLight: { value: city.streetLight },
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uAmbient: shared.uAmbient,
      uMoonLight: shared.uMoonLight,
      uGrade: shared.uGrade,
      ...mergeUniforms(shared),
    },
    vertexShader: trafficGlsl + carVert,
    fragmentShader: commonGlsl + fogGlsl + mergeGlsl + carFrag,
  });
  const carMesh = new Mesh(carGeometry, carMaterial);
  carMesh.frustumCulled = false;

  // --- Their lamps, as glowing points ---------------------------------------------------------
  const lampCount = cars * LAMPS.length;
  const lampLane = new Float32Array(lampCount * 4);
  const lampPhase = new Float32Array(lampCount);
  const lampOffset = new Float32Array(lampCount * 3);
  const lampKind = new Float32Array(lampCount);
  for (let c = 0; c < cars; c += 1) {
    LAMPS.forEach(([x, y, z, kind], k) => {
      const i = c * LAMPS.length + k;
      lampLane.set(lane4.subarray(c * 4, c * 4 + 4), i * 4);
      lampPhase[i] = phase1[c] ?? 0;
      lampOffset.set([x, y * (shape2[c * 2 + 1] ?? 1), z * (shape2[c * 2] ?? 1)], i * 3);
      lampKind[i] = kind;
    });
  }
  const lampGeometry = new BufferGeometry();
  lampGeometry.setAttribute('position', new BufferAttribute(new Float32Array(lampCount * 3), 3));
  lampGeometry.setAttribute('aLane', new BufferAttribute(lampLane, 4));
  lampGeometry.setAttribute('aPhase', new BufferAttribute(lampPhase, 1));
  lampGeometry.setAttribute('aOffset', new BufferAttribute(lampOffset, 3));
  lampGeometry.setAttribute('aKind', new BufferAttribute(lampKind, 1));
  const lampMaterial = new ShaderMaterial({
    defines,
    uniforms: {
      uTime: shared.uTime,
      uNight: shared.uNight,
      uScale: { value: 230 * Math.min(window.devicePixelRatio || 1, 1.75) },
      uHeadlight: { value: city.headlight },
      uTaillight: { value: city.taillight },
      ...mergeUniforms(shared),
    },
    vertexShader: trafficGlsl + carlightVert,
    fragmentShader: mergeGlsl + carlightFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  // --- The light they throw on the road ahead (the high tier only) -----------------------------
  const beamPlane = new PlaneGeometry(1.5, 3.6);
  beamPlane.rotateX(-Math.PI / 2);
  beamPlane.scale(1, 1, -1); // the far end of the beam is towards the car's front
  beamPlane.translate(0, 0.03, 1.8);
  const beamGeometry = instancedGeometry(beamPlane, cars, {
    aLane: { data: lane4, size: 4 },
    aPhase: { data: phase1, size: 1 },
    aShape: { data: shape2, size: 2 },
  });
  beamPlane.dispose();
  const beamMaterial = new ShaderMaterial({
    defines,
    uniforms: {
      uTime: shared.uTime,
      uNight: shared.uNight,
      uHeadlight: { value: city.headlight },
      ...mergeUniforms(shared),
    },
    vertexShader: trafficGlsl + beamVert,
    fragmentShader: mergeGlsl + beamFrag,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  const beams = new Mesh(beamGeometry, beamMaterial);
  beams.frustumCulled = false;
  beams.renderOrder = 2;
  beams.visible = quality === 'high';

  const lamps = new Points(lampGeometry, lampMaterial);
  lamps.frustumCulled = false;
  lamps.renderOrder = 5;

  // --- Pedestrians ----------------------------------------------------------------------------
  const blockData: number[] = [];
  const startData: number[] = [];
  const speedData: number[] = [];
  const insetData: number[] = [];
  const colourData: number[] = [];
  const perimeter = 2 * (GRID.blockX + GRID.blockZ);
  for (const block of blockCentres(quality)) {
    for (let k = 0; k < PEOPLE[quality]; k += 1) {
      blockData.push(block.x, block.z);
      startData.push(random() * perimeter);
      speedData.push(WALK * (0.75 + random() * 0.5) * (random() < 0.5 ? -1 : 1));
      insetData.push(0.25 + random() * 0.55);
      const colour = city.people[Math.floor(random() * city.people.length)] ?? city.people[0];
      colourData.push(colour?.r ?? 0, colour?.g ?? 0, colour?.b ?? 0);
    }
  }
  const people = startData.length;
  const figureParts = [
    new CylinderGeometry(0.075, 0.085, 0.46, 6).translate(0, 0.23, 0),
    new BoxGeometry(0.11, 0.11, 0.11).translate(0, 0.53, 0),
  ];
  const figure = mergeGeometries(figureParts);
  for (const part of figureParts) part.dispose();
  const personGeometry = instancedGeometry(figure, people, {
    aBlock: { data: Float32Array.from(blockData), size: 2 },
    aStart: { data: Float32Array.from(startData), size: 1 },
    aSpeed: { data: Float32Array.from(speedData), size: 1 },
    aInset: { data: Float32Array.from(insetData), size: 1 },
    aColor: { data: Float32Array.from(colourData), size: 3 },
  });
  figure.dispose();
  const personMaterial = new ShaderMaterial({
    defines,
    uniforms: {
      uTime: shared.uTime,
      uNight: shared.uNight,
      uStreetLight: { value: city.streetLight },
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
      uAmbient: shared.uAmbient,
      uMoonLight: shared.uMoonLight,
      uGrade: shared.uGrade,
      ...mergeUniforms(shared),
    },
    vertexShader: personVert,
    fragmentShader: commonGlsl + fogGlsl + mergeGlsl + personFrag,
  });
  const crowd = new Mesh(personGeometry, personMaterial);
  crowd.frustumCulled = false;

  const group = new Group();
  group.add(carMesh, beams, lamps, crowd);
  return {
    group,
    dispose() {
      carGeometry.dispose();
      carMaterial.dispose();
      beamGeometry.dispose();
      beamMaterial.dispose();
      lampGeometry.dispose();
      lampMaterial.dispose();
      personGeometry.dispose();
      personMaterial.dispose();
    },
  };
}
