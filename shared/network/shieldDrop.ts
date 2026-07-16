/** Client requests dropping one shield charge from inventory. */
export interface DropShieldChargeMessage {}

/** Server broadcasts when a shield charge is dropped on the ground. */
export interface ShieldChargeSpawnMessage {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Server confirms a shield charge drop for the requesting client. */
export interface ShieldChargeDropGrantedMessage {
  readonly index: number;
}
