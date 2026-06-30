import { Client, Room, matchMaker } from 'colyseus';
import type {
  FriendRequestErrorMessage,
  FriendRequestResultMessage,
} from '../../../shared/network/friends.js';
import type {
  GameInviteAcceptedMessage,
  GameInviteCancelledMessage,
  GameInviteDeclinedMessage,
  GameInviteMessage,
  GameInviteSentMessage,
  GameLaunchMessage,
  RespondGameInviteMessage,
  SendGameInviteMessage,
  StartGameInviteMessage,
} from '../../../shared/network/gameInvite.js';
import { LobbyPlayerState, LobbyState } from '../../../shared/schema/LobbyState.js';
import { registerLobbyUser, unregisterLobbyUser } from '../lobby/presence.js';

interface JoinOptions {
  userId?: string;
  username?: string;
}

interface PendingGameInvite {
  inviteId: string;
  hostClient: Client;
  hostUserId: string;
  hostUsername: string;
  guestUserId: string;
  guestUsername: string;
  guestClient: Client | null;
  accepted: boolean;
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
  private readonly inviteIdByHost = new Map<string, string>();

  messages = {
    sendGameInvite: (client: Client, data: SendGameInviteMessage) => {
      const hostUserId = this.getUserId(client);
      const hostUsername = this.getUsername(client);
      if (!hostUserId || !hostUsername) return;

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

      const existingInviteId = this.inviteIdByHost.get(hostUserId);
      if (existingInviteId) {
        this.sendError(client, 'You already have an active invite');
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
        accepted: false,
      };

      this.invitesById.set(inviteId, invite);
      this.inviteIdByHost.set(hostUserId, inviteId);

      const payload: GameInviteMessage = {
        inviteId,
        roomId: inviteId,
        fromUsername: hostUsername,
      };
      guestClient.send('gameInvite', payload);

      const sent: GameInviteSentMessage = {
        toUsername: resolvedGuestUsername,
        roomId: inviteId,
        inviteId,
      };
      client.send('gameInviteSent', sent);
    },

    respondGameInvite: (client: Client, data: RespondGameInviteMessage) => {
      const invite = this.invitesById.get(data.inviteId);
      if (!invite) return;

      const responderUserId = this.getUserId(client);
      const responderUsername = this.getUsername(client);
      if (!responderUserId || !responderUsername) return;
      if (responderUserId !== invite.guestUserId) return;

      if (!data.accepted) {
        const declined: GameInviteDeclinedMessage = {
          inviteId: invite.inviteId,
          username: responderUsername,
        };
        invite.hostClient.send('gameInviteDeclined', declined);
        this.clearInvite(invite.inviteId);
        return;
      }

      invite.accepted = true;
      invite.guestClient = client;

      const accepted: GameInviteAcceptedMessage = {
        inviteId: invite.inviteId,
        username: responderUsername,
      };
      invite.hostClient.send('gameInviteAccepted', accepted);
    },

    startGameInvite: async (client: Client, data: StartGameInviteMessage) => {
      const invite = this.invitesById.get(data.inviteId);
      if (!invite) {
        this.sendError(client, 'Invite is no longer active');
        return;
      }

      if (invite.hostClient.sessionId !== client.sessionId) {
        this.sendError(client, 'Only the host can start the game');
        return;
      }

      if (!invite.accepted) {
        this.sendError(client, 'Your friend has not accepted yet');
        return;
      }

      const guestClient =
        this.clientsByUserId.get(invite.guestUserId) ?? invite.guestClient;
      if (!guestClient) {
        this.sendError(client, 'Your friend left the lobby');
        return;
      }

      try {
        const fpsRoom = await matchMaker.createRoom('fps', { inviteMatch: true });
        const roomId = fpsRoom.roomId;
        if (!roomId) {
          throw new Error('matchmaker returned no room id');
        }

        const hostLaunch: GameLaunchMessage = { roomId, teamId: 0 };
        const guestLaunch: GameLaunchMessage = { roomId, teamId: 1 };

        client.send('gameLaunch', hostLaunch);
        guestClient.send('gameLaunch', guestLaunch);
        this.clearInvite(invite.inviteId);
      } catch (error) {
        console.error('[LobbyRoom] failed to create fps room', error);
        this.sendError(client, 'Could not create game room');
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
      unregisterLobbyUser(userId);
    }

    if (!username) return;

    const key = usernameKey(username);
    if (this.clientsByUsername.get(key)?.sessionId === client.sessionId) {
      this.clientsByUsername.delete(key);
    }

    const hostInviteId = userId ? this.inviteIdByHost.get(userId) : undefined;
    if (hostInviteId) {
      this.cancelInvite(hostInviteId);
      return;
    }

    for (const invite of this.invitesById.values()) {
      if (
        invite.guestClient?.sessionId === client.sessionId &&
        invite.guestUserId === userId
      ) {
        const declined: GameInviteDeclinedMessage = {
          inviteId: invite.inviteId,
          username,
        };
        invite.hostClient.send('gameInviteDeclined', declined);
        this.clearInvite(invite.inviteId);
        break;
      }
    }
  }

  private getUsername(client: Client): string | undefined {
    return this.state.players.get(client.sessionId)?.username;
  }

  private getUserId(client: Client): string | undefined {
    return this.userIdByClient.get(client.sessionId);
  }

  private cancelInvite(inviteId: string): void {
    const invite = this.invitesById.get(inviteId);
    if (!invite) return;

    const cancelled: GameInviteCancelledMessage = { inviteId };
    invite.guestClient?.send('gameInviteCancelled', cancelled);
    this.clearInvite(inviteId);
  }

  private clearInvite(inviteId: string): void {
    const invite = this.invitesById.get(inviteId);
    if (!invite) return;

    this.invitesById.delete(inviteId);
    this.inviteIdByHost.delete(invite.hostUserId);
  }

  private sendError(client: Client, message: string): void {
    const payload: FriendRequestErrorMessage = { message };
    client.send('friendRequestError', payload);
  }
}
