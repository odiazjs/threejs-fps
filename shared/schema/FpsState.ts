import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { PLAYER_MAX_HP } from '../combat/damage.js';
import { DEFAULT_SHIELD_CHARGES } from '../inventory/inventoryLimits.js';
import { SHIELD_DEFAULT_LEVEL, getDefaultShieldPoints } from '../combat/shield.js';

export class PlayerState extends Schema {
  @type('string') username = 'Player';
  @type('number') teamId = 0;
  @type('number') hp = PLAYER_MAX_HP;
  @type('number') shieldLevel = SHIELD_DEFAULT_LEVEL;
  @type('number') shieldPoints = getDefaultShieldPoints(SHIELD_DEFAULT_LEVEL);
  @type('number') shieldCharges = DEFAULT_SHIELD_CHARGES;
  @type('boolean') shieldRecharging = false;
  /** Server world time when the current shield recharge finishes (0 when idle). */
  @type('number') shieldRechargeEndAt = 0;
  @type('boolean') alive = true;
  @type('number') x = 0;
  @type('number') y = 1.6;
  @type('number') z = 0;
  @type('number') yaw = 0;
  @type('number') pitch = 0;
  @type('boolean') reloading = false;
  /** Server world time when the reload finishes (0 when idle). */
  @type('number') reloadEndAt = 0;
  @type('string') activeWeaponId = 'pistol';
  @type('boolean') sprinting = false;
  @type('boolean') walking = false;
  @type('boolean') jumping = false;
}

export class AmmoBoxState extends Schema {
  @type('number') x = 0;
  @type('number') z = 0;
  @type('boolean') collected = false;
}

export class ShieldChargeState extends Schema {
  @type('number') x = 0;
  @type('number') z = 0;
  @type('boolean') collected = false;
}

export class FpsState extends Schema {
  @type('number') worldTime = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([AmmoBoxState]) ammoBoxes = new ArraySchema<AmmoBoxState>();
  @type([ShieldChargeState]) shieldCharges = new ArraySchema<ShieldChargeState>();
}
