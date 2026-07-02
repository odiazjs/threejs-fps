export interface SpawnXZ {
  readonly x: number;
  readonly z: number;
}

/** Pick the team spawn farthest from where the player died; random tie-break. */
export function pickFarthestSpawn(
  spawns: ReadonlyArray<SpawnXZ>,
  deathX: number,
  deathZ: number,
): SpawnXZ {
  if (spawns.length === 0) {
    return { x: deathX, z: deathZ };
  }

  let maxDistSq = -1;
  const tied: SpawnXZ[] = [];

  for (const spawn of spawns) {
    const dx = spawn.x - deathX;
    const dz = spawn.z - deathZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      tied.length = 0;
      tied.push(spawn);
    } else if (distSq === maxDistSq) {
      tied.push(spawn);
    }
  }

  return tied[Math.floor(Math.random() * tied.length)] ?? spawns[0]!;
}
