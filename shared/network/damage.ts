export interface PlayerHitMessage {
  targetId: string;
  weaponId: string;
}

export interface KillFeedMessage {
  killerName: string;
  victimName: string;
}
