/** Catalog id for the Rether Pulse digital sight. */
export const RETHER_PULSE_SIGHT_ID = 'rether_pulse';

/** Catalog id for the Precision Core digital sight. */
export const PRECISION_CORE_SIGHT_ID = 'precision_core';

/** Asset key used by the client DigitalSight mount. */
export const RETHER_PULSE_ASSET_KEY = 'red_dot_1';

export const PRECISION_CORE_ASSET_KEY = 'red_dot_2';

/** All digital optic unlockable ids known to the client. */
export const DIGITAL_SIGHT_IDS = [
  RETHER_PULSE_SIGHT_ID,
  PRECISION_CORE_SIGHT_ID,
] as const;

export type DigitalSightId = (typeof DIGITAL_SIGHT_IDS)[number];

export function isDigitalSightId(value: string): value is DigitalSightId {
  return (DIGITAL_SIGHT_IDS as readonly string[]).includes(value);
}
