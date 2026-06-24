import { Client, type Room } from '@colyseus/sdk';
import type {
  FriendRequestErrorMessage,
  FriendRequestMessage,
  FriendRequestResultMessage,
  FriendRequestSentMessage,
} from '../../shared/network/friends';
import type {
  GameInviteAcceptedMessage,
  GameInviteCancelledMessage,
  GameInviteDeclinedMessage,
  GameInviteMessage,
  GameInviteSentMessage,
  GameLaunchMessage,
} from '../../shared/network/gameInvite';
import { LobbyState } from '../../shared/schema/LobbyState';
import { SERVER_URL } from '../config/serverUrl';

export class LobbyClient {
  private room: Room | null = null;

  get connected(): boolean {
    return this.room !== null;
  }

  async connect(username: string, url = SERVER_URL): Promise<void> {
    const client = new Client(url);
    this.room = await client.joinOrCreate('lobby', { username }, LobbyState);
    this.bindMessages();
  }

  async disconnect(): Promise<void> {
    if (!this.room) return;
    const room = this.room;
    this.room = null;
    await room.leave(true);
  }

  sendFriendRequest(targetUsername: string): void {
    this.room?.send('sendFriendRequest', { targetUsername });
  }

  respondFriendRequest(
    requestId: string,
    fromUsername: string,
    accepted: boolean,
  ): void {
    this.room?.send('respondFriendRequest', { requestId, fromUsername, accepted });
  }

  sendGameInvite(targetUsername: string): void {
    this.room?.send('sendGameInvite', { targetUsername });
  }

  respondGameInvite(
    inviteId: string,
    fromUsername: string,
    accepted: boolean,
  ): void {
    this.room?.send('respondGameInvite', { inviteId, fromUsername, accepted });
  }

  startGameInvite(inviteId: string): void {
    this.room?.send('startGameInvite', { inviteId });
  }

  onFriendRequest(handler: (data: FriendRequestMessage) => void): void {
    this.friendRequestHandler = handler;
  }

  onFriendRequestSent(handler: (data: FriendRequestSentMessage) => void): void {
    this.friendRequestSentHandler = handler;
  }

  onFriendRequestResult(handler: (data: FriendRequestResultMessage) => void): void {
    this.friendRequestResultHandler = handler;
  }

  onFriendRequestError(handler: (data: FriendRequestErrorMessage) => void): void {
    this.friendRequestErrorHandler = handler;
  }

  onGameInvite(handler: (data: GameInviteMessage) => void): void {
    this.gameInviteHandler = handler;
  }

  onGameInviteSent(handler: (data: GameInviteSentMessage) => void): void {
    this.gameInviteSentHandler = handler;
  }

  onGameInviteAccepted(handler: (data: GameInviteAcceptedMessage) => void): void {
    this.gameInviteAcceptedHandler = handler;
  }

  onGameInviteDeclined(handler: (data: GameInviteDeclinedMessage) => void): void {
    this.gameInviteDeclinedHandler = handler;
  }

  onGameInviteCancelled(handler: (data: GameInviteCancelledMessage) => void): void {
    this.gameInviteCancelledHandler = handler;
  }

  onGameLaunch(handler: (data: GameLaunchMessage) => void): void {
    this.gameLaunchHandler = handler;
  }

  private friendRequestHandler: ((data: FriendRequestMessage) => void) | null = null;
  private friendRequestSentHandler: ((data: FriendRequestSentMessage) => void) | null = null;
  private friendRequestResultHandler: ((data: FriendRequestResultMessage) => void) | null = null;
  private friendRequestErrorHandler: ((data: FriendRequestErrorMessage) => void) | null = null;
  private gameInviteHandler: ((data: GameInviteMessage) => void) | null = null;
  private gameInviteSentHandler: ((data: GameInviteSentMessage) => void) | null = null;
  private gameInviteAcceptedHandler: ((data: GameInviteAcceptedMessage) => void) | null = null;
  private gameInviteDeclinedHandler: ((data: GameInviteDeclinedMessage) => void) | null = null;
  private gameInviteCancelledHandler: ((data: GameInviteCancelledMessage) => void) | null = null;
  private gameLaunchHandler: ((data: GameLaunchMessage) => void) | null = null;

  private bindMessages(): void {
    this.room?.onMessage('friendRequest', (data: FriendRequestMessage) => {
      this.friendRequestHandler?.(data);
    });
    this.room?.onMessage('friendRequestSent', (data: FriendRequestSentMessage) => {
      this.friendRequestSentHandler?.(data);
    });
    this.room?.onMessage('friendRequestResult', (data: FriendRequestResultMessage) => {
      this.friendRequestResultHandler?.(data);
    });
    this.room?.onMessage('friendRequestError', (data: FriendRequestErrorMessage) => {
      this.friendRequestErrorHandler?.(data);
    });
    this.room?.onMessage('gameInvite', (data: GameInviteMessage) => {
      this.gameInviteHandler?.(data);
    });
    this.room?.onMessage('gameInviteSent', (data: GameInviteSentMessage) => {
      this.gameInviteSentHandler?.(data);
    });
    this.room?.onMessage('gameInviteAccepted', (data: GameInviteAcceptedMessage) => {
      this.gameInviteAcceptedHandler?.(data);
    });
    this.room?.onMessage('gameInviteDeclined', (data: GameInviteDeclinedMessage) => {
      this.gameInviteDeclinedHandler?.(data);
    });
    this.room?.onMessage('gameInviteCancelled', (data: GameInviteCancelledMessage) => {
      this.gameInviteCancelledHandler?.(data);
    });
    this.room?.onMessage('gameLaunch', (data: GameLaunchMessage) => {
      this.gameLaunchHandler?.(data);
    });
  }
}
