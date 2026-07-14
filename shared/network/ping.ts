/** Team ping — middle-mouse marker shared with same-team members only. */

export const TEAM_PING_TTL_SEC = 3;

/** How far the ping ray travels before the marker lands mid-air. */
export const TEAM_PING_MAX_DISTANCE = 120;

/** Slack over max distance when the server validates a ping position. */
export const TEAM_PING_DISTANCE_SLACK = 10;

/** Client -> server: world position the player pinged. */
export interface TeamPingRequest {
  x: number;
  y: number;
  z: number;
}

/** Server -> same-team clients. */
export interface TeamPingMessage {
  pingerId: string;
  x: number;
  y: number;
  z: number;
}
