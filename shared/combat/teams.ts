import { MAX_TDM_TEAMS } from './match.js';

export const TEAM_COUNT = 2;

export const TEAM_NAMES = ['Blue', 'Orange', 'Green', 'Purple'] as const;

export const TEAM_COLORS = ['#6a9fd4', '#e5a088', '#88c99a', '#b892e5'] as const;

export function isValidTeamId(teamId: number): boolean {
  return teamId === 0 || teamId === 1;
}

export function isValidTdmTeamId(teamId: number, teamCount: number): boolean {
  return (
    Number.isInteger(teamId) &&
    teamId >= 0 &&
    teamId < Math.min(MAX_TDM_TEAMS, Math.max(1, teamCount))
  );
}
