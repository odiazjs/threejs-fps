import { Client, type Room } from '@colyseus/sdk';
import type {
  FriendPresenceSnapshotMessage,
  FriendPresenceUpdate,
} from '../../shared/network/friendPresence';
import type { AppPresenceView, SetAppViewMessage } from '../../shared/network/appView';
import type {
  FriendRequestErrorMessage,
  FriendRequestMessage,
  FriendRequestResultMessage,
} from '../../shared/network/friends';
import type {
  GameInviteAcceptedMessage,
  GameInviteCancelledMessage,
  GameInviteDeclinedMessage,
  GameInviteMessage,
  GameInviteSentMessage,
  GameLaunchMessage,
} from '../../shared/network/gameInvite';
import type {
  PartySnapshotMessage,
  RequestPartySnapshotMessage,
  SetPartyFriendlyFireMessage,
  SetPartyTeamMessage,
} from '../../shared/network/party';
import { LobbyState } from '../../shared/schema/LobbyState';
import { getServerUrl } from '../config/serverUrl';

interface LobbyJoinOptions {
  userId: string;
  username: string;
}

export class LobbyClient {
  private room: Room | null = null;
  private connectInFlight: Promise<void> | null = null;

  get connected(): boolean {
    return this.room !== null;
  }

  async connect(options: LobbyJoinOptions, url = getServerUrl()): Promise<void> {
    // Serialize connects — parallel reconnects were dissolving parties via
    // disconnect→onLeave while a brand-new join was already in flight.
    if (this.connectInFlight) {
      await this.connectInFlight;
      if (this.room) return;
    }

    this.connectInFlight = this.connectExclusive(options, url);
    try {
      await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
    }
  }

  private async connectExclusive(
    options: LobbyJoinOptions,
    url: string,
  ): Promise<void> {
    if (this.room) {
      await this.disconnect();
    }
    const client = new Client(url);
    this.room = await client.joinOrCreate('lobby', options, LobbyState);
    this.bindMessages();
    this.requestPartySnapshot();
    // Heal concurrent-join races: friends who registered in the same window
    // may be missing from the initial presence snapshot.
    window.setTimeout(() => {
      if (!this.room) return;
      this.requestFriendPresenceSnapshot();
    }, 750);
  }

  async reconnect(options: LobbyJoinOptions, url = getServerUrl()): Promise<void> {
    await this.connect(options, url);
  }

  async disconnect(): Promise<void> {
    if (!this.room) return;
    const room = this.room;
    this.room = null;
    await Promise.race([
      room.leave(true),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  }

  sendGameInvite(targetUserId: string): void {
    this.room?.send('sendGameInvite', { targetUserId });
  }

  respondGameInvite(
    inviteId: string,
    fromUsername: string,
    accepted: boolean,
  ): void {
    this.room?.send('respondGameInvite', { inviteId, fromUsername, accepted });
  }

  startGameInvite(
    partyId: string,
    friendlyFire: boolean,
    mapId: string,
    gameMode: string,
    matchDurationSec?: number,
    killLimit?: number,
    roundsToWin?: number,
  ): void {
    this.room?.send('startGameInvite', {
      partyId,
      friendlyFire,
      mapId,
      gameMode,
      matchDurationSec,
      killLimit,
      roundsToWin,
    });
  }

  leaveParty(partyId: string): void {
    this.room?.send('leaveParty', { partyId });
  }

  setPartyTeam(teamId: number): void {
    const payload: SetPartyTeamMessage = { teamId };
    this.room?.send('setPartyTeam', payload);
  }

  setPartyFriendlyFire(friendlyFire: boolean): void {
    const payload: SetPartyFriendlyFireMessage = { friendlyFire };
    this.room?.send('setPartyFriendlyFire', payload);
  }

  setAppView(view: AppPresenceView): void {
    const payload: SetAppViewMessage = { view };
    this.room?.send('setAppView', payload);
  }

  requestFriendPresenceSnapshot(): void {
    this.room?.send('requestFriendPresenceSnapshot', {});
  }

  requestPartySnapshot(): void {
    const payload: RequestPartySnapshotMessage = {};
    this.room?.send('requestPartySnapshot', payload);
  }

  onFriendRequest(handler: (data: FriendRequestMessage) => void): void {
    this.friendRequestHandler = handler;
  }

  onFriendRequestResult(handler: (data: FriendRequestResultMessage) => void): void {
    this.friendRequestResultHandler = handler;
  }

  onFriendRequestError(handler: (data: FriendRequestErrorMessage) => void): void {
    this.friendRequestErrorHandler = handler;
  }

  onPartySnapshot(handler: (data: PartySnapshotMessage) => void): void {
    this.partySnapshotHandler = handler;
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

  onFriendPresenceSnapshot(handler: (data: FriendPresenceSnapshotMessage) => void): void {
    this.friendPresenceSnapshotHandler = handler;
  }

  onFriendPresence(handler: (data: FriendPresenceUpdate) => void): void {
    this.friendPresenceHandler = handler;
  }

  private friendRequestHandler: ((data: FriendRequestMessage) => void) | null = null;
  private friendRequestResultHandler: ((data: FriendRequestResultMessage) => void) | null = null;
  private friendRequestErrorHandler: ((data: FriendRequestErrorMessage) => void) | null = null;
  private gameInviteHandler: ((data: GameInviteMessage) => void) | null = null;
  private gameInviteSentHandler: ((data: GameInviteSentMessage) => void) | null = null;
  private gameInviteAcceptedHandler: ((data: GameInviteAcceptedMessage) => void) | null = null;
  private gameInviteDeclinedHandler: ((data: GameInviteDeclinedMessage) => void) | null = null;
  private gameInviteCancelledHandler: ((data: GameInviteCancelledMessage) => void) | null = null;
  private gameLaunchHandler: ((data: GameLaunchMessage) => void) | null = null;
  private friendPresenceSnapshotHandler: ((data: FriendPresenceSnapshotMessage) => void) | null = null;
  private friendPresenceHandler: ((data: FriendPresenceUpdate) => void) | null = null;
  private partySnapshotHandler: ((data: PartySnapshotMessage) => void) | null = null;

  private bindMessages(): void {
    this.room?.onLeave(() => {
      this.room = null;
    });
    this.room?.onMessage('friendRequest', (data: FriendRequestMessage) => {
      this.friendRequestHandler?.(data);
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
    this.room?.onMessage('friendPresenceSnapshot', (data: FriendPresenceSnapshotMessage) => {
      this.friendPresenceSnapshotHandler?.(data);
    });
    this.room?.onMessage('friendPresence', (data: FriendPresenceUpdate) => {
      this.friendPresenceHandler?.(data);
    });
    this.room?.onMessage('partySnapshot', (data: PartySnapshotMessage) => {
      this.partySnapshotHandler?.(data);
    });
  }
}
