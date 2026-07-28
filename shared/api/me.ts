export interface PlayerStatsSummary {
  kills: number;
  deaths: number;
  matchesPlayed: number;
  wins: number;
  xp: number;
  level: number;
}

export interface MeResponse {
  userId: string;
  email: string;
  displayName: string;
  /** Spendable currency for weapon upgrades. */
  plasmaMinerals: number;
  stats: PlayerStatsSummary;
}

export interface PurchasePlasmaMineralsRequest {
  packId: string;
}

export interface PurchasePlasmaMineralsResponse {
  plasmaMinerals: number;
  amountGranted: number;
  packId: string;
}
