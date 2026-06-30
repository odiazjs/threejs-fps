export const MAX_PARTY_SIZE = 4;

export interface PartyMember {
  userId: string;
  username: string;
  isHost: boolean;
}

export interface PartySnapshotMessage {
  partyId: string;
  members: PartyMember[];
  isHost: boolean;
  /** Guest user ids with a pending invite (host client only). */
  pendingInviteUserIds: string[];
}

export interface LeavePartyMessage {
  partyId: string;
}
