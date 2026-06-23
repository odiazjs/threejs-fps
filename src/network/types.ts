import type { ProjectileSpawnMessage } from '../../shared/network/projectile';

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export type { ProjectileSpawnMessage };

export interface AmmoBoxSnapshot {
  x: number;
  z: number;
  collected: boolean;
}

export type PlayerAddHandler = (sessionId: string, player: PlayerSnapshot) => void;
export type PlayerRemoveHandler = (sessionId: string) => void;
export type PlayerChangeHandler = (sessionId: string, player: PlayerSnapshot) => void;
export type ProjectileSpawnHandler = (spawn: ProjectileSpawnMessage) => void;
export type AmmoBoxChangeHandler = (index: number, box: AmmoBoxSnapshot) => void;
export type AmmoPickupGrantedHandler = () => void;
