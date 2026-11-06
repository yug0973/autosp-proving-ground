/**
 * The sky: a dome that follows the camera, plus decks of cloud the camera descends through.
 *
 * Colours come from the atmosphere (one set of live Color objects), so the sky, the clouds and
 * the fog always agree on the time of day. Cloud shapes are noise fixed in the world: the planes
 * follow the camera so their edges are never reached, but the clouds themselves stay put.
 */
import { DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { IUniform } from 'three';
import type { Atmosphere } from './atmosphere';
import type { SharedUniforms } from './uniforms';
import commonGlsl from './shaders/common.glsl?raw';
import skyVert from './shaders/sky.vert.glsl?raw';
import skyFrag from './shaders/sky.frag.glsl?raw';
import planeVert from './shaders/plane.vert.glsl?raw';
import cloudFrag from './shaders/cloud.frag.glsl?raw';

export type Quality = 'low' | 'high';

interface CloudLayer {
  /** Height of the deck, in world units. */
  readonly y: number;
  readonly opacity: number;
  readonly scale: number;
}

/** From the highest deck down. The camera starts above all of them and ends below all of them. */
const LAYERS: readonly CloudLayer[] = [
  { y: 96, opacity: 0.95, scale: 0.011 },
  { y: 84, opacity: 0.8, scale: 0.014 },
  { y: 72, opacity: 0.7, scale: 0.017 },
];

const DOME_RADIUS = 900;
const DECK_SIZE = 900;

export interface Sky {
  readonly group: Group;
  /** Moves the dome and decks with the camera and refreshes their colours. Call every frame. The decks
   * are left out above the city, where the tear's own cloud deck is what the visitor sees. */
  update(camera: Vector3, atmosphere: Atmosphere, decks: boolean): void;
  dispose(): void;
}

export function createSky(atmosphere: Atmosphere, shared: SharedUniforms, quality: Quality): Sky {
  const group = new Group();
  const camera = new Vector3();

  const domeUniforms = {
    uZenith: { value: atmosphere.zenith },
    uHorizon: { value: atmosphere.horizon },
    uGlow: { value: atmosphere.duskGlow },
    uDusk: { value: 0 },
    uNight: shared.uNight,
    uTime: shared.uTime,
  };
  const domeMaterial = new ShaderMaterial({
    uniforms: domeUniforms,
    vertexShader: skyVert,
    fragmentShader: commonGlsl + skyFrag,
    side: DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const domeGeometry = new SphereGeometry(DOME_RADIUS, 32, 16);
  const dome = new Mesh(domeGeometry, domeMaterial);
  // after the opaque city, with the depth test on: only pixels that are really sky are shaded
  dome.renderOrder = 50;
  dome.frustumCulled = false;
  group.add(dome);

  const layers = quality === 'high' ? LAYERS : LAYERS.slice(0, 2);
  const deckGeometry = new PlaneGeometry(DECK_SIZE, DECK_SIZE);
  deckGeometry.rotateX(-Math.PI / 2);
  const decks = layers.map((layer, index) => {
    const uniforms: Record<string, IUniform> = {
      uLit: { value: atmosphere.cloudLit },
      uShade: { value: atmosphere.cloudShade },
      uFogColor: shared.uFogColor,
      uCamPos: { value: camera },
      uLayerY: { value: layer.y },
      uOpacity: { value: layer.opacity },
      uTime: shared.uTime,
      uScale: { value: layer.scale },
    };
    const material = new ShaderMaterial({
      uniforms,
      defines: { OCTAVES: quality === 'high' ? 5 : 3 },
      vertexShader: planeVert,
      fragmentShader: commonGlsl + cloudFrag,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const mesh = new Mesh(deckGeometry, material);
    mesh.position.y = layer.y;
    mesh.renderOrder = index;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, material };
  });

  return {
    group,
    update(position, state, showDecks) {
      camera.copy(position);
      dome.position.copy(position);
      domeUniforms.uDusk.value = state.dusk;
      for (const deck of decks) {
        deck.mesh.visible = showDecks;
        deck.mesh.position.x = position.x;
        deck.mesh.position.z = position.z;
      }
    },
    dispose() {
      domeGeometry.dispose();
      domeMaterial.dispose();
      deckGeometry.dispose();
      for (const deck of decks) deck.material.dispose();
    },
  };
}
