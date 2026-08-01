/**
 * Graphics quality tiers for iGPU / dGPU.
 *
 * Resolve order: `?quality=` ? localStorage preference ? auto (iGPU ? low).
 */

export type GraphicsQualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type GraphicsQualityPreference = 'auto' | GraphicsQualityTier;

const STORAGE_KEY = 'fps_graphics_quality';
const QUERY_KEY = 'quality';

const VALID_PREFERENCES = new Set<GraphicsQualityPreference>([
  'auto',
  'low',
  'medium',
  'high',
  'ultra',
]);

export interface GraphicsQualityDials {
  readonly tier: GraphicsQualityTier;
  readonly preference: GraphicsQualityPreference;
  readonly autoDetectedTier: GraphicsQualityTier;
  readonly gameMaxPixelRatio: number;
  readonly lobbyMaxPixelRatio: number;
  readonly antialias: boolean;
  readonly maxAnisotropy: number;
  readonly outlinesEnabled: boolean;
  /** Medium: enemy + harvest only. High/Ultra: all outline passes. */
  readonly teammateOutlinesEnabled: boolean;
  readonly fxLightPoolSize: number;
  readonly edgeLinesEnabled: boolean;
  readonly shieldHemisphereSegments: { width: number; height: number };
  readonly muzzleParticleScale: number;
  readonly lobbyGrass: {
    maxBlades: number;
    gridStep: number;
    bladeSegments: number;
    extraBladeChance: number;
    frustumCulled: boolean;
  };
}

let cachedDials: GraphicsQualityDials | null = null;
let detectedTier: GraphicsQualityTier | null = null;

function readQueryPreference(): GraphicsQualityPreference | null {
  try {
    const raw = new URLSearchParams(window.location.search).get(QUERY_KEY);
    if (!raw) return null;
    const value = raw.trim().toLowerCase();
    if (VALID_PREFERENCES.has(value as GraphicsQualityPreference)) {
      return value as GraphicsQualityPreference;
    }
  } catch {
    // Ignore.
  }
  return null;
}

export function getStoredGraphicsQualityPreference(): GraphicsQualityPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (VALID_PREFERENCES.has(raw as GraphicsQualityPreference)) {
      return raw as GraphicsQualityPreference;
    }
  } catch {
    // Ignore.
  }
  return 'auto';
}

export function storeGraphicsQualityPreference(
  preference: GraphicsQualityPreference,
): GraphicsQualityPreference {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Ignore.
  }
  cachedDials = null;
  return preference;
}

/** Detect integrated / weak GPUs from WEBGL_debug_renderer_info. */
export function detectAutoGraphicsTier(
  renderer?: { getContext(): WebGLRenderingContext | WebGL2RenderingContext },
): GraphicsQualityTier {
  if (detectedTier) return detectedTier;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      renderer?.getContext() ??
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl');
    if (!gl) {
      detectedTier = 'low';
      return detectedTier;
    }

    const isWebGL2 =
      typeof WebGL2RenderingContext !== 'undefined' &&
      gl instanceof WebGL2RenderingContext;
    if (!isWebGL2) {
      detectedTier = 'low';
      return detectedTier;
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : '';
    const integratedGpu =
      /Intel|Apple GPU|LLVMPIPE|SwiftShader|Mali|Adreno|Intel\(R\) UHD|Intel\(R\) Iris|Radeon\(TM\) Graphics(?!.*\bRX\b)/i.test(
        gpuName,
      );
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory;
    const lowMemory = deviceMemory !== undefined && deviceMemory <= 4;

    // Auto never picks Ultra  that stays a manual high-end choice.
    detectedTier = integratedGpu || lowMemory ? 'low' : 'high';
    return detectedTier;
  } catch {
    detectedTier = 'low';
    return detectedTier;
  }
}

function dialsForTier(
  tier: GraphicsQualityTier,
  preference: GraphicsQualityPreference,
  autoDetectedTier: GraphicsQualityTier,
): GraphicsQualityDials {
  if (tier === 'low') {
    return {
      tier,
      preference,
      autoDetectedTier,
      gameMaxPixelRatio: 1,
      lobbyMaxPixelRatio: 1,
      antialias: false,
      maxAnisotropy: 2,
      outlinesEnabled: false,
      teammateOutlinesEnabled: false,
      fxLightPoolSize: 2,
      edgeLinesEnabled: false,
      shieldHemisphereSegments: { width: 24, height: 12 },
      muzzleParticleScale: 0.5,
      lobbyGrass: {
        maxBlades: 22_000,
        gridStep: 0.1,
        bladeSegments: 1,
        extraBladeChance: 0.35,
        frustumCulled: true,
      },
    };
  }

  if (tier === 'medium') {
    return {
      tier,
      preference,
      autoDetectedTier,
      gameMaxPixelRatio: 1.25,
      lobbyMaxPixelRatio: 1.25,
      antialias: false,
      maxAnisotropy: 4,
      outlinesEnabled: true,
      teammateOutlinesEnabled: false,
      fxLightPoolSize: 4,
      edgeLinesEnabled: true,
      shieldHemisphereSegments: { width: 32, height: 16 },
      muzzleParticleScale: 0.75,
      lobbyGrass: {
        maxBlades: 32_000,
        gridStep: 0.075,
        bladeSegments: 2,
        extraBladeChance: 0.55,
        frustumCulled: true,
      },
    };
  }

  if (tier === 'ultra') {
    return {
      tier,
      preference,
      autoDetectedTier,
      gameMaxPixelRatio: 2,
      lobbyMaxPixelRatio: 2,
      antialias: true,
      maxAnisotropy: Number.POSITIVE_INFINITY,
      outlinesEnabled: true,
      teammateOutlinesEnabled: true,
      fxLightPoolSize: 12,
      edgeLinesEnabled: true,
      shieldHemisphereSegments: { width: 64, height: 32 },
      muzzleParticleScale: 1.25,
      lobbyGrass: {
        maxBlades: 72_000,
        gridStep: 0.045,
        bladeSegments: 4,
        extraBladeChance: 0.95,
        frustumCulled: false,
      },
    };
  }

  // high
  return {
    tier: 'high',
    preference,
    autoDetectedTier,
    gameMaxPixelRatio: 1.5,
    lobbyMaxPixelRatio: 2,
    antialias: true,
    maxAnisotropy: Number.POSITIVE_INFINITY,
    outlinesEnabled: true,
    teammateOutlinesEnabled: true,
    fxLightPoolSize: 8,
    edgeLinesEnabled: true,
    shieldHemisphereSegments: { width: 48, height: 24 },
    muzzleParticleScale: 1,
    lobbyGrass: {
      maxBlades: 48_000,
      gridStep: 0.055,
      bladeSegments: 3,
      extraBladeChance: 0.92,
      frustumCulled: false,
    },
  };
}

export function resolveGraphicsQuality(
  renderer?: { getContext(): WebGLRenderingContext | WebGL2RenderingContext },
): GraphicsQualityDials {
  if (cachedDials) return cachedDials;

  const autoDetectedTier = detectAutoGraphicsTier(renderer);
  const preference =
    readQueryPreference() ?? getStoredGraphicsQualityPreference();
  const tier: GraphicsQualityTier =
    preference === 'auto' ? autoDetectedTier : preference;

  cachedDials = dialsForTier(tier, preference, autoDetectedTier);
  return cachedDials;
}

/** Force re-resolve after Settings change (reload recommended for AA/pool size). */
export function invalidateGraphicsQualityCache(): void {
  cachedDials = null;
}

export function getGraphicsQualitySummary(): string {
  const q = resolveGraphicsQuality();
  return `tier=${q.tier} preference=${q.preference} auto=${q.autoDetectedTier} dpr=${q.gameMaxPixelRatio} aa=${q.antialias} outlines=${q.outlinesEnabled}`;
}
