export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  email: string;
  kills: number;
  deaths: number;
}

export interface LeaderboardResponse {
  players: LeaderboardEntry[];
}
