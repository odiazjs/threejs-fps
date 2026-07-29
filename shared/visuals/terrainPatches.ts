const MAP_HALF = 60;

export interface BaldPatch {
  x: number;
  z: number;
  radius: number;
}

const PATCH_COUNT = 40;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function generatePatches(): BaldPatch[] {
  const rand = seededRandom(91);
  const patches: BaldPatch[] = [];
  const margin = 10;

  for (let attempts = 0; patches.length < PATCH_COUNT && attempts < 400; attempts++) {
    const x = (rand() - 0.5) * (MAP_HALF * 2 - margin * 2);
    const z = (rand() - 0.5) * (MAP_HALF * 2 - margin * 2);
    const radius = 0.35 + rand() * 0.55;

    const tooClose = patches.some((patch) => {
      const dx = patch.x - x;
      const dz = patch.z - z;
      return Math.hypot(dx, dz) < patch.radius + radius + 1.2;
    });
    if (tooClose) continue;

    patches.push({ x, z, radius });
  }

  return patches;
}

export const BALD_PATCHES = generatePatches();

export function getBaldPatchInfluence(x: number, z: number): number {
  let influence = 0;

  for (const patch of BALD_PATCHES) {
    const dist = Math.hypot(x - patch.x, z - patch.z);
    if (dist >= patch.radius) continue;

    const inner = patch.radius * 0.55;
    const strength = smoothstep(patch.radius, inner, dist);
    influence = Math.max(influence, strength);
  }

  return influence;
}

export function shouldSkipGrass(x: number, z: number): boolean {
  return getBaldPatchInfluence(x, z) > 0.88;
}
