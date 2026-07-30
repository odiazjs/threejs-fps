import type { WebGLRenderer } from 'three';
import { resolveGraphicsQuality } from './graphicsQuality';

export interface GrassQualityProfile {
  maxBlades: number;
  gridStep: number;
  bladeSegments: number;
  extraBladeChance: number;
  drawRadius: number;
}

/** Pick grass density / shader budget from the active graphics quality tier. */
export function resolveGrassQuality(renderer: WebGLRenderer): GrassQualityProfile {
  const grass = resolveGraphicsQuality(renderer).lobbyGrass;
  return {
    maxBlades: grass.maxBlades,
    gridStep: grass.gridStep,
    bladeSegments: grass.bladeSegments,
    extraBladeChance: grass.extraBladeChance,
    drawRadius: grass.maxBlades <= 25_000 ? 48 : grass.maxBlades <= 40_000 ? 58 : 88,
  };
}
