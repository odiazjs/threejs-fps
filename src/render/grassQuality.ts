import type { WebGLRenderer } from 'three';

export interface GrassQualityProfile {
  maxBlades: number;
  gridStep: number;
  bladeSegments: number;
  extraBladeChance: number;
  drawRadius: number;
}

const PROFILES = {
  high: {
    maxBlades: 450_000,
    gridStep: 0.13,
    bladeSegments: 3,
    extraBladeChance: 0.55,
    drawRadius: 88,
  },
  medium: {
    maxBlades: 160_000,
    gridStep: 0.18,
    bladeSegments: 2,
    extraBladeChance: 0.3,
    drawRadius: 68,
  },
  low: {
    maxBlades: 75_000,
    gridStep: 0.24,
    bladeSegments: 1,
    extraBladeChance: 0.15,
    drawRadius: 58,
  },
} as const satisfies Record<string, GrassQualityProfile>;

/** Pick grass density / shader budget for the current GPU. */
export function resolveGrassQuality(renderer: WebGLRenderer): GrassQualityProfile {
  try {
    const gl = renderer.getContext();
    const isWebGL2 =
      typeof WebGL2RenderingContext !== 'undefined' &&
      gl instanceof WebGL2RenderingContext;

    if (!isWebGL2) {
      return { ...PROFILES.low };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : '';

    const integratedGpu = /Intel|Apple GPU|LLVMPIPE|SwiftShader|Mali|Adreno/i.test(gpuName);
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lowMemory = deviceMemory !== undefined && deviceMemory <= 4;

    if (integratedGpu || lowMemory) {
      return { ...PROFILES.medium };
    }

    return { ...PROFILES.high };
  } catch {
    return { ...PROFILES.low };
  }
}
