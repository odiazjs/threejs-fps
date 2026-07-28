import type { Client } from 'colyseus';
import type { PartyStatus } from '../../../shared/network/party.js';

/**
 * Process-level party roster. Must outlive LobbyRoom instances — when every
 * member leaves for a match, Colyseus may dispose the empty lobby room and
 * used to wipe in-memory parties with it.
 */

export interface PartyMemberRecord {
  userId: string;
  username: string;
  client: Client;
  isHost: boolean;
  teamId: number;
}

export interface Party {
  partyId: string;
  hostUserId: string;
  members: Map<string, PartyMemberRecord>;
  /** Guest userId → invite record (LobbyRoom stores its PendingGameInvite here). */
  pendingInvites: Map<string, { inviteId: string }>;
  friendlyFire: boolean;
  status: PartyStatus;
  matchRoomId?: string;
}

const partiesByHostUserId = new Map<string, Party>();
const partyHostByUserId = new Map<string, string>();

export function getPartyForUser(userId: string): Party | undefined {
  const hostUserId = partyHostByUserId.get(userId);
  if (!hostUserId) return undefined;
  return partiesByHostUserId.get(hostUserId);
}

export function getPartyByHost(hostUserId: string): Party | undefined {
  return partiesByHostUserId.get(hostUserId);
}

export function setPartyHostMapping(userId: string, hostUserId: string): void {
  partyHostByUserId.set(userId, hostUserId);
}

export function clearPartyHostMapping(userId: string): void {
  partyHostByUserId.delete(userId);
}

export function registerParty(party: Party): void {
  partiesByHostUserId.set(party.hostUserId, party);
  for (const userId of party.members.keys()) {
    partyHostByUserId.set(userId, party.hostUserId);
  }
}

export function unregisterParty(party: Party): void {
  for (const memberId of party.members.keys()) {
    partyHostByUserId.delete(memberId);
  }
  partiesByHostUserId.delete(party.hostUserId);
  party.pendingInvites.clear();
}
