export interface PlayerStatsSummary {
  kills: number;
  deaths: number;
  matchesPlayed: number;
  wins: number;
}

export interface MeResponse {
  userId: string;
  email: string;
  displayName: string;
  stats: PlayerStatsSummary;
}
