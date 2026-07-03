import type { FriendSummary } from '../../shared/api/friends';
import type {
  FriendPresenceStatus,
  FriendPresenceUpdate,
} from '../../shared/network/friendPresence';
import type {
  FriendRequestMessage,
  FriendRequestResultMessage,
} from '../../shared/network/friends';
import type {
  GameInviteMessage,
  GameInviteSentMessage,
} from '../../shared/network/gameInvite';
import { MAX_PARTY_SIZE, type PartySnapshotMessage } from '../../shared/network/party';
import {
  apiListFriends,
  apiRespondFriendRequest,
  apiSendFriendRequest,
} from '../auth/friendsApi';
import { setGameJoinIntent } from '../auth/gameJoin';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import type { LobbyClient } from './LobbyClient';
import { getSelectedMapId } from './mapSelection';
import { getSelectedGameMode } from './gameModeSelection';
import { isInviteablePresence } from './friendPresenceUi';

const ACTION_TIMEOUT_MS = 12_000;

interface PartySnapshotWaiter {
  predicate: (snapshot: PartySnapshotMessage) => boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface InviteSendWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class FriendsPanel {
  private readonly list: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly addBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly toastRoot: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly friendlyFireToggle: HTMLLabelElement;
  private readonly friendlyFireCheckbox: HTMLInputElement;
  private readonly loading = LoadingOverlay.shared();
  private readonly pending = new Map<string, FriendRequestMessage>();
  private readonly pendingGameInvites = new Map<string, GameInviteMessage>();
  private friends: FriendSummary[] = [];
  private readonly presenceByUserId = new Map<string, FriendPresenceStatus>();
  private party: PartySnapshotMessage | null = null;
  private launching = false;
  private launchTimeout: ReturnType<typeof setTimeout> | null = null;
  private onPartySnapshotHandler: ((data: PartySnapshotMessage) => void) | null = null;
  private inviteSendWaiter: InviteSendWaiter | null = null;
  private partySnapshotWaiters: PartySnapshotWaiter[] = [];

  constructor(private readonly lobby: LobbyClient) {
    this.list = document.getElementById('friends-list')!;
    this.input = document.getElementById('friend-email-input') as HTMLInputElement;
    this.addBtn = document.getElementById('friend-add-btn') as HTMLButtonElement;
    this.status = document.getElementById('friends-status')!;
    this.toastRoot = document.getElementById('friend-toasts')!;
    this.startBtn = document.getElementById('game-start-btn') as HTMLButtonElement;
    this.leaveBtn = document.getElementById('party-leave-btn') as HTMLButtonElement;
    this.friendlyFireToggle = document.getElementById('friendly-fire-toggle') as HTMLLabelElement;
    this.friendlyFireCheckbox = document.getElementById('friendly-fire-checkbox') as HTMLInputElement;

    this.addBtn.addEventListener('click', () => {
      void this.sendRequest();
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.sendRequest();
    });
    this.startBtn.addEventListener('click', () => {
      void this.startHostedGame();
    });
    this.leaveBtn.addEventListener('click', () => {
      void this.leaveParty();
    });

    this.lobby.onFriendRequest((data) => this.showRequestToast(data));
    this.lobby.onFriendRequestResult((data) => {
      void this.handleResult(data);
    });
    this.lobby.onFriendRequestError((data) => {
      if (this.inviteSendWaiter) {
        this.rejectInviteSendWait(new Error(data.message));
        this.setStatus(data.message);
        return;
      }
      this.handleActionError(data.message);
    });

    this.lobby.onGameInvite((data) => this.showGameInviteToast(data));
    this.lobby.onGameInviteSent((data) => this.handleInviteSent(data));
    this.lobby.onGameInviteAccepted((data) => {
      this.setStatus(`${data.username} joined your party`);
    });
    this.lobby.onGameInviteDeclined((data) => {
      this.setStatus(`${data.username} declined your invite`);
    });
    this.lobby.onGameInviteCancelled((data) => {
      this.removeGameInviteToast(data.inviteId);
      this.pendingGameInvites.delete(data.inviteId);
      this.setStatus('Game invite was cancelled');
    });
    this.lobby.onGameLaunch((data) => {
      this.launchGame(data.roomId, data.mapId, data.teamId);
    });

    this.lobby.onPartySnapshot((data) => {
      this.party = data;
      this.resolvePartySnapshotWaiters(data);
      this.updatePartyButtons();
      this.renderFriends();
      this.onPartySnapshotHandler?.(data);
    });

    this.lobby.onFriendPresenceSnapshot((data) => {
      this.applyPresenceSnapshot(data.friends);
    });
    this.lobby.onFriendPresence((data) => {
      this.applyPresenceUpdate(data);
    });
  }

  onPartySnapshot(handler: (data: PartySnapshotMessage) => void): void {
    this.onPartySnapshotHandler = handler;
  }

  async init(): Promise<void> {
    await this.loadFriends();
    this.refreshPresence();
    this.syncControls();
  }

  refreshPresence(): void {
    this.lobby.requestFriendPresenceSnapshot();
  }

  syncControls(): void {
    this.updatePartyButtons();
  }

  private applyPresenceSnapshot(updates: FriendPresenceUpdate[]): void {
    for (const entry of updates) {
      if (!this.friends.some((friend) => friend.userId === entry.userId)) continue;
      this.presenceByUserId.set(entry.userId, entry.presence);
      const friend = this.friends.find((item) => item.userId === entry.userId);
      if (friend) {
        friend.online = entry.online;
        friend.presence = entry.presence;
      }
    }
    this.renderFriends();
  }

  private async loadFriends(): Promise<void> {
    try {
      const data = await apiListFriends();
      this.friends = data.friends;

      for (const friend of this.friends) {
        const livePresence = this.presenceByUserId.get(friend.userId);
        if (livePresence) {
          friend.presence = livePresence;
          friend.online = livePresence !== 'offline';
        } else {
          this.presenceByUserId.set(friend.userId, friend.presence);
        }
      }

      for (const request of data.incoming) {
        if (this.pending.has(request.id)) continue;
        this.showRequestToast({
          requestId: request.id,
          fromUserId: request.fromUserId,
          fromUsername: request.fromDisplayName,
        });
      }

      this.renderFriends();
    } catch (error) {
      this.handleActionError(error instanceof Error ? error.message : 'Could not load friends');
    }
  }

  private isFriendUserId(userId: string): boolean {
    return this.friends.some((friend) => friend.userId === userId);
  }

  private isBusy(): boolean {
    return this.loading.active;
  }

  private async sendRequest(): Promise<void> {
    if (this.isBusy()) return;

    const email = this.input.value.trim().toLowerCase();
    if (!email) {
      this.setStatus('Enter an email address');
      return;
    }

    if (!email.includes('@')) {
      this.setStatus('Enter a valid email address');
      return;
    }

    if (this.friends.some((friend) => friend.email === email)) {
      this.setStatus('Already friends');
      return;
    }

    try {
      const result = await this.loading.run(
        () => apiSendFriendRequest(email),
        'Adding friend...',
      );
      this.input.value = '';
      this.setStatus(`Friend request sent to ${result.request.toDisplayName}`);
    } catch (error) {
      this.handleActionError(error instanceof Error ? error.message : 'Could not send request');
    }
  }

  private async sendGameInvite(friend: FriendSummary): Promise<void> {
    if (this.isBusy()) return;

    if (!this.party?.isHost) {
      this.setStatus('Only the party host can invite friends');
      return;
    }

    if (this.getPartySize() >= MAX_PARTY_SIZE) {
      this.setStatus('Party is full');
      return;
    }

    if (!isInviteablePresence(this.getFriendPresence(friend.userId))) {
      this.setStatus(`${friend.displayName} is not available`);
      return;
    }

    const waitForSend = this.beginInviteSendWait();
    this.lobby.sendGameInvite(friend.userId);

    try {
      await waitForSend;
      this.setStatus(`Invite sent to ${friend.displayName}`);
    } catch {
      // Status is set by rejectInviteSendWait or the lobby error handler.
    }
  }

  private handleInviteSent(data: GameInviteSentMessage): void {
    this.resolveInviteSendWait();
    this.renderFriends();
    this.setStatus(`Invite sent to ${data.toUsername} — Party ${data.roomId}`);
  }

  private async startHostedGame(): Promise<void> {
    if (!this.party?.isHost || this.getPartySize() < 2 || this.launching || this.isBusy()) {
      return;
    }

    this.launching = true;
    this.startBtn.disabled = true;
    this.startBtn.textContent = 'STARTING...';
    this.friendlyFireCheckbox.disabled = true;
    this.loading.show('Starting game...');
    this.startLaunchTimeout();
    this.lobby.startGameInvite(
      this.party.partyId,
      this.friendlyFireCheckbox.checked,
      getSelectedMapId(),
      getSelectedGameMode(),
    );
  }

  private async leaveParty(): Promise<void> {
    if (!this.party || this.getPartySize() <= 1 || this.isBusy()) return;

    const partyId = this.party.partyId;
    this.lobby.leaveParty(partyId);

    try {
      await this.waitForPartySnapshot(
        (snapshot) => snapshot.partyId !== partyId || (snapshot.isHost && snapshot.members.length === 1),
        'Leaving party...',
      );
      this.setStatus('Left the party');
    } catch (error) {
      this.handleActionError(error instanceof Error ? error.message : 'Could not leave party');
    }
  }

  private launchGame(roomId: string, mapId?: string, teamId?: number): void {
    this.clearLaunchTimeout();
    this.loading.show('Joining game...');
    setGameJoinIntent({
      roomId,
      mode: 'join',
      mapId: mapId ?? getSelectedMapId(),
      ...(typeof teamId === 'number' ? { teamId } : {}),
    });
    void this.lobby.disconnect();
    window.location.assign('/game.html');
  }

  private startLaunchTimeout(): void {
    this.clearLaunchTimeout();
    this.launchTimeout = setTimeout(() => {
      if (!this.launching) return;
      this.handleActionError('Game start timed out — try again');
    }, ACTION_TIMEOUT_MS);
  }

  private clearLaunchTimeout(): void {
    if (!this.launchTimeout) return;
    clearTimeout(this.launchTimeout);
    this.launchTimeout = null;
  }

  private showRequestToast(data: FriendRequestMessage): void {
    if (this.isFriendUserId(data.fromUserId)) return;
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
      void this.respondToRequest(data, true, toast);
    });

    decline.addEventListener('click', () => {
      void this.respondToRequest(data, false, toast);
    });

    actions.append(accept, decline);
    toast.append(text, actions);
    this.toastRoot.appendChild(toast);
  }

  private async respondToRequest(
    data: FriendRequestMessage,
    accepted: boolean,
    toast: HTMLElement,
  ): Promise<void> {
    if (this.isBusy()) return;

    try {
      await this.loading.run(
        () => apiRespondFriendRequest(data.requestId, accepted),
        accepted ? 'Accepting request...' : 'Declining request...',
      );
      this.pending.delete(data.requestId);
      toast.remove();

      if (accepted) {
        await this.loadFriends();
        this.setStatus(`You are now friends with ${data.fromUsername}`);
      } else {
        this.setStatus(`Declined ${data.fromUsername}`);
      }
    } catch (error) {
      this.handleActionError(error instanceof Error ? error.message : 'Could not respond');
    }
  }

  private showGameInviteToast(data: GameInviteMessage): void {
    if (this.pendingGameInvites.has(data.inviteId)) return;

    this.pendingGameInvites.set(data.inviteId, data);

    const toast = document.createElement('div');
    toast.className = 'friend-toast panel';
    toast.dataset.inviteId = data.inviteId;

    const text = document.createElement('p');
    text.className = 'friend-toast-text';
    text.textContent = `${data.fromUsername} invited you to their party`;

    const room = document.createElement('p');
    room.className = 'friend-toast-room';
    room.textContent = `Party ${data.roomId}`;

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
      void this.respondToGameInvite(data, true, toast);
    });

    decline.addEventListener('click', () => {
      void this.respondToGameInvite(data, false, toast);
    });

    actions.append(accept, decline);
    toast.append(text, room, actions);
    this.toastRoot.appendChild(toast);
  }

  private async respondToGameInvite(
    data: GameInviteMessage,
    accepted: boolean,
    toast: HTMLElement,
  ): Promise<void> {
    if (this.isBusy()) return;

    if (accepted) {
      this.lobby.respondGameInvite(data.inviteId, data.fromUsername, true);
      this.pendingGameInvites.delete(data.inviteId);
      toast.remove();

      try {
        await this.waitForPartySnapshot(
          (snapshot) => !snapshot.isHost && snapshot.members.length > 1,
          'Joining party...',
        );
        this.setStatus(`Joined ${data.fromUsername}'s party`);
      } catch (error) {
        this.handleActionError(error instanceof Error ? error.message : 'Could not join party');
      }
      return;
    }

    try {
      await this.loading.run(async () => {
        this.lobby.respondGameInvite(data.inviteId, data.fromUsername, false);
        this.pendingGameInvites.delete(data.inviteId);
        toast.remove();
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 250);
        });
      }, 'Declining invite...');
      this.setStatus(`Declined invite from ${data.fromUsername}`);
    } catch (error) {
      this.handleActionError(error instanceof Error ? error.message : 'Could not decline invite');
    }
  }

  private removeGameInviteToast(inviteId: string): void {
    this.toastRoot
      .querySelector<HTMLElement>(`[data-invite-id="${inviteId}"]`)
      ?.remove();
  }

  private async handleResult(data: FriendRequestResultMessage): Promise<void> {
    const toast = this.toastRoot.querySelector<HTMLElement>(
      `[data-request-id="${data.requestId}"]`,
    );
    toast?.remove();
    this.pending.delete(data.requestId);

    if (!data.accepted) {
      this.setStatus(`${data.username} declined your request`);
      return;
    }

    await this.loadFriends();
    this.setStatus(`You are now friends with ${data.username}`);
  }

  private getPartySize(): number {
    return this.party?.members.length ?? 1;
  }

  private isPartyMember(userId: string): boolean {
    return this.party?.members.some((member) => member.userId === userId) ?? false;
  }

  private isPendingInvite(userId: string): boolean {
    return this.party?.pendingInviteUserIds.includes(userId) ?? false;
  }

  private updatePartyButtons(): void {
    const partySize = this.getPartySize();
    const isHost = this.party?.isHost ?? false;
    const canStart = isHost && partySize >= 2 && !this.launching && !this.isBusy();
    const canLeave = partySize > 1 && !isHost;
    const showHostControls = isHost && partySize >= 2;
    const blockPartyActions = this.launching;

    this.friendlyFireToggle.hidden = !showHostControls;
    this.friendlyFireCheckbox.disabled = blockPartyActions;
    this.addBtn.disabled = false;
    this.input.disabled = false;

    this.startBtn.hidden = !canStart && !this.launching;
    this.startBtn.disabled = !canStart;
    this.startBtn.textContent = this.launching ? 'STARTING...' : 'START GAME';

    this.leaveBtn.hidden = !canLeave;
    this.leaveBtn.disabled = blockPartyActions || !canLeave;
  }

  private applyPresenceUpdate(update: FriendPresenceUpdate): void {
    if (!this.friends.some((friend) => friend.userId === update.userId)) return;
    this.presenceByUserId.set(update.userId, update.presence);

    const friend = this.friends.find((entry) => entry.userId === update.userId);
    if (friend) {
      friend.online = update.online;
      friend.presence = update.presence;
    }

    this.renderFriends();
  }

  private getFriendPresence(userId: string): FriendPresenceStatus {
    return this.presenceByUserId.get(userId) ?? 'offline';
  }

  private presenceLabel(presence: FriendPresenceStatus): string {
    switch (presence) {
      case 'lobby':
        return 'IN LOBBY';
      case 'menus':
        return 'IN MENUS';
      case 'game':
        return 'IN GAME';
      default:
        return 'OFFLINE';
    }
  }

  private renderFriends(): void {
    this.list.replaceChildren();
    const blockInvites = this.isBusy() || this.launching;

    if (this.friends.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'friends-empty';
      empty.textContent = 'No friends yet';
      this.list.appendChild(empty);
      return;
    }

    const isHost = this.party?.isHost ?? false;
    const partyFull = this.getPartySize() >= MAX_PARTY_SIZE;

    for (const friend of this.friends) {
      const item = document.createElement('li');
      item.className = 'friends-item';

      const identity = document.createElement('div');
      identity.className = 'friends-item-identity';

      const presence = this.getFriendPresence(friend.userId);

      const dot = document.createElement('span');
      dot.className = `friends-presence-dot friends-presence-dot--${presence}`;
      dot.setAttribute('aria-hidden', 'true');

      const status = document.createElement('span');
      status.className = `friends-presence-status friends-presence-status--${presence}`;
      status.textContent = this.presenceLabel(presence);

      const name = document.createElement('span');
      name.className = 'friends-item-name';
      name.textContent = friend.displayName;
      name.title = friend.email;

      identity.append(dot, status, name);

      const inviteBtn = document.createElement('button');
      inviteBtn.type = 'button';
      inviteBtn.className = 'friend-invite-btn';

      const inParty = this.isPartyMember(friend.userId);
      const pending = this.isPendingInvite(friend.userId);
      const canInvite =
        !blockInvites &&
        isHost &&
        !partyFull &&
        isInviteablePresence(presence) &&
        !inParty &&
        !pending;

      if (inParty) {
        inviteBtn.textContent = 'IN PARTY';
        inviteBtn.disabled = true;
        inviteBtn.title = 'Friend is in your party';
      } else if (pending) {
        inviteBtn.textContent = 'PENDING';
        inviteBtn.disabled = true;
        inviteBtn.title = 'Waiting for friend to accept';
      } else if (!isHost) {
        inviteBtn.textContent = 'INVITE';
        inviteBtn.disabled = true;
        inviteBtn.title = 'Only the party host can invite';
      } else {
        inviteBtn.textContent = 'INVITE';
        inviteBtn.disabled = !canInvite;
        if (!canInvite && blockInvites) {
          inviteBtn.title = 'Please wait for the current action to finish';
        } else if (!canInvite && presence === 'game') {
          inviteBtn.title = 'Friend is in a match';
        } else if (!canInvite && presence === 'menus') {
          inviteBtn.title = 'Friend is browsing menus';
        } else if (!canInvite && presence === 'offline') {
          inviteBtn.title = 'Friend is offline';
        } else if (!canInvite && partyFull) {
          inviteBtn.title = 'Party is full';
        }
        if (canInvite) {
          inviteBtn.addEventListener('click', () => {
            void this.sendGameInvite(friend);
          });
        }
      }

      item.append(identity, inviteBtn);
      this.list.appendChild(item);
    }
  }

  private beginInviteSendWait(): Promise<void> {
    this.rejectInviteSendWait(new Error('Invite replaced'));
    this.loading.show('Sending invite...');

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.rejectInviteSendWait(new Error('Invite timed out'));
      }, ACTION_TIMEOUT_MS);

      this.inviteSendWaiter = { resolve, reject, timeout };
    });
  }

  private resolveInviteSendWait(): void {
    if (!this.inviteSendWaiter) return;
    window.clearTimeout(this.inviteSendWaiter.timeout);
    this.inviteSendWaiter.resolve();
    this.inviteSendWaiter = null;
    this.loading.hide();
  }

  private rejectInviteSendWait(error: Error): void {
    if (!this.inviteSendWaiter) return;
    window.clearTimeout(this.inviteSendWaiter.timeout);
    this.inviteSendWaiter.reject(error);
    this.inviteSendWaiter = null;
    this.loading.hide();
  }

  private waitForPartySnapshot(
    predicate: (snapshot: PartySnapshotMessage) => boolean,
    message: string,
    timeoutMs = ACTION_TIMEOUT_MS,
  ): Promise<void> {
    if (this.party && predicate(this.party)) {
      return Promise.resolve();
    }

    this.loading.show(message);

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.removePartySnapshotWaiter(waiter);
        this.loading.hide();
        reject(new Error('Request timed out'));
      }, timeoutMs);

      const waiter: PartySnapshotWaiter = {
        predicate,
        resolve: () => {
          this.removePartySnapshotWaiter(waiter);
          this.loading.hide();
          resolve();
        },
        reject: (error) => {
          this.removePartySnapshotWaiter(waiter);
          this.loading.hide();
          reject(error);
        },
        timeout,
      };

      this.partySnapshotWaiters.push(waiter);
    });
  }

  private resolvePartySnapshotWaiters(snapshot: PartySnapshotMessage): void {
    for (const waiter of [...this.partySnapshotWaiters]) {
      if (!waiter.predicate(snapshot)) continue;
      window.clearTimeout(waiter.timeout);
      waiter.resolve();
    }
  }

  private removePartySnapshotWaiter(target: PartySnapshotWaiter): void {
    this.partySnapshotWaiters = this.partySnapshotWaiters.filter((waiter) => waiter !== target);
  }

  private handleActionError(message: string): void {
    this.rejectInviteSendWait(new Error(message));
    this.clearLaunchTimeout();
    if (this.launching) {
      this.launching = false;
      this.loading.hide();
      this.updatePartyButtons();
    }
    this.setStatus(message);
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }
}
