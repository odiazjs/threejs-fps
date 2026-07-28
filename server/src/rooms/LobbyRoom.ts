import { Client, Room, matchMaker } from 'colyseus';

import type {

  FriendRequestErrorMessage,

} from '../../../shared/network/friends.js';

import type {

  GameInviteAcceptedMessage,

  GameInviteCancelledMessage,

  GameInviteDeclinedMessage,

  GameInviteMessage,

  GameInviteSentMessage,

  GameLaunchMessage,

  GameLaunchParticipant,

  RespondGameInviteMessage,

  SendGameInviteMessage,

  StartGameInviteMessage,

} from '../../../shared/network/gameInvite.js';

import { getPlayerStats } from '../stats/service.js';
import { getCompetitiveRankCard } from '../progression/service.js';

import {

  MAX_PARTY_SIZE,

  isValidPartyTeamId,

  type LeavePartyMessage,

  type PartyMember,

  type PartySnapshotMessage,

  type RequestPartySnapshotMessage,

  type SetPartyFriendlyFireMessage,

  type SetPartyTeamMessage,

} from '../../../shared/network/party.js';

import { readPartyMemberCosmetics } from '../lobby/partyCharacters.js';

import { setRefreshPartyHandler } from '../lobby/partyNotify.js';

import type { SetAppViewMessage } from '../../../shared/network/appView.js';

import { LobbyPlayerState, LobbyState } from '../../../shared/schema/LobbyState.js';

import { normalizeMapId } from '../../../shared/level/maps.js';
import { normalizeGameMode } from '../../../shared/combat/match.js';

import { registerLobbyUser, setLobbyAppView, unregisterUser } from '../lobby/presence.js';

import { sendFriendPresenceSnapshot } from '../lobby/presenceNotify.js';
import {
  consumePendingGameLaunch,
  setPendingGameLaunch,
} from '../lobby/pendingGameLaunches.js';



interface JoinOptions {

  userId?: string;

  username?: string;

}



interface PartyMemberRecord {

  userId: string;

  username: string;

  client: Client;

  isHost: boolean;

  teamId: number;

}



const GAME_INVITE_TTL_MS = 45_000;

interface PendingGameInvite {

  inviteId: string;

  hostClient: Client;

  hostUserId: string;

  hostUsername: string;

  guestUserId: string;

  guestUsername: string;

  guestClient: Client | null;

  expireTimeout?: ReturnType<typeof setTimeout>;

}



interface Party {

  partyId: string;

  hostUserId: string;

  members: Map<string, PartyMemberRecord>;

  pendingInvites: Map<string, PendingGameInvite>;

  friendlyFire: boolean;

}



function normalizeUsername(raw?: string): string | null {

  const trimmed = raw?.trim().slice(0, 16);

  return trimmed && trimmed.length > 0 ? trimmed : null;

}



function normalizeUserId(raw?: string): string | null {

  const trimmed = raw?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : null;

}



function usernameKey(username: string): string {

  return username.toLowerCase();

}



function generateRoomCode(): string {

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code = '';

  for (let i = 0; i < 6; i++) {

    code += chars[Math.floor(Math.random() * chars.length)];

  }

  return code;

}



export class LobbyRoom extends Room<{ state: LobbyState }> {

  state = new LobbyState();

  maxClients = 64;

  private readonly clientsByUsername = new Map<string, Client>();

  private readonly clientsByUserId = new Map<string, Client>();

  private readonly userIdByClient = new Map<string, string>();

  private readonly invitesById = new Map<string, PendingGameInvite>();

  private readonly partiesByHostUserId = new Map<string, Party>();

  private readonly partyHostByUserId = new Map<string, string>();



  onCreate(): void {

    setRefreshPartyHandler((userId) => {

      const party = this.getPartyForUser(userId);

      if (party) this.broadcastParty(party);

    });

  }



  onDispose(): void {

    setRefreshPartyHandler(null);

  }



  messages = {

    sendGameInvite: (client: Client, data: SendGameInviteMessage) => {

      const hostUserId = this.getUserId(client);

      const hostUsername = this.getUsername(client);

      if (!hostUserId || !hostUsername) return;



      let party = this.getPartyForUser(hostUserId);

      if (!party) {

        party = this.createSoloParty(client, hostUserId, hostUsername);

      }

      if (!party || party.hostUserId !== hostUserId) {

        this.sendError(client, 'Only the party host can invite friends');

        return;

      }



      if (party.members.size >= MAX_PARTY_SIZE) {

        this.sendError(client, 'Party is full');

        return;

      }



      const guestUserId = data.targetUserId?.trim();

      const guestUsername = normalizeUsername(data.targetUsername);

      if (!guestUserId && !guestUsername) {

        this.sendError(client, 'Enter a valid friend');

        return;

      }



      const guestClient = guestUserId

        ? this.clientsByUserId.get(guestUserId)

        : guestUsername

          ? this.clientsByUsername.get(usernameKey(guestUsername))

          : undefined;



      if (!guestClient) {

        this.sendError(client, 'Friend is not online in the lobby');

        return;

      }



      const resolvedGuestUserId = this.getUserId(guestClient);

      const resolvedGuestUsername = this.getUsername(guestClient);

      if (!resolvedGuestUserId || !resolvedGuestUsername) {

        this.sendError(client, 'Friend is not online in the lobby');

        return;

      }



      if (hostUserId === resolvedGuestUserId) {

        this.sendError(client, 'You cannot invite yourself');

        return;

      }



      if (party.members.has(resolvedGuestUserId)) {

        this.sendError(client, 'Friend is already in your party');

        return;

      }



      // Re-invite replaces any pending invite so timed-out / ignored invites unlock.
      const existingPending = party.pendingInvites.get(resolvedGuestUserId);

      if (existingPending) {

        this.cancelInvite(existingPending.inviteId, { silentHost: true });

      }



      const guestParty = this.getPartyForUser(resolvedGuestUserId);

      if (guestParty && guestParty.members.size > 1) {

        this.sendError(client, 'Friend is already in another party');

        return;

      }



      const inviteId = generateRoomCode();

      const invite: PendingGameInvite = {

        inviteId,

        hostClient: client,

        hostUserId,

        hostUsername,

        guestUserId: resolvedGuestUserId,

        guestUsername: resolvedGuestUsername,

        guestClient,

      };

      invite.expireTimeout = setTimeout(() => {

        this.cancelInvite(inviteId);

      }, GAME_INVITE_TTL_MS);



      this.invitesById.set(inviteId, invite);

      party.pendingInvites.set(resolvedGuestUserId, invite);



      const payload: GameInviteMessage = {

        inviteId,

        roomId: party.partyId,

        fromUsername: hostUsername,

      };

      guestClient.send('gameInvite', payload);



      const sent: GameInviteSentMessage = {

        toUsername: resolvedGuestUsername,

        roomId: party.partyId,

        inviteId,

      };

      client.send('gameInviteSent', sent);

      this.broadcastParty(party);

    },



    respondGameInvite: (client: Client, data: RespondGameInviteMessage) => {

      const invite = this.invitesById.get(data.inviteId);

      if (!invite) return;



      const responderUserId = this.getUserId(client);

      const responderUsername = this.getUsername(client);

      if (!responderUserId || !responderUsername) return;

      if (responderUserId !== invite.guestUserId) return;



      const hostParty = this.partiesByHostUserId.get(invite.hostUserId);

      if (!hostParty) {

        this.clearInvite(invite.inviteId);

        return;

      }



      if (!data.accepted) {

        const declined: GameInviteDeclinedMessage = {

          inviteId: invite.inviteId,

          username: responderUsername,

        };

        invite.hostClient.send('gameInviteDeclined', declined);

        this.clearInvite(invite.inviteId, hostParty);

        this.broadcastParty(hostParty);

        return;

      }



      if (hostParty.members.size >= MAX_PARTY_SIZE) {

        this.sendError(client, 'Party is full');

        this.clearInvite(invite.inviteId, hostParty);

        this.broadcastParty(hostParty);

        return;

      }



      const guestParty = this.getPartyForUser(responderUserId);

      if (guestParty && guestParty.members.size > 1) {

        this.sendError(client, 'You are already in a party');

        this.clearInvite(invite.inviteId, hostParty);

        return;

      }



      this.removeMemberFromParty(responderUserId, { createSolo: false });



      hostParty.members.set(responderUserId, {

        userId: responderUserId,

        username: responderUsername,

        client,

        isHost: false,

        teamId: this.pickBalancedPartyTeam(hostParty),

      });

      this.partyHostByUserId.set(responderUserId, hostParty.hostUserId);



      const accepted: GameInviteAcceptedMessage = {

        inviteId: invite.inviteId,

        username: responderUsername,

      };

      invite.hostClient.send('gameInviteAccepted', accepted);

      this.clearInvite(invite.inviteId, hostParty);

      this.broadcastParty(hostParty);

    },



    startGameInvite: async (client: Client, data: StartGameInviteMessage) => {

      const partyId = data.partyId ?? data.inviteId;

      if (!partyId) {

        this.sendError(client, 'Party is no longer active');

        return;

      }



      const hostUserId = this.getUserId(client);

      if (!hostUserId) return;



      const party = this.partiesByHostUserId.get(hostUserId);

      if (!party || party.partyId !== partyId) {

        this.sendError(client, 'Party is no longer active');

        return;

      }



      if (party.hostUserId !== hostUserId) {

        this.sendError(client, 'Only the host can start the game');

        return;

      }



      if (party.members.size < 2) {

        this.sendError(client, 'Invite at least one friend first');

        return;

      }



      const launchMembers = [...party.members.values()].filter((member) =>

        this.clientsByUserId.has(member.userId),

      );



      if (launchMembers.length < 2) {

        this.sendError(client, 'A party member left the lobby');

        return;

      }



      const friendlyFire = party.friendlyFire || data.friendlyFire === true;
      const mapId = normalizeMapId(data.mapId);
      const gameMode = normalizeGameMode(data.gameMode);
      const matchDurationSec =
        typeof data.matchDurationSec === 'number' ? data.matchDurationSec : undefined;
      const killLimit = typeof data.killLimit === 'number' ? data.killLimit : undefined;

      try {

        const fpsRoom = await matchMaker.createRoom('fps', {

          inviteMatch: true,

          maxPartySize: launchMembers.length,

          friendlyFire,

          mapId,

          gameMode,

          matchDurationSec,

          killLimit,

        });

        const roomId = fpsRoom.roomId;

        if (!roomId) {

          throw new Error('matchmaker returned no room id');

        }

        const userIds = launchMembers.map((member) => member.userId);
        const cosmetics = await readPartyMemberCosmetics(userIds);
        const participants: GameLaunchParticipant[] = await Promise.all(
          launchMembers.map(async (member) => {
            const [stats, rank] = await Promise.all([
              getPlayerStats(member.userId),
              getCompetitiveRankCard(member.userId),
            ]);
            return {
              userId: member.userId,
              username: member.username,
              teamId: member.teamId,
              rankLevel: Math.max(1, stats.level || 1),
              careerKills: Math.max(0, stats.kills || 0),
              careerDeaths: Math.max(0, stats.deaths || 0),
              xp: Math.max(0, stats.xp || 0),
              rankTier: rank.tier,
              rankDivision: rank.division,
              rankName: rank.name,
              selectedOperatorId:
                cosmetics.get(member.userId)?.selectedOperatorId,
            };
          }),
        );

        for (const member of launchMembers) {
          const launch: GameLaunchMessage = {
            roomId,
            mapId,
            gameMode,
            matchDurationSec,
            killLimit,
            teamId: member.teamId,
            participants,
          };
          setPendingGameLaunch(member.userId, launch);
          member.client.send('gameLaunch', launch);
        }



        this.dissolveParty(party);

      } catch (error) {

        console.error('[LobbyRoom] failed to create fps room', error);

        this.sendError(client, 'Could not create game room');

      }

    },



    setPartyTeam: (client: Client, data: SetPartyTeamMessage) => {

      const userId = this.getUserId(client);

      if (!userId) return;

      const party = this.getPartyForUser(userId);

      const member = party?.members.get(userId);

      if (!party || !member) return;

      const teamId = Number(data.teamId);

      if (!isValidPartyTeamId(teamId) || member.teamId === teamId) return;

      member.teamId = teamId;

      this.broadcastParty(party);

    },

    setPartyFriendlyFire: (client: Client, data: SetPartyFriendlyFireMessage) => {

      const userId = this.getUserId(client);

      if (!userId) return;

      const party = this.getPartyForUser(userId);

      if (!party) return;

      if (party.hostUserId !== userId) {

        this.sendError(client, 'Only the party host can change friendly fire');

        return;

      }

      const friendlyFire = data.friendlyFire === true;

      if (party.friendlyFire === friendlyFire) return;

      party.friendlyFire = friendlyFire;

      this.broadcastParty(party);

    },

    leaveParty: (client: Client, _data: LeavePartyMessage) => {

      const userId = this.getUserId(client);

      if (!userId) return;



      const party = this.getPartyForUser(userId);

      if (!party || party.members.size <= 1) return;



      if (party.hostUserId === userId) {

        this.dissolveParty(party);

        return;

      }



      this.removeMemberFromParty(userId, { createSolo: true });

    },

    setAppView: (client: Client, data: SetAppViewMessage) => {
      const userId = this.getUserId(client);
      if (!userId) return;

      const view = data.view === 'menus' ? 'menus' : 'lobby';
      setLobbyAppView(userId, view, client);
    },

    requestFriendPresenceSnapshot: (client: Client) => {
      const userId = this.getUserId(client);
      if (!userId) return;
      void sendFriendPresenceSnapshot(client, userId);
    },

    requestGameLaunch: (client: Client) => {
      const userId = this.getUserId(client);
      if (!userId) return;

      const launch = consumePendingGameLaunch(userId);
      if (launch) {
        client.send('gameLaunch', launch);
        return;
      }

      client.send('gameLaunchNone', { _none: true });
    },

    requestPartySnapshot: (client: Client, _data: RequestPartySnapshotMessage) => {
      const userId = this.getUserId(client);
      if (!userId) return;

      const party = this.getPartyForUser(userId);
      if (party) {
        void this.sendPartySnapshot(client, party, userId);
        return;
      }

      const username = this.getUsername(client);
      if (username) {
        this.createSoloParty(client, userId, username);
      }
    },

  };



  onJoin(client: Client, options: JoinOptions): void {

    const userId = normalizeUserId(options.userId);

    const username = normalizeUsername(options.username);

    if (!userId || !username) {

      client.leave();

      return;

    }



    const key = usernameKey(username);

    const existingByName = this.clientsByUsername.get(key);

    if (existingByName && existingByName.sessionId !== client.sessionId) {

      existingByName.leave(4000);

    }



    const existingById = this.clientsByUserId.get(userId);

    if (existingById && existingById.sessionId !== client.sessionId) {

      existingById.leave(4000);

    }



    const player = new LobbyPlayerState();

    player.username = username;

    this.state.players.set(client.sessionId, player);

    this.clientsByUsername.set(key, client);

    this.clientsByUserId.set(userId, client);

    this.userIdByClient.set(client.sessionId, userId);

    registerLobbyUser(userId, client);

    void sendFriendPresenceSnapshot(client, userId);



    this.createSoloParty(client, userId, username);

  }



  onLeave(client: Client): void {

    const username = this.getUsername(client);

    const userId = this.getUserId(client);

    this.state.players.delete(client.sessionId);

    this.userIdByClient.delete(client.sessionId);



    if (userId) {

      if (this.clientsByUserId.get(userId)?.sessionId === client.sessionId) {

        this.clientsByUserId.delete(userId);

      }

      unregisterUser(userId);

    }



    if (!username) return;



    const key = usernameKey(username);

    if (this.clientsByUsername.get(key)?.sessionId === client.sessionId) {

      this.clientsByUsername.delete(key);

    }



    if (!userId) return;



    const party = this.getPartyForUser(userId);

    if (party) {

      if (party.hostUserId === userId && party.members.size > 1) {

        this.dissolveParty(party, userId);

      } else if (party.members.size > 1) {

        this.removeMemberFromParty(userId, { createSolo: false });

      } else {

        this.deleteParty(party);

      }

    }



    for (const invite of [...this.invitesById.values()]) {

      if (invite.hostUserId === userId) {

        this.cancelInvite(invite.inviteId);

        continue;

      }



      if (invite.guestUserId === userId) {

        const declined: GameInviteDeclinedMessage = {

          inviteId: invite.inviteId,

          username,

        };

        invite.hostClient.send('gameInviteDeclined', declined);

        const hostParty = this.partiesByHostUserId.get(invite.hostUserId);

        this.clearInvite(invite.inviteId, hostParty);

        if (hostParty) this.broadcastParty(hostParty);

      }

    }

  }



  private getUsername(client: Client): string | undefined {

    return this.state.players.get(client.sessionId)?.username;

  }



  private getUserId(client: Client): string | undefined {

    return this.userIdByClient.get(client.sessionId);

  }



  private getPartyForUser(userId: string): Party | undefined {

    const hostUserId = this.partyHostByUserId.get(userId);

    if (!hostUserId) return undefined;

    return this.partiesByHostUserId.get(hostUserId);

  }



  private createSoloParty(client: Client, userId: string, username: string): Party {

    const existing = this.getPartyForUser(userId);

    if (existing) {

      existing.members.get(userId)!.client = client;

      void this.sendPartySnapshot(client, existing, userId);

      return existing;

    }



    const party: Party = {

      partyId: generateRoomCode(),

      hostUserId: userId,

      members: new Map([

        [

          userId,

          {

            userId,

            username,

            client,

            isHost: true,

            teamId: 0,

          },

        ],

      ]),

      pendingInvites: new Map(),

      friendlyFire: false,

    };



    this.partiesByHostUserId.set(userId, party);

    this.partyHostByUserId.set(userId, userId);

    void this.sendPartySnapshot(client, party, userId);

    return party;

  }



  private removeMemberFromParty(

    userId: string,

    options: { createSolo: boolean },

  ): void {

    const party = this.getPartyForUser(userId);

    if (!party || !party.members.has(userId)) return;



    const member = party.members.get(userId)!;

    party.members.delete(userId);

    this.partyHostByUserId.delete(userId);



    if (party.members.size === 0) {

      this.deleteParty(party);

      if (options.createSolo) {

        this.createSoloParty(member.client, userId, member.username);

      }

      return;

    }



    this.broadcastParty(party);



    if (options.createSolo) {

      this.createSoloParty(member.client, userId, member.username);

    }

  }



  private dissolveParty(party: Party, departedUserId?: string): void {

    const members = [...party.members.values()];

    this.deleteParty(party);



    for (const member of members) {

      if (member.userId === departedUserId) continue;

      if (!this.clientsByUserId.has(member.userId)) continue;

      this.createSoloParty(member.client, member.userId, member.username);

    }

  }



  private deleteParty(party: Party): void {

    for (const member of party.members.keys()) {

      this.partyHostByUserId.delete(member);

    }

    this.partiesByHostUserId.delete(party.hostUserId);



    for (const invite of party.pendingInvites.values()) {

      this.invitesById.delete(invite.inviteId);

    }

    party.pendingInvites.clear();

  }



  private broadcastParty(party: Party): void {

    for (const member of party.members.values()) {

      void this.sendPartySnapshot(member.client, party, member.userId);

    }

  }



  /** New members join whichever side currently has fewer players. */
  private pickBalancedPartyTeam(party: Party): number {

    let team0 = 0;

    let team1 = 0;

    for (const member of party.members.values()) {

      if (member.teamId === 1) team1 += 1;
      else team0 += 1;

    }

    return team0 <= team1 ? 0 : 1;

  }



  private async sendPartySnapshot(client: Client, party: Party, viewerUserId: string): Promise<void> {

    try {

      const cosmetics = await readPartyMemberCosmetics(

        [...party.members.keys()],

      );

      const members: PartyMember[] = [...party.members.values()].map((member) => {

        const look = cosmetics.get(member.userId);

        return {

          userId: member.userId,

          username: member.username,

          isHost: member.isHost,

          teamId: member.teamId,

          selectedCharacterId: look?.selectedCharacterId ?? 'basic',

          selectedOperatorId: look?.selectedOperatorId ?? 'garla',

          primaryWeaponId: look?.primaryWeaponId ?? 'plasma_rifle',

        };

      });



      const isHost = party.hostUserId === viewerUserId;

      const pendingInviteUserIds = isHost

        ? [...party.pendingInvites.keys()]

        : [];



      const payload: PartySnapshotMessage = {

        partyId: party.partyId,

        members,

        isHost,

        viewerUserId,

        pendingInviteUserIds,

        friendlyFire: party.friendlyFire,

      };

      client.send('partySnapshot', payload);

    } catch (error) {

      console.error('[lobby] failed to send party snapshot', error);

      // Still unlock invite UI with a minimal solo snapshot.
      const isHost = party.hostUserId === viewerUserId;

      client.send('partySnapshot', {

        partyId: party.partyId,

        members: [...party.members.values()].map((member) => ({

          userId: member.userId,

          username: member.username,

          isHost: member.isHost,

          teamId: member.teamId,

          selectedCharacterId: 'basic',

          selectedOperatorId: 'garla',

          primaryWeaponId: 'plasma_rifle',

        })),

        isHost,

        viewerUserId,

        pendingInviteUserIds: isHost ? [...party.pendingInvites.keys()] : [],

        friendlyFire: party.friendlyFire,

      } satisfies PartySnapshotMessage);

    }

  }



  private cancelInvite(

    inviteId: string,

    options?: { silentHost?: boolean },

  ): void {

    const invite = this.invitesById.get(inviteId);

    if (!invite) return;



    const cancelled: GameInviteCancelledMessage = { inviteId };

    invite.guestClient?.send('gameInviteCancelled', cancelled);



    const hostParty = this.partiesByHostUserId.get(invite.hostUserId);

    this.clearInvite(inviteId, hostParty);

    if (hostParty && !options?.silentHost) this.broadcastParty(hostParty);

  }



  private clearInvite(inviteId: string, party?: Party): void {

    const invite = this.invitesById.get(inviteId);

    if (!invite) return;



    if (invite.expireTimeout) {

      clearTimeout(invite.expireTimeout);

      invite.expireTimeout = undefined;

    }

    this.invitesById.delete(inviteId);

    party?.pendingInvites.delete(invite.guestUserId);

  }



  private sendError(client: Client, message: string): void {

    const payload: FriendRequestErrorMessage = { message };

    client.send('friendRequestError', payload);

  }

}


