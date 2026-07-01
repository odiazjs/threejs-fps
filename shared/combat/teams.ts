export const TEAM_COUNT = 2;

export const TEAM_NAMES = ['Blue', 'Orange'] as const;

export const TEAM_COLORS = ['#6a9fd4', '#e5a088'] as const;

export function isValidTeamId(teamId: number): boolean {
  return teamId === 0 || teamId === 1;
}
