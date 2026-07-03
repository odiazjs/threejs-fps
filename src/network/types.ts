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
  winningTeamId: number;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  username: string;
  teamId: number;
  hp: number;
  shieldLevel: number;
  shieldPoints: number;
  shieldCharges: number;
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
  z: number;
  collected: boolean;
}

export interface WeaponDropSnapshot {
  x: number;
  z: number;
  yaw: number;
  weaponId: string;
  collected: boolean;
}

export interface LocalCombatState {
  hp: number;
  maxHp: number;
  shieldLevel: number;
  shieldPoints: number;
  shieldCapacity: number;
  shieldCharges: number;
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
export type ShieldChargePickupGrantedHandler = () => void;
export type ShieldChargeDropGrantedHandler = (data: { index: number }) => void;
export type WeaponDropChangeHandler = (index: number, drop: WeaponDropSnapshot) => void;
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
