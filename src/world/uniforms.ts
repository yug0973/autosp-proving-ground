/**
 * Values every material in the world reads: the clock, how dark it is and the fog. One object is
 * created once and handed to the sky, the clouds, the city and the ground, and `syncShared`
 * updates it each frame, so no material can disagree with another about the time of day.
 */
import { MathUtils, Vector2, Vector3 } from 'three';
import { Color } from 'three';
import type { IUniform } from 'three';
import type { Atmosphere } from './atmosphere';
import type { GradePalette } from './palette';
import { SCAN } from './scan';

export interface SharedUniforms {
  uTime: IUniform<number>;
  uNight: IUniform<number>;
  uFogColor: IUniform<Color>;
  uFogDensity: IUniform<number>;
  /** The sky straight up: glass and car paint reflect it. */
  uSky: IUniform<Color>;
  /** The night grade (fog.glsl `shade`): a navy ambient and cool moonlight. */
  uAmbient: IUniform<Color>;
  uMoonLight: IUniform<Color>;
  uGrade: IUniform<number>;
  /** The merge (merge.glsl): the wave's origin, front and strength, and the dark around the seal. */
  uWaveFrom: IUniform<Vector2>;
  uWave: IUniform<number>;
  uWaveFade: IUniform<number>;
  uLone: IUniform<number>;
  /** The scanner sweep (scan.glsl): where the line is, whether it moves, its colour and shape. */
  uScanX: IUniform<number>;
  uScanOn: IUniform<number>;
  uScanColor: IUniform<Color>;
  uScanShape: IUniform<Vector3>;
  /** How much the findings burn whatever the line has done: the first view, through the tear. */
  uEmbers: IUniform<number>;
}

/** Fog is thick by day, so the city dissolves into haze, and thins at night so it stays crisp. */
const FOG_DAY = 0.0065;
const FOG_NIGHT = 0.0028;

export function createSharedUniforms(atmosphere: Atmosphere, grade: GradePalette): SharedUniforms {
  return {
    uTime: { value: 0 },
    uNight: { value: 0 },
    // The same Color object the atmosphere rewrites, so the fog follows it with no copying
    uFogColor: { value: atmosphere.fog },
    uFogDensity: { value: FOG_DAY },
    uSky: { value: atmosphere.zenith },
    uAmbient: { value: grade.ambient },
    uMoonLight: { value: grade.moon },
    uGrade: { value: 0 },
    uWaveFrom: { value: new Vector2() },
    uWave: { value: 0 },
    uWaveFade: { value: 0 },
    uLone: { value: 0 },
    // lit everywhere until the stage plays the sweep
    uScanX: { value: 1e4 },
    uScanOn: { value: 0 },
    uScanColor: { value: new Color(1, 1, 1) },
    uScanShape: { value: SCAN.shape },
    uEmbers: { value: 0 },
  };
}

/** The merge uniforms, for a material that includes merge.glsl. */
export function mergeUniforms(
  shared: SharedUniforms,
): Pick<SharedUniforms, 'uWaveFrom' | 'uWave' | 'uWaveFade' | 'uLone'> {
  return {
    uWaveFrom: shared.uWaveFrom,
    uWave: shared.uWave,
    uWaveFade: shared.uWaveFade,
    uLone: shared.uLone,
  };
}

export function syncShared(shared: SharedUniforms, atmosphere: Atmosphere, seconds: number): void {
  shared.uTime.value = seconds;
  shared.uNight.value = atmosphere.night;
  shared.uGrade.value = atmosphere.grade;
  shared.uFogDensity.value = MathUtils.lerp(FOG_DAY, FOG_NIGHT, atmosphere.clear);
}

/** The scan uniforms, for a material that includes scan.glsl. */
export function scanUniforms(
  shared: SharedUniforms,
): Pick<SharedUniforms, 'uScanX' | 'uScanOn' | 'uScanColor' | 'uScanShape' | 'uEmbers'> {
  return {
    uScanX: shared.uScanX,
    uScanOn: shared.uScanOn,
    uScanColor: shared.uScanColor,
    uScanShape: shared.uScanShape,
    uEmbers: shared.uEmbers,
  };
}
