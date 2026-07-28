import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { PLAYER_MAX_HP } from '../combat/damage.js';
import { DEFAULT_SHIELD_CHARGES, DEFAULT_GRENADES } from '../inventory/inventoryLimits.js';
import { TDM_MATCH_DURATION_SEC } from '../combat/match.js';
import { SHIELD_DEFAULT_LEVEL, getDefaultShieldPoints } from '../combat/shield.js';

export class PlayerState extends Schema {
  @type('string') username = 'Player';
  /** Equipped store body skin id (e.g. basic, silver, tech_nature). */
  @type('string') selectedCharacterId = 'basic';
  /** Selected operator character id (face + perk), e.g. garla. */
  @type('string') selectedOperatorId = 'garla';
  @type('number') teamId = 0;
  @type('number') hp = PLAYER_MAX_HP;
  @type('number') shieldLevel = SHIELD_DEFAULT_LEVEL;
  @type('number') shieldPoints = getDefaultShieldPoints(SHIELD_DEFAULT_LEVEL);
  @type('number') shieldCharges = DEFAULT_SHIELD_CHARGES;
  @type('number') grenadeCount = DEFAULT_GRENADES;
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
  /** Server world time when the weapon equip animation finishes (0 when idle). */
  @type('number') weaponSwitchEndAt = 0;
  /** Server world time when the melee attack animation finishes (0 when idle). */
  @type('number') meleeAttackEndAt = 0;
  @type('string') activeWeaponId = 'pistol';
  @type('string') weaponSlot0 = 'pistol';
  @type('string') weaponSlot1 = 'plasma_rifle';
  @type('string') weaponSlot2 = 'sniper_rifle';
  @type('boolean') sprinting = false;
  @type('boolean') walking = false;
  @type('boolean') walkingBackward = false;
  @type('boolean') jumping = false;
  @type('boolean') crouching = false;
  /** Sprint+C momentum slide (also implies crouch pose / eye height). */
  @type('boolean') sliding = false;
  /** Kills scored in the current TDM match (reset when countdown starts). */
  @type('number') matchKills = 0;
  /** Career account level (pre-match roster). */
  @type('number') rankLevel = 1;
  /** Career lifetime kills (pre-match roster). */
  @type('number') careerKills = 0;
  /** Career lifetime deaths (pre-match roster). */
  @type('number') careerDeaths = 0;
  /** Career account XP total (pre-match roster). */
  @type('number') xp = 0;
  /** Competitive rank tier id for pre-match crest (e.g. gold). */
  @type('string') rankTier = 'bronze';
  /** Competitive rank division 1–3. */
  @type('number') rankDivision = 1;
  /** Competitive rank display name (e.g. Gold II). */
  @type('string') rankName = 'Bronze I';
  /** Client finished local asset/shader prep for this match. */
  @type('boolean') clientReady = false;
  /** Server world time when the shield dome charge completes (0 when idle). */
  @type('number') shieldDomeChargeEndAt = 0;
  /** Server world time when the shield dome expires (0 when inactive). */
  @type('number') shieldDomeEndAt = 0;
  /** Server world time when the shield dome ability is ready again. */
  @type('number') shieldDomeCooldownEndAt = 0;
  @type('number') shieldDomeCenterX = 0;
  @type('number') shieldDomeCenterY = 0;
  @type('number') shieldDomeCenterZ = 0;
}

export class AmmoBoxState extends Schema {
  @type('number') x = 0;
  @type('number') z = 0;
  @type('boolean') collected = false;
}

export class ShieldChargeState extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('boolean') collected = false;
}

export class GrenadePickupState extends Schema {
  @type('number') x = 0;
  @type('number') z = 0;
  @type('boolean') collected = false;
  @type('number') count = 4;
}

export class WeaponDropState extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') yaw = 0;
  @type('string') weaponId = 'pistol';
  @type('boolean') collected = false;
}

export class FpsState extends Schema {
  @type('number') worldTime = 0;
  @type('boolean') friendlyFire = false;
  @type('string') mapId = 'kilo_sector';
  @type('string') gameMode = 'playground';
  @type('string') matchPhase = 'waiting';
  @type('number') expectedPlayers = 0;
  @type('number') teamCount = 2;
  @type('number') teamScore0 = 0;
  @type('number') teamScore1 = 0;
  @type('number') teamScore2 = 0;
  @type('number') teamScore3 = 0;
  @type('number') matchCountdownEndAt = 0;
  @type('number') matchStartAt = 0;
  @type('number') matchEndAt = 0;
  @type('number') matchDurationSec: number = TDM_MATCH_DURATION_SEC;
  /** First-to-kills target (0 = timed / no kill race). */
  @type('number') killLimit: number = 0;
  /** -1 = tie or not decided yet. */
  @type('number') winningTeamId = -1;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([AmmoBoxState]) ammoBoxes = new ArraySchema<AmmoBoxState>();
  @type([ShieldChargeState]) shieldCharges = new ArraySchema<ShieldChargeState>();
  @type([GrenadePickupState]) grenadePickups = new ArraySchema<GrenadePickupState>();
  @type([WeaponDropState]) weaponDrops = new ArraySchema<WeaponDropState>();
}
