export interface PickupAmmoMessage {
  index: number;
  /** Client feet X at pickup attempt. */
  x: number;
  /** Client feet Z at pickup attempt. */
  z: number;
}

/** Max feet-position drift allowed between client report and server state. */
export const PICKUP_MAX_DESYNC = 2.5;
