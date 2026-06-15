export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export type PlayerAddHandler = (sessionId: string, player: PlayerSnapshot) => void;
export type PlayerRemoveHandler = (sessionId: string) => void;
export type PlayerChangeHandler = (sessionId: string, player: PlayerSnapshot) => void;
