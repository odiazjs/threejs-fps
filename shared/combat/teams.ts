export const TEAM_COUNT = 2;

export const TEAM_NAMES = ['Blue', 'Orange'] as const;

export function isValidTeamId(teamId: number): boolean {
  return teamId === 0 || teamId === 1;
}
