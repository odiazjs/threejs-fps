/** Client requests picking up a shield charge while aiming at it. */
export interface PickupShieldChargeMessage {
  readonly index: number;
}

/** Max distance from player feet to shield charge for pickup (meters). */
export const SHIELD_PICKUP_MAX_DISTANCE = 4;
