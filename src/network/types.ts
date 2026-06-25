import type { ProjectileSpawnMessage } from '../../shared/network/projectile';

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  username: string;
  teamId: number;
  hp: number;
  alive: boolean;
  reloading: boolean;
  reloadEndAt: number;
  activeWeaponId: string;
  sprinting: boolean;
  walking: boolean;
  jumping: boolean;
}

export type { ProjectileSpawnMessage };

export interface AmmoBoxSnapshot {
  x: number;
  z: number;
  collected: boolean;
}

export interface LocalCombatState {
  hp: number;
  maxHp: number;
  alive: boolean;
  teamId: number;
  username: string;
}

export type PlayerAddHandler = (sessionId: string, player: PlayerSnapshot) => void;
export type PlayerRemoveHandler = (sessionId: string) => void;
export type PlayerChangeHandler = (sessionId: string, player: PlayerSnapshot) => void;
export type LocalPlayerChangeHandler = (player: PlayerSnapshot) => void;
export type ProjectileSpawnHandler = (spawn: ProjectileSpawnMessage) => void;
export type AmmoBoxChangeHandler = (index: number, box: AmmoBoxSnapshot) => void;
export type AmmoPickupGrantedHandler = () => void;
export type KillFeedHandler = (killerName: string, victimName: string) => void;
