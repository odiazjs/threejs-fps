/** First intersection point along segment A→B with a sphere, or null. */
export function segmentHitsSphere(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): { x: number; y: number; z: number } | null {
  const ox = ax - cx;
  const oy = ay - cy;
  const oz = az - cz;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-10) return null;

  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrt = Math.sqrt(disc);
  const inv = 1 / (2 * a);
  const t1 = (-b - sqrt) * inv;
  const t2 = (-b + sqrt) * inv;

  let t = t1;
  if (t < 0 || t > 1) {
    t = t2;
    if (t < 0 || t > 1) return null;
  }

  return {
    x: ax + dx * t,
    y: ay + dy * t,
    z: az + dz * t,
  };
}

/** Upper hemisphere (y >= centerY) — blocks entry from outside and exit from inside. */
export function segmentHitsUpperHemisphere(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): { x: number; y: number; z: number } | null {
  const ox = ax - cx;
  const oy = ay - cy;
  const oz = az - cz;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-10) return null;

  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrt = Math.sqrt(disc);
  const inv = 1 / (2 * a);
  const t1 = (-b - sqrt) * inv;
  const t2 = (-b + sqrt) * inv;

  let bestT = -1;
  for (const t of [t1, t2]) {
    if (t < 1e-4 || t > 1) continue;
    const y = ay + dy * t;
    if (y < cy - 1e-4) continue;
    if (bestT < 0 || t < bestT) bestT = t;
  }
  if (bestT < 0) return null;

  return {
    x: ax + dx * bestT,
    y: ay + dy * bestT,
    z: az + dz * bestT,
  };
}
