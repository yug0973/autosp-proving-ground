/**
 * The tear: the first thing on the page. A bright day cloud deck fills the screen, and in it one great
 * rip shows the night city underneath, live, with its findings burning. It is what the page argues,
 * in one frame: what a team sees from above, and the backlog under it.
 *
 * The visitor's pointer pulls the tear about. Scrolling opens it until the deck is gone and they have
 * fallen through, onto the same camera the city was seen with all along. A visitor arriving from
 * Nexarise (modules/arrival.ts) sees the deck whole for a moment before it rips.
 *
 * It is drawn over the finished frame as one full-screen pass reading a cloud texture baked once, so it
 * costs about the same as a flat colour however fine the clouds are, and while it is small the city is
 * drawn only inside it. The cloud always stays whole behind the page's own words.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  NoBlending,
  NormalBlending,
  OrthographicCamera,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import type { Color, Texture, WebGLRenderer } from 'three';
import { SHOTS, along, ease } from './shots';
import bakeFrag from './shaders/tear-bake.frag.glsl?raw';
import lightFrag from './shaders/tear-light.frag.glsl?raw';
import tearFrag from './shaders/tear.frag.glsl?raw';

/** The page's words the deck stays whole behind, at most this many boxes. */
const GUARDS = 3;
const TILE = 1024;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** A box on the screen, in CSS pixels. */
export interface TearGuard {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TearColours {
  readonly lit: Color;
  readonly shade: Color;
  readonly sky: Color;
}

export interface Tear {
  /** How far the deck has gone, 0 to 1, as of the last update: at 1 nothing of it is drawn. */
  readonly gone: number;
  /** 1 while the first screen's words stand on the deck, falling to 0 as they fade in the fall. */
  readonly wordsHold: number;
  /** How big the tear is now, as a share of the screen's height. */
  readonly radius: number;
  /** Where the pointer is (CSS pixels), or null when it has left. */
  setPointer(x: number | null, y: number): void;
  setGuards(guards: readonly TearGuard[]): void;
  /** Moves on: `progress` the descent's scroll, `closed` 1 to hold the deck whole, `dt` in seconds. */
  update(progress: number, closed: number, dt: number, seconds: number, width: number, height: number): void;
  /** The part of the screen (GL pixels from the bottom left) the tear can show, or null for all of it. */
  scissor(width: number, height: number): { x: number; y: number; w: number; h: number } | null;
  render(renderer: WebGLRenderer): void;
  /** For tests (?test). */
  inspect(): Record<string, unknown>;
  dispose(): void;
}

export function createTear(renderer: WebGLRenderer, colours: TearColours, still: boolean): Tear {
  const { tear } = SHOTS;
  const screen = new OrthographicCamera();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  // The clouds, baked once into a tile that repeats: how much cloud there is, then the sunlight in it
  const tileOptions = {
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  };
  const amountTile = new WebGLRenderTarget(TILE, TILE, tileOptions);
  const tile = new WebGLRenderTarget(TILE, TILE, tileOptions);
  const bakePass = (fragmentShader: string, target: WebGLRenderTarget, sampled?: Texture): Mesh => {
    const bake = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader,
      uniforms: sampled ? { uAmount: { value: sampled } } : {},
      blending: NoBlending,
      depthTest: false,
    });
    const pass = new Mesh(geometry, bake);
    pass.frustumCulled = false;
    renderer.setRenderTarget(target);
    renderer.render(pass, screen);
    renderer.setRenderTarget(null);
    bake.dispose();
    return pass;
  };
  const quad = bakePass(bakeFrag, amountTile);
  bakePass(lightFrag, tile, amountTile.texture);
  amountTile.dispose();

  const guards = Array.from({ length: GUARDS }, () => new Vector4(-1, -1, -1, -1));
  const centre = new Vector2(tear.home[0], tear.home[1]);
  const uniforms = {
    uTile: { value: tile.texture },
    uCentre: { value: centre },
    uRadius: { value: 0 },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uGone: { value: 0 },
    uWordsHold: { value: 1 },
    uGuards: { value: guards },
    uLit: { value: colours.lit },
    uShade: { value: colours.shade },
    uSky: { value: colours.sky },
  };
  const material = new ShaderMaterial({
    defines: { GUARDS: String(GUARDS) },
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: tearFrag,
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
  });
  quad.material = material;

  let wanted: Vector2 | null = null;
  let opened = still ? 1 : 0; // the first rip, on a clock
  let gone = 0;
  let wordsHold = 1;
  let radius = 0;
  let screenWidth = 1;
  let screenHeight = 1;

  return {
    get gone() {
      return gone;
    },
    get radius() {
      return radius;
    },
    get wordsHold() {
      return wordsHold;
    },
    setPointer(x, y) {
      if (x === null || still) {
        wanted = null;
        return;
      }
      const u = x / Math.max(screenWidth, 1);
      const v = 1 - y / Math.max(screenHeight, 1);
      wanted = new Vector2(
        tear.home[0] + (u - tear.home[0]) * tear.follow,
        tear.home[1] + (v - tear.home[1]) * tear.follow,
      );
    },
    setGuards(next) {
      guards.forEach((guard, i) => {
        const box = next[i];
        if (!box) {
          guard.set(-1, -1, -1, -1);
          return;
        }
        guard.set(
          box.left / screenWidth,
          1 - box.bottom / screenHeight,
          box.right / screenWidth,
          1 - box.top / screenHeight,
        );
      });
    },
    update(progress, closed, dt, seconds, width, height) {
      screenWidth = width;
      screenHeight = height;
      uniforms.uAspect.value = width / Math.max(height, 1);
      uniforms.uTime.value = seconds;
      if (closed <= 0) opened = still ? 1 : Math.min(opened + dt / tear.ripSeconds, 1);
      else opened = still ? 1 : 0;
      const falling = along(tear.fall, progress);
      gone = along(tear.clear, progress);
      radius = tear.radius * ease('cubicInOut', opened) + tear.fallRadius * falling;
      uniforms.uRadius.value = radius;
      uniforms.uGone.value = gone;
      wordsHold = 1 - along(tear.wordsFade, progress);
      uniforms.uWordsHold.value = wordsHold;
      const target = wanted ?? new Vector2(tear.home[0], tear.home[1]);
      centre.lerp(target, still ? 1 : 1 - Math.exp(-dt * tear.chase));
    },
    scissor(width, height) {
      if (gone > 0 || radius > tear.radius * 1.4) return null;
      // the largest the torn edge can reach, as a box; the cloud covers everything else
      const reach = (radius + tear.edgeReach) * height;
      const x = centre.x * width - reach;
      const y = centre.y * height - reach;
      return { x: Math.max(x, 0), y: Math.max(y, 0), w: reach * 2, h: reach * 2 };
    },
    render(target) {
      if (gone >= 1) return;
      const autoClear = target.autoClear;
      target.autoClear = false;
      target.render(quad, screen);
      target.autoClear = autoClear;
    },
    inspect() {
      return { gone, radius, opened, centre: [centre.x, centre.y] };
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      tile.dispose();
    },
  };
}
