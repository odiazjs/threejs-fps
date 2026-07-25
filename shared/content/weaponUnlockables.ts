/** Catalog id for the Rether Pulse optic (3D rail sight). */
export const RETHER_PULSE_SIGHT_ID = 'rether_pulse';

/** Catalog id for the Precision Core optic (3D rail sight). */
export const PRECISION_CORE_SIGHT_ID = 'precision_core';

/** Client / DB asset key — Rether Pulse → `weapons/sights/sight_1.fbx`. */
export const RETHER_PULSE_ASSET_KEY = 'sight_1';

/** Client / DB asset key — Precision Core → `weapons/assault_rifle_1/sight_2.fbx`. */
export const PRECISION_CORE_ASSET_KEY = 'sight_2';

/** All digital optic unlockable ids known to the client. */
export const DIGITAL_SIGHT_IDS = [
  RETHER_PULSE_SIGHT_ID,
  PRECISION_CORE_SIGHT_ID,
] as const;

export type DigitalSightId = (typeof DIGITAL_SIGHT_IDS)[number];

export function isDigitalSightId(value: string): value is DigitalSightId {
  return (DIGITAL_SIGHT_IDS as readonly string[]).includes(value);
}
