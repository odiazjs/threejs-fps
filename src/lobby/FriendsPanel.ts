import type {
  FriendRequestMessage,
  FriendRequestResultMessage,
} from '../../shared/network/friends';
import type {
  GameInviteMessage,
  GameInviteSentMessage,
} from '../../shared/network/gameInvite';
import { setGameJoinIntent } from '../auth/gameJoin';
import { addFriend, getFriends, isFriend } from '../auth/friendsStorage';
import type { LobbyClient } from './LobbyClient';

interface ActiveInvite {
  inviteId: string;
  roomId: string;
  friendUsername: string;
  accepted: boolean;
}

export class FriendsPanel {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly addBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly toastRoot: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly pending = new Map<string, FriendRequestMessage>();
  private readonly pendingGameInvites = new Map<string, GameInviteMessage>();
  private activeInvite: ActiveInvite | null = null;
  private launching = false;
  private launchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly lobby: LobbyClient) {
    this.root = document.getElementById('friends-panel')!;
    this.list = document.getElementById('friends-list')!;
    this.input = document.getElementById('friend-username-input') as HTMLInputElement;
    this.addBtn = document.getElementById('friend-add-btn') as HTMLButtonElement;
    this.status = document.getElementById('friends-status')!;
    this.toastRoot = document.getElementById('friend-toasts')!;
    this.startBtn = document.getElementById('game-start-btn') as HTMLButtonElement;

    this.addBtn.addEventListener('click', () => this.sendRequest());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.sendRequest();
    });
    this.startBtn.addEventListener('click', () => {
      void this.startHostedGame();
    });

    this.lobby.onFriendRequest((data) => this.showRequestToast(data));
    this.lobby.onFriendRequestSent((data) => {
      this.setStatus(`Friend request sent to ${data.toUsername}`);
    });
    this.lobby.onFriendRequestResult((data) => this.handleResult(data));
    this.lobby.onFriendRequestError((data) => this.handleError(data.message));

    this.lobby.onGameInvite((data) => this.showGameInviteToast(data));
    this.lobby.onGameInviteSent((data) => this.handleInviteSent(data));
    this.lobby.onGameInviteAccepted((data) => this.handleInviteAccepted(data));
    this.lobby.onGameInviteDeclined((data) => {
      if (this.activeInvite?.inviteId === data.inviteId) {
        this.clearActiveInvite();
        this.setStatus(`${data.username} declined your invite`);
      }
    });
    this.lobby.onGameInviteCancelled((data) => {
      this.removeGameInviteToast(data.inviteId);
      this.pendingGameInvites.delete(data.inviteId);
      this.setStatus('Game invite was cancelled');
    });
    this.lobby.onGameLaunch((data) => {
      this.launchGame(data.roomId, data.teamId);
    });

    this.renderFriends();
  }

  private sendRequest(): void {
    const username = this.input.value.trim();
    if (!username) {
      this.setStatus('Enter a username');
      return;
    }

    if (isFriend(username)) {
      this.setStatus('Already friends');
      return;
    }

    this.lobby.sendFriendRequest(username);
    this.input.value = '';
  }

  private sendGameInvite(friendUsername: string): void {
    if (this.activeInvite) {
      this.setStatus('Finish your current invite first');
      return;
    }

    this.lobby.sendGameInvite(friendUsername);
  }

  private handleInviteSent(data: GameInviteSentMessage): void {
    this.activeInvite = {
      inviteId: data.inviteId,
      roomId: data.roomId,
      friendUsername: data.toUsername,
      accepted: false,
    };
    this.updateStartButton();
    this.renderFriends();
    this.setStatus(`Invite sent to ${data.toUsername} — Room ${data.roomId}`);
  }

  private handleInviteAccepted(data: { inviteId: string; username: string }): void {
    if (!this.activeInvite || this.activeInvite.inviteId !== data.inviteId) return;

    this.activeInvite.accepted = true;
    this.updateStartButton();
    this.setStatus(`${data.username} accepted — start when ready`);
  }

  private startHostedGame(): void {
    if (!this.activeInvite?.accepted || this.launching) return;
    this.launching = true;
    this.startBtn.disabled = true;
    this.startBtn.textContent = 'STARTING...';
    this.startLaunchTimeout();
    this.lobby.startGameInvite(this.activeInvite.inviteId);
  }

  private launchGame(roomId: string, teamId: number): void {
    this.clearLaunchTimeout();
    setGameJoinIntent({ roomId, teamId, mode: 'join' });
    void this.lobby.disconnect();
    window.location.assign('/game.html');
  }

  private startLaunchTimeout(): void {
    this.clearLaunchTimeout();
    this.launchTimeout = setTimeout(() => {
      if (!this.launching) return;
      this.handleError('Game start timed out — try again');
    }, 12_000);
  }

  private clearLaunchTimeout(): void {
    if (!this.launchTimeout) return;
    clearTimeout(this.launchTimeout);
    this.launchTimeout = null;
  }

  private showRequestToast(data: FriendRequestMessage): void {
    if (isFriend(data.fromUsername)) return;
    if (this.pending.has(data.requestId)) return;

    this.pending.set(data.requestId, data);

    const toast = document.createElement('div');
    toast.className = 'friend-toast panel';
    toast.dataset.requestId = data.requestId;

    const text = document.createElement('p');
    text.className = 'friend-toast-text';
    text.textContent = `${data.fromUsername} wants to be friends`;

    const actions = document.createElement('div');
    actions.className = 'friend-toast-actions';

    const accept = document.createElement('button');
    accept.className = 'primary-btn friend-toast-accept';
    accept.type = 'button';
    accept.textContent = 'ACCEPT';

    const decline = document.createElement('button');
    decline.className = 'friend-toast-decline';
    decline.type = 'button';
    decline.textContent = 'DECLINE';

    accept.addEventListener('click', () => {
      this.lobby.respondFriendRequest(data.requestId, data.fromUsername, true);
      addFriend(data.fromUsername);
      this.pending.delete(data.requestId);
      toast.remove();
      this.renderFriends();
      this.setStatus(`You are now friends with ${data.fromUsername}`);
    });

    decline.addEventListener('click', () => {
      this.lobby.respondFriendRequest(data.requestId, data.fromUsername, false);
      this.pending.delete(data.requestId);
      toast.remove();
      this.setStatus(`Declined ${data.fromUsername}`);
    });

    actions.append(accept, decline);
    toast.append(text, actions);
    this.toastRoot.appendChild(toast);
  }

  private showGameInviteToast(data: GameInviteMessage): void {
    if (this.pendingGameInvites.has(data.inviteId)) return;

    this.pendingGameInvites.set(data.inviteId, data);

    const toast = document.createElement('div');
    toast.className = 'friend-toast panel';
    toast.dataset.inviteId = data.inviteId;

    const text = document.createElement('p');
    text.className = 'friend-toast-text';
    text.textContent = `${data.fromUsername} invited you to play`;

    const room = document.createElement('p');
    room.className = 'friend-toast-room';
    room.textContent = `Room ${data.roomId}`;

    const actions = document.createElement('div');
    actions.className = 'friend-toast-actions';

    const accept = document.createElement('button');
    accept.className = 'primary-btn friend-toast-accept';
    accept.type = 'button';
    accept.textContent = 'ACCEPT';

    const decline = document.createElement('button');
    decline.className = 'friend-toast-decline';
    decline.type = 'button';
    decline.textContent = 'DECLINE';

    accept.addEventListener('click', () => {
      this.lobby.respondGameInvite(data.inviteId, data.fromUsername, true);
      this.pendingGameInvites.delete(data.inviteId);
      toast.remove();
      this.setStatus(`Accepted invite from ${data.fromUsername} — waiting for host`);
    });

    decline.addEventListener('click', () => {
      this.lobby.respondGameInvite(data.inviteId, data.fromUsername, false);
      this.pendingGameInvites.delete(data.inviteId);
      toast.remove();
      this.setStatus(`Declined invite from ${data.fromUsername}`);
    });

    actions.append(accept, decline);
    toast.append(text, room, actions);
    this.toastRoot.appendChild(toast);
  }

  private removeGameInviteToast(inviteId: string): void {
    this.toastRoot
      .querySelector<HTMLElement>(`[data-invite-id="${inviteId}"]`)
      ?.remove();
  }

  private handleResult(data: FriendRequestResultMessage): void {
    const toast = this.toastRoot.querySelector<HTMLElement>(
      `[data-request-id="${data.requestId}"]`,
    );
    toast?.remove();
    this.pending.delete(data.requestId);

    if (!data.accepted) {
      this.setStatus(`${data.username} declined your request`);
      return;
    }

    addFriend(data.username);
    this.renderFriends();
    this.setStatus(`You are now friends with ${data.username}`);
  }

  private clearActiveInvite(): void {
    this.clearLaunchTimeout();
    this.activeInvite = null;
    this.launching = false;
    this.updateStartButton();
    this.renderFriends();
  }

  private updateStartButton(): void {
    const canStart = Boolean(this.activeInvite?.accepted) && !this.launching;
    this.startBtn.hidden = !canStart;
    this.startBtn.disabled = !canStart;
    this.startBtn.textContent = 'START GAME';
  }

  private renderFriends(): void {
    const friends = getFriends();
    this.list.replaceChildren();

    if (friends.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'friends-empty';
      empty.textContent = 'No friends yet';
      this.list.appendChild(empty);
      return;
    }

    for (const friend of friends) {
      const item = document.createElement('li');
      item.className = 'friends-item';

      const name = document.createElement('span');
      name.className = 'friends-item-name';
      name.textContent = friend;

      const inviteBtn = document.createElement('button');
      inviteBtn.type = 'button';
      inviteBtn.className = 'friend-invite-btn';

      const isActiveFriend =
        this.activeInvite?.friendUsername.toLowerCase() === friend.toLowerCase();

      if (isActiveFriend && this.activeInvite) {
        inviteBtn.textContent = this.activeInvite.roomId;
        inviteBtn.title = this.activeInvite.accepted
          ? 'Friend accepted — start the game'
          : 'Waiting for friend to accept';
        inviteBtn.disabled = true;
      } else {
        inviteBtn.textContent = 'INVITE';
        inviteBtn.disabled = Boolean(this.activeInvite);
        inviteBtn.addEventListener('click', () => this.sendGameInvite(friend));
      }

      item.append(name, inviteBtn);
      this.list.appendChild(item);
    }
  }

  private handleError(message: string): void {
    this.clearLaunchTimeout();
    if (this.launching) {
      this.launching = false;
      this.updateStartButton();
    }
    this.setStatus(message);
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }
}
