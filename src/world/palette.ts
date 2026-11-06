/**
 * The scene's colours, read from world-tokens.css so the page and the WebGL scene share one
 * source (change a token and both change). A missing or malformed token throws with its name:
 * a scene drawn with a silent fallback colour would hide the mistake.
 */
import { Color } from 'three';

/** The four colours that describe the sky and clouds at one time of day. */
export interface AtmosphereStop {
  readonly zenith: Color;
  readonly horizon: Color;
  readonly cloudLit: Color;
  readonly cloudShade: Color;
}

/** New York's materials and lights (world-tokens.css, "The city"). */
export interface CityPalette {
  readonly brick: Color;
  readonly stone: Color;
  readonly deco: Color;
  readonly glass: Color;
  readonly trim: Color;
  readonly roof: Color;
  readonly windowDark: Color;
  readonly windowCool: Color;
  readonly windowWarm: Color;
  readonly asphalt: Color;
  readonly sidewalk: Color;
  readonly paint: Color;
  readonly streetLight: Color;
  readonly headlight: Color;
  readonly taillight: Color;
  readonly carPaints: readonly Color[];
  readonly people: readonly Color[];
  readonly trees: readonly Color[];
  readonly bark: Color;
}

/** The city's colour grade, from the ink and mist tokens: what the night air and light are. */
export interface GradePalette {
  /** The fog the city recedes into after dusk: Nexarise navy, never grey. */
  readonly fog: Color;
  /** The night sky's light on everything: a navy ambient. */
  readonly ambient: Color;
  /** Moonlight: cool, from the west. */
  readonly moon: Color;
}

export interface WorldPalette {
  /** Building walls, the lit edges of a wall, and the ground. */
  readonly body: Color;
  readonly edge: Color;
  readonly ground: Color;
  /** A window that is off, and one that is on. */
  readonly pixelDim: Color;
  readonly pixelLit: Color;
  /** State signals: an open finding, a sealed fix, and a result that needs a person. */
  readonly open: Color;
  readonly sealed: Color;
  readonly hold: Color;
  /** The warm band along the horizon at dusk. */
  readonly duskGlow: Color;
  readonly city: CityPalette;
  readonly grade: GradePalette;
  readonly day: AtmosphereStop;
  readonly dusk: AtmosphereStop;
  readonly night: AtmosphereStop;
  readonly dawn: AtmosphereStop;
  /** The cloud deck of the first screen (tear.ts): sunlit, shaded, and the sky through it. */
  readonly deck: { readonly lit: Color; readonly shade: Color; readonly sky: Color };
}

/** Six digits as written, or three: a build's minifier shortens #ffffff to #fff. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** One colour token such as `--signal-open`, as a three.js colour. */
export function readColor(name: `--${string}`): Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!HEX.test(raw)) {
    throw new Error(`Colour token ${name} is missing or not a hex value (found "${raw}").`);
  }
  return new Color(raw);
}

function readStop(time: 'day' | 'dusk' | 'night' | 'dawn'): AtmosphereStop {
  return {
    zenith: readColor(`--atmo-${time}-zenith`),
    horizon: readColor(`--atmo-${time}-horizon`),
    cloudLit: readColor(`--atmo-${time}-cloud-lit`),
    cloudShade: readColor(`--atmo-${time}-cloud-shade`),
  };
}

/** Reads every colour the scene uses. Call once the stylesheet has loaded. */
export function readPalette(): WorldPalette {
  return {
    body: readColor('--world-body'),
    edge: readColor('--world-edge'),
    ground: readColor('--world-ground'),
    pixelDim: readColor('--world-pixel-dim'),
    pixelLit: readColor('--world-pixel-lit'),
    open: readColor('--signal-open'),
    sealed: readColor('--signal-sealed'),
    hold: readColor('--signal-hold'),
    duskGlow: readColor('--atmo-dusk-glow'),
    grade: {
      fog: readColor('--ink-800'),
      ambient: readColor('--ink-700'),
      moon: readColor('--mist-500'),
    },
    city: {
      brick: readColor('--city-brick'),
      stone: readColor('--city-stone'),
      deco: readColor('--city-deco'),
      glass: readColor('--city-glass'),
      trim: readColor('--city-trim'),
      roof: readColor('--city-roof'),
      windowDark: readColor('--city-window-dark'),
      windowCool: readColor('--city-window-cool'),
      windowWarm: readColor('--city-window-warm'),
      asphalt: readColor('--street-asphalt'),
      sidewalk: readColor('--street-sidewalk'),
      paint: readColor('--street-paint'),
      streetLight: readColor('--street-light'),
      headlight: readColor('--car-headlight'),
      taillight: readColor('--car-taillight'),
      carPaints: (['a', 'b', 'c', 'd', 'e'] as const).map((k) => readColor(`--car-paint-${k}`)),
      people: (['a', 'b', 'c'] as const).map((k) => readColor(`--person-${k}`)),
      trees: (['a', 'b'] as const).map((k) => readColor(`--city-tree-${k}`)),
      bark: readColor('--city-tree-bark'),
    },
    day: readStop('day'),
    dusk: readStop('dusk'),
    night: readStop('night'),
    dawn: readStop('dawn'),
    deck: {
      lit: readColor('--atmo-deck-lit'),
      shade: readColor('--atmo-deck-shade'),
      sky: readColor('--atmo-deck-sky'),
    },
  };
}
