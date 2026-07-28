import type { FriendPresenceStatus } from './friendPresence.js';

export const MAX_PARTY_SIZE = 4;

/** Party members pick between the first two sides (Blue / Orange). */
export const PARTY_TEAM_IDS = [0, 1] as const;

export function isValidPartyTeamId(teamId: number): boolean {
  return teamId === 0 || teamId === 1;
}

export interface PartyMember {
  userId: string;
  username: string;
  isHost: boolean;
  /** Preferred team side (0 = Blue, 1 = Orange). */
  teamId: number;
  /** Equipped store body skin id (e.g. basic, silver). */
  selectedCharacterId: string;
  /** Selected operator character id (face + perk), e.g. garla. */
  selectedOperatorId: string;
  /** Primary weapon from the player's default loadout. */
  primaryWeaponId: string;
  /** Live presence for party roster (authoritative from lobby server). */
  presence?: FriendPresenceStatus;
}

/** Party is playable in lobby, or suspended while members are in a match. */
export type PartyStatus = 'active' | 'in_match';

export interface PartySnapshotMessage {
  partyId: string;
  members: PartyMember[];
  isHost: boolean;
  /** User id of the member this snapshot was sent to. */
  viewerUserId: string;
  /** Guest user ids with a pending invite (host client only). */
  pendingInviteUserIds: string[];
  /** Host-controlled match option, visible to every member. */
  friendlyFire: boolean;
  /** Survives match launch so members rejoin the same party on return. */
  status?: PartyStatus;
  /**
   * True when every party member currently has lobby/menus presence.
   * Host can only launch when this is true.
   */
  allMembersInLobby?: boolean;
}

/** Any member sets their own preferred team side. */
export interface SetPartyTeamMessage {
  teamId: number;
}

/** Host toggles friendly fire for the upcoming match. */
export interface SetPartyFriendlyFireMessage {
  friendlyFire: boolean;
}

export interface LeavePartyMessage {
  partyId: string;
}

export interface RequestPartySnapshotMessage {
  /** Reserved for future filters; server always sends the viewer's current party. */
}
