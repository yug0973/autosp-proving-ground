/**
 * The sky's colours at a given time of day. `phase` runs from 0 (day) through 0.5 (dusk) to 1
 * (night), and `dawn` from 0 (that) to 1 (the night lifted, at the end of the page); `update` blends
 * the palette's stops into one set of live colours that the sky, clouds, fog and city all read, so
 * they always agree on what time it is.
 */
import { Color, MathUtils } from 'three';
import type { AtmosphereStop, WorldPalette } from './palette';

export interface Atmosphere {
  /** Live colours; `update` rewrites them in place, so hold on to the objects, not copies. */
  readonly zenith: Color;
  readonly horizon: Color;
  readonly cloudLit: Color;
  readonly cloudShade: Color;
  readonly duskGlow: Color;
  /**
   * The fog the city recedes into: the horizon's colour while the camera is in the clouds, pulled
   * toward Nexarise navy through dusk (so the haze is a muted navy, never a flat orange wash; the
   * warm band stays in the sky) and navy at night.
   */
  readonly fog: Color;
  /** 0 to 1, peaking at dusk: how strong the warm band on the horizon is. */
  dusk: number;
  /** 0 to 1: how dark it is. Drives lit windows and stars. */
  night: number;
  /** 0 to 1: how far the city's night grade has come in. It starts at dusk, so the city is already
   * navy under the warm band in the sky rather than lit warm by the day key. */
  grade: number;
  /** 0 to 1: how clear the air is. The same as `night` until the dawn, which keeps it clearer. */
  clear: number;
  update(phase: number, dawn?: number): void;
}

/** How dark it still is at dawn, how far the city's night grade stays in, and how much of the
 * horizon's blue the fog takes on, softening the far city into it. `clear` keeps the air nearly as
 * thin as at night, so the sealed towers along the row still read as lime. */
const DAWN = { night: 0.3, grade: 0.62, fog: 0.8, clear: 0.86 } as const;

function blend(out: Color, from: Color, to: Color, amount: number): void {
  out.copy(from).lerp(to, amount);
}

export function createAtmosphere(palette: WorldPalette): Atmosphere {
  const atmosphere: Atmosphere = {
    zenith: new Color(),
    horizon: new Color(),
    cloudLit: new Color(),
    cloudShade: new Color(),
    duskGlow: palette.duskGlow.clone(),
    fog: new Color(),
    dusk: 0,
    night: 0,
    grade: 0,
    clear: 0,
    update(phase, dawn = 0) {
      const p = MathUtils.clamp(phase, 0, 1);
      // Day to dusk over the first half, dusk to night over the second, each eased
      const first = p < 0.5;
      const from: AtmosphereStop = first ? palette.day : palette.dusk;
      const to: AtmosphereStop = first ? palette.dusk : palette.night;
      const amount = MathUtils.smoothstep(first ? p * 2 : (p - 0.5) * 2, 0, 1);

      blend(atmosphere.zenith, from.zenith, to.zenith, amount);
      blend(atmosphere.horizon, from.horizon, to.horizon, amount);
      blend(atmosphere.cloudLit, from.cloudLit, to.cloudLit, amount);
      blend(atmosphere.cloudShade, from.cloudShade, to.cloudShade, amount);

      const toNavy = MathUtils.smoothstep(p, 0.06, 0.42) * 0.8 + MathUtils.smoothstep(p, 0.5, 1) * 0.15;
      blend(atmosphere.fog, atmosphere.horizon, palette.grade.fog, toNavy);

      atmosphere.dusk = 4 * p * (1 - p);
      atmosphere.night = MathUtils.smoothstep(p, 0.45, 0.95);
      atmosphere.grade = MathUtils.smoothstep(p, 0.12, 0.6);
      atmosphere.clear = atmosphere.night;

      if (dawn > 0) {
        const morning = palette.dawn;
        atmosphere.zenith.lerp(morning.zenith, dawn);
        atmosphere.horizon.lerp(morning.horizon, dawn);
        atmosphere.cloudLit.lerp(morning.cloudLit, dawn);
        atmosphere.cloudShade.lerp(morning.cloudShade, dawn);
        atmosphere.fog.lerp(atmosphere.horizon, DAWN.fog * dawn);
        atmosphere.night = MathUtils.lerp(atmosphere.night, DAWN.night, dawn);
        atmosphere.grade = MathUtils.lerp(atmosphere.grade, DAWN.grade, dawn);
        atmosphere.clear = MathUtils.lerp(atmosphere.clear, DAWN.clear, dawn);
      }
    },
  };
  atmosphere.update(0);
  return atmosphere;
}
