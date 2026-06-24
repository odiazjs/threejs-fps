import { Client, Room, matchMaker } from 'colyseus';
import type {
  FriendRequestErrorMessage,
  FriendRequestMessage,
  FriendRequestResultMessage,
  FriendRequestSentMessage,
  RespondFriendRequestMessage,
  SendFriendRequestMessage,
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

interface JoinOptions {
  username?: string;
}

interface PendingGameInvite {
  inviteId: string;
  hostClient: Client;
  hostUsername: string;
  guestUsername: string;
  guestClient: Client | null;
  accepted: boolean;
}

function normalizeUsername(raw?: string): string | null {
  const trimmed = raw?.trim().slice(0, 16);
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
  private readonly invitesById = new Map<string, PendingGameInvite>();
  private readonly inviteIdByHost = new Map<string, string>();

  messages = {
    sendFriendRequest: (client: Client, data: SendFriendRequestMessage) => {
      const fromUsername = this.getUsername(client);
      if (!fromUsername) return;

      const targetUsername = normalizeUsername(data.targetUsername);
      if (!targetUsername) {
        this.sendError(client, 'Enter a valid username');
        return;
      }

      if (usernameKey(fromUsername) === usernameKey(targetUsername)) {
        this.sendError(client, 'You cannot add yourself');
        return;
      }

      const targetClient = this.clientsByUsername.get(usernameKey(targetUsername));
      if (!targetClient) {
        this.sendError(client, 'Player is not online in the lobby');
        return;
      }

      const requestId = `${usernameKey(fromUsername)}:${usernameKey(targetUsername)}:${Date.now()}`;
      const payload: FriendRequestMessage = { requestId, fromUsername };

      targetClient.send('friendRequest', payload);

      const sent: FriendRequestSentMessage = { toUsername: targetUsername };
      client.send('friendRequestSent', sent);
    },

    respondFriendRequest: (client: Client, data: RespondFriendRequestMessage) => {
      const fromUsername = normalizeUsername(data.fromUsername);
      if (!fromUsername) return;

      const fromClient = this.clientsByUsername.get(usernameKey(fromUsername));
      if (!fromClient) return;

      const toUsername = this.getUsername(client);
      if (!toUsername) return;

      const result: FriendRequestResultMessage = {
        requestId: data.requestId,
        username: toUsername,
        accepted: data.accepted,
      };

      fromClient.send('friendRequestResult', result);

      if (data.accepted) {
        const mutual: FriendRequestResultMessage = {
          requestId: data.requestId,
          username: fromUsername,
          accepted: true,
        };
        client.send('friendRequestResult', mutual);
      }
    },

    sendGameInvite: (client: Client, data: SendGameInviteMessage) => {
      const hostUsername = this.getUsername(client);
      if (!hostUsername) return;

      const guestUsername = normalizeUsername(data.targetUsername);
      if (!guestUsername) {
        this.sendError(client, 'Enter a valid username');
        return;
      }

      if (usernameKey(hostUsername) === usernameKey(guestUsername)) {
        this.sendError(client, 'You cannot invite yourself');
        return;
      }

      const guestClient = this.clientsByUsername.get(usernameKey(guestUsername));
      if (!guestClient) {
        this.sendError(client, 'Friend is not online in the lobby');
        return;
      }

      const existingInviteId = this.inviteIdByHost.get(usernameKey(hostUsername));
      if (existingInviteId) {
        this.sendError(client, 'You already have an active invite');
        return;
      }

      const inviteId = generateRoomCode();
      const invite: PendingGameInvite = {
        inviteId,
        hostClient: client,
        hostUsername,
        guestUsername,
        guestClient,
        accepted: false,
      };

      this.invitesById.set(inviteId, invite);
      this.inviteIdByHost.set(usernameKey(hostUsername), inviteId);

      const payload: GameInviteMessage = {
        inviteId,
        roomId: inviteId,
        fromUsername: hostUsername,
      };
      guestClient.send('gameInvite', payload);

      const sent: GameInviteSentMessage = {
        toUsername: guestUsername,
        roomId: inviteId,
        inviteId,
      };
      client.send('gameInviteSent', sent);
    },

    respondGameInvite: (client: Client, data: RespondGameInviteMessage) => {
      const invite = this.invitesById.get(data.inviteId);
      if (!invite) return;

      const responderUsername = this.getUsername(client);
      if (!responderUsername) return;
      if (usernameKey(responderUsername) !== usernameKey(invite.guestUsername)) return;

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
        this.clientsByUsername.get(usernameKey(invite.guestUsername)) ?? invite.guestClient;
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
    const username = normalizeUsername(options.username);
    if (!username) {
      client.leave();
      return;
    }

    const key = usernameKey(username);
    const existing = this.clientsByUsername.get(key);
    if (existing && existing.sessionId !== client.sessionId) {
      existing.leave(4000);
    }

    const player = new LobbyPlayerState();
    player.username = username;
    this.state.players.set(client.sessionId, player);
    this.clientsByUsername.set(key, client);
  }

  onLeave(client: Client): void {
    const username = this.getUsername(client);
    this.state.players.delete(client.sessionId);
    if (!username) return;

    const key = usernameKey(username);
    if (this.clientsByUsername.get(key)?.sessionId === client.sessionId) {
      this.clientsByUsername.delete(key);
    }

    const hostInviteId = this.inviteIdByHost.get(key);
    if (hostInviteId) {
      this.cancelInvite(hostInviteId);
      return;
    }

    for (const invite of this.invitesById.values()) {
      if (
        invite.guestClient?.sessionId === client.sessionId &&
        usernameKey(invite.guestUsername) === key
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
    this.inviteIdByHost.delete(usernameKey(invite.hostUsername));
  }

  private sendError(client: Client, message: string): void {
    const payload: FriendRequestErrorMessage = { message };
    client.send('friendRequestError', payload);
  }
}
