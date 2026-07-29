import type { PlayerDamagedMessage } from '../../shared/network/damage';
import type { ProjectileSpawnMessage } from '../../shared/network/projectile';
import type { WeaponShotSoundMessage } from '../../shared/network/weaponShot';

import type { GameMode, MatchPhase } from '../../shared/combat/match';

export interface MatchSnapshot {
  gameMode: GameMode;
  phase: MatchPhase;
  expectedPlayers: number;
  teamCount: number;
  teamScores: number[];
  matchCountdownEndAt: number;
  matchStartAt: number;
  matchEndAt: number;
  matchDurationSec: number;
  killLimit: number;
  winningTeamId: number;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  username: string;
  selectedCharacterId: string;
  selectedOperatorId: string;
  teamId: number;
  hp: number;
  shieldLevel: number;
  shieldPoints: number;
  shieldCharges: number;
  grenadeCount: number;
  /** In-match craft currency (not account store minerals). */
  matchPlasmaMinerals: number;
  shieldRecharging: boolean;
  shieldRechargeEndAt: number;
  alive: boolean;
  reloading: boolean;
  reloadEndAt: number;
  weaponSwitchEndAt: number;
  meleeAttackEndAt: number;
  activeWeaponId: string;
  weaponSlot0: string;
  weaponSlot1: string;
  weaponSlot2: string;
  sprinting: boolean;
  walking: boolean;
  walkingBackward: boolean;
  jumping: boolean;
  crouching: boolean;
  sliding: boolean;
  matchKills: number;
  rankLevel: number;
  careerKills: number;
  careerDeaths: number;
  xp: number;
  rankTier: string;
  rankDivision: number;
  rankName: string;
  clientReady: boolean;
  /** Index into harvesting boxes while carrying (-1 = none). */
  carryingHarvestingBoxIndex: number;
  installingHarvestingBox: boolean;
  shieldDomeChargeEndAt: number;
  shieldDomeEndAt: number;
  shieldDomeCooldownEndAt: number;
  shieldDomeCenterX: number;
  shieldDomeCenterY: number;
  shieldDomeCenterZ: number;
}

export type { ProjectileSpawnMessage, WeaponShotSoundMessage };

export interface AmmoBoxSnapshot {
  x: number;
  z: number;
  collected: boolean;
}

export interface ShieldChargeSnapshot {
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

export interface GrenadePickupSnapshot {
  x: number;
  z: number;
  collected: boolean;
  count: number;
}

export interface WeaponDropSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  weaponId: string;
  collected: boolean;
}

export interface HarvestingBoxSnapshot {
  index: number;
  teamId: number;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  carriedBySessionId: string;
}

export interface LocalCombatState {
  hp: number;
  maxHp: number;
  shieldLevel: number;
  shieldPoints: number;
  shieldCapacity: number;
  shieldCharges: number;
  grenadeCount: number;
  matchPlasmaMinerals: number;
  shieldRecharging: boolean;
  shieldRechargeEndAt: number;
  alive: boolean;
  teamId: number;
  username: string;
  shieldDomeChargeEndAt: number;
  shieldDomeEndAt: number;
  shieldDomeCooldownEndAt: number;
}

export type PlayerAddHandler = (sessionId: string, player: PlayerSnapshot) => void;
export type PlayerRemoveHandler = (sessionId: string) => void;
export type PlayerChangeHandler = (sessionId: string, player: PlayerSnapshot) => void;
export type LocalPlayerChangeHandler = (player: PlayerSnapshot) => void;
export type ProjectileSpawnHandler = (spawn: ProjectileSpawnMessage) => void;
export type WeaponShotSoundHandler = (shot: WeaponShotSoundMessage) => void;
export type AmmoBoxChangeHandler = (index: number, box: AmmoBoxSnapshot) => void;
export type AmmoPickupGrantedHandler = () => void;
export type ShieldChargeChangeHandler = (index: number, charge: ShieldChargeSnapshot) => void;
export type GrenadePickupChangeHandler = (index: number, pickup: GrenadePickupSnapshot) => void;
export type ShieldChargePickupGrantedHandler = () => void;
export type GrenadePickupGrantedHandler = (data: { index: number; count: number }) => void;
export type GrenadeThrownHandler = (data: import('../../shared/network/grenade').GrenadeThrowBroadcast) => void;
export type GrenadeExplosionHandler = (data: import('../../shared/network/grenade').GrenadeExplosionBroadcast) => void;
export type ShieldChargeDropGrantedHandler = (data: { index: number }) => void;
export type WeaponDropChangeHandler = (index: number, drop: WeaponDropSnapshot) => void;
export type HarvestingBoxChangeHandler = (
  index: number,
  box: HarvestingBoxSnapshot,
) => void;
export type WeaponPickupGrantedHandler = (data: {
  index: number;
  weaponId: string;
}) => void;
export type KillFeedHandler = (
  killerId: string,
  killerName: string,
  victimName: string,
) => void;
export type LocalDamagedHandler = (damage: PlayerDamagedMessage) => void;
