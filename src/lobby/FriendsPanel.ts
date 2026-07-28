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
import {
  MAX_PARTY_SIZE,
  isValidPartyTeamId,
  type PartySnapshotMessage,
} from '../../shared/network/party';
import { TEAM_COLORS, TEAM_NAMES } from '../../shared/combat/teams';
import {
  apiListFriends,
  apiRespondFriendRequest,
  apiSendFriendRequest,
} from '../auth/friendsApi';
import { setGameJoinIntent } from '../auth/gameJoin';
import { buildGameUrl } from '../debug/debugQuery';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import type { LobbyClient } from './LobbyClient';
import { launchGameOverlay, onGameOverlayClosed } from './launchGameOverlay';
import { getSelectedMapId } from './mapSelection';
import { getSelectedMatchRules } from './gameModeSelection';
import { isInviteablePresence } from './friendPresenceUi';

const ACTION_TIMEOUT_MS = 12_000;
/** Minimum gap between invite sends (re-invite replaces any pending invite). */
const INVITE_COOLDOWN_MS = 3_000;

interface PartySnapshotWaiter {
  predicate: (snapshot: PartySnapshotMessage) => boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

type SocialListTab = 'friends' | 'party';

interface InviteSendWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class FriendsPanel {
  private readonly list: HTMLElement;
  private readonly partyList: HTMLElement;
  private readonly friendsTabBtn: HTMLButtonElement;
  private readonly partyTabBtn: HTMLButtonElement;
  private readonly friendsSection: HTMLElement;
  private readonly partyMembersSection: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly addBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly toastRoot: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly friendlyFireToggle: HTMLLabelElement;
  private readonly friendlyFireCheckbox: HTMLInputElement;
  private readonly teamPicker: HTMLElement;
  private readonly teamBlueBtn: HTMLButtonElement;
  private readonly teamOrangeBtn: HTMLButtonElement;
  private readonly launchBtn: HTMLButtonElement;
  private readonly loading = LoadingOverlay.shared();
  private readonly pending = new Map<string, FriendRequestMessage>();
  private readonly pendingGameInvites = new Map<string, GameInviteMessage>();
  private friends: FriendSummary[] = [];
  private readonly presenceByUserId = new Map<string, FriendPresenceStatus>();
  private party: PartySnapshotMessage | null = null;
  private partyLeaveInFlight = false;
  private activeListTab: SocialListTab = 'friends';
  private launching = false;
  private launchTimeout: ReturnType<typeof setTimeout> | null = null;
  private onPartySnapshotHandler: ((data: PartySnapshotMessage) => void) | null = null;
  private inviteSendWaiter: InviteSendWaiter | null = null;
  private partySnapshotWaiters: PartySnapshotWaiter[] = [];
  /** userId → last successful/attempted invite send time (cooldown). */
  private readonly inviteCooldownUntilByUserId = new Map<string, number>();

  constructor(private readonly lobby: LobbyClient) {
    this.list = document.getElementById('friends-list')!;
    this.partyList = document.getElementById('party-members-list')!;
    this.friendsTabBtn = document.getElementById('friends-tab-btn') as HTMLButtonElement;
    this.partyTabBtn = document.getElementById('party-tab-btn') as HTMLButtonElement;
    this.friendsSection = document.getElementById('friends-section')!;
    this.partyMembersSection = document.getElementById('party-members-section')!;
    this.input = document.getElementById('friend-email-input') as HTMLInputElement;
    this.addBtn = document.getElementById('friend-add-btn') as HTMLButtonElement;
    this.status = document.getElementById('friends-status')!;
    this.toastRoot = document.getElementById('friend-toasts')!;
    this.startBtn = document.getElementById('game-start-btn') as HTMLButtonElement;
    this.leaveBtn = document.getElementById('party-leave-btn') as HTMLButtonElement;
    this.friendlyFireToggle = document.getElementById('friendly-fire-toggle') as HTMLLabelElement;
    this.friendlyFireCheckbox = document.getElementById('friendly-fire-checkbox') as HTMLInputElement;
    this.teamPicker = document.getElementById('party-team-picker')!;
    this.teamBlueBtn = document.getElementById('party-team-blue-btn') as HTMLButtonElement;
    this.teamOrangeBtn = document.getElementById('party-team-orange-btn') as HTMLButtonElement;
    this.launchBtn = document.getElementById('lobby-join-btn') as HTMLButtonElement;

    this.addBtn.addEventListener('click', () => {
      void this.sendRequest();
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.sendRequest();
    });
    this.startBtn.addEventListener('click', () => {
      void this.startHostedGame();
    });
    this.launchBtn.addEventListener('click', () => {
      void this.handleLaunchClick();
    });
    this.leaveBtn.addEventListener('click', () => {
      void this.leaveParty();
    });
    this.teamBlueBtn.addEventListener('click', () => this.pickTeam(0));
    this.teamOrangeBtn.addEventListener('click', () => this.pickTeam(1));
    this.friendlyFireCheckbox.addEventListener('change', () => {
      if (!this.party?.isHost) {
        this.friendlyFireCheckbox.checked = this.party?.friendlyFire ?? false;
        return;
      }
      this.lobby.setPartyFriendlyFire(this.friendlyFireCheckbox.checked);
    });
    this.friendsTabBtn.addEventListener('click', () => this.setListTab('friends'));
    this.partyTabBtn.addEventListener('click', () => this.setListTab('party'));
    onGameOverlayClosed(() => {
      // Presence/party refresh happens in syncAfterGameReconnect() after the
      // lobby socket is back — requesting here races a null room.
      this.clearLaunchTimeout();
      this.launching = false;
      this.loading.reset();
      this.updatePartyButtons();
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
      this.refreshListPanel();
    });
    this.lobby.onGameInviteCancelled((data) => {
      this.removeGameInviteToast(data.inviteId);
      this.pendingGameInvites.delete(data.inviteId);
      this.setStatus('Game invite was cancelled');
      this.refreshListPanel();
    });
    this.lobby.onGameLaunch((data) => {
      this.launchGame(data);
    });

    this.lobby.onPartySnapshot((data) => {
      // Defend against reconnect races that briefly emit a fresh solo party
      // while we still expect the post-match roster. Explicit leave/disband
      // sets partyLeaveInFlight so those snapshots are accepted.
      if (
        !this.partyLeaveInFlight
        && this.party
        && this.party.members.length >= 2
        && data.members.length < 2
        && this.party.status === 'in_match'
      ) {
        console.warn(
          '[Lobby] ignoring solo party snapshot while multi-member party is in match',
          { previous: this.party.partyId, next: data.partyId },
        );
        this.lobby.requestPartySnapshot();
        return;
      }

      this.partyLeaveInFlight = false;
      this.party = data;
      // Party snapshots carry authoritative presence (including in-game members
      // who no longer have a lobby friend-presence watch).
      for (const member of data.members) {
        if (member.presence) {
          this.presenceByUserId.set(member.userId, member.presence);
        }
      }
      this.resolvePartySnapshotWaiters(data);
      if (data.members.length >= 2 && this.activeListTab !== 'party') {
        this.activeListTab = 'party';
      }
      this.updatePartyButtons();
      this.refreshListPanel();
      this.onPartySnapshotHandler?.(data);
    });

    this.lobby.onFriendPresenceSnapshot((data) => {
      this.applyPresenceSnapshot(data.friends);
    });
    this.lobby.onFriendPresence((data) => {
      this.applyPresenceUpdate(data);
      this.updatePartyButtons();
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
    this.lobby.requestPartySnapshot();
  }

  /** Call after lobby reconnect when returning from a match overlay. */
  syncAfterGameReconnect(): void {
    this.clearLaunchTimeout();
    this.launching = false;
    this.loading.reset();
    this.refreshPresence();
    this.syncControls();
  }

  syncControls(): void {
    this.syncListTabs();
    this.updatePartyButtons();
    // Re-render friends so invite buttons aren't stuck disabled from an earlier
    // frame when the global boot loading overlay was still active.
    this.refreshListPanel();
  }

  /**
   * Invite gating must NOT use the shared LoadingOverlay — boot / page navigations
   * leave invites greyed out after presence already shows "in lobby".
   */
  private isInviteUiBlocked(): boolean {
    return this.launching || this.inviteSendWaiter !== null;
  }

  private applyPresenceSnapshot(updates: FriendPresenceUpdate[]): void {
    for (const entry of updates) {
      const current = this.presenceByUserId.get(entry.userId);
      // Concurrent joins: a snapshot started before a friend registered can arrive
      // after a live `friendPresence` update and wrongly wipe ONLINE → offline.
      if (
        entry.presence === 'offline'
        && current
        && current !== 'offline'
      ) {
        continue;
      }
      this.presenceByUserId.set(entry.userId, entry.presence);
      const friend = this.friends.find((item) => item.userId === entry.userId);
      if (friend) {
        friend.online = entry.online || entry.presence !== 'offline';
        friend.presence = this.presenceByUserId.get(entry.userId) ?? entry.presence;
      }
    }
    this.refreshListPanel();
    this.updatePartyButtons();
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

      this.refreshListPanel();
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
    if (this.isInviteUiBlocked()) return;

    // Solo lobby: missing snapshot still means you can host invites.
    if (this.party && !this.party.isHost) {
      this.setStatus('Only the party host can invite friends');
      return;
    }

    if (this.party?.status === 'in_match') {
      this.setStatus('Wait for everyone to return from the match');
      return;
    }

    if (!this.party) {
      this.lobby.requestPartySnapshot();
    }

    if (this.getPartySize() >= MAX_PARTY_SIZE) {
      this.setStatus('Party is full');
      return;
    }

    if (!isInviteablePresence(this.getFriendPresence(friend.userId))) {
      this.setStatus(`${friend.displayName} is not available`);
      return;
    }

    const cooldownUntil = this.inviteCooldownUntilByUserId.get(friend.userId) ?? 0;
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs > 0) {
      this.setStatus(`Wait ${Math.ceil(remainingMs / 1000)}s to re-invite`);
      return;
    }

    this.inviteCooldownUntilByUserId.set(friend.userId, Date.now() + INVITE_COOLDOWN_MS);
    this.refreshListPanel();
    this.scheduleInviteCooldownRefresh();

    const waitForSend = this.beginInviteSendWait();
    this.lobby.sendGameInvite(friend.userId);

    try {
      await waitForSend;
      this.setStatus(`Invite sent to ${friend.displayName}`);
    } catch (error) {
      // Allow immediate retry after hard failures / timeouts.
      this.inviteCooldownUntilByUserId.delete(friend.userId);
      this.refreshListPanel();
      if (error instanceof Error && error.message === 'Invite timed out') {
        this.setStatus('Invite timed out — you can try again');
      }
    }
  }

  private handleInviteSent(data: GameInviteSentMessage): void {
    this.resolveInviteSendWait();
    this.refreshListPanel();
    this.setStatus(`Invite sent to ${data.toUsername} — Party ${data.roomId}`);
  }

  private scheduleInviteCooldownRefresh(): void {
    window.setTimeout(() => this.refreshListPanel(), INVITE_COOLDOWN_MS + 50);
  }

  private async handleLaunchClick(): Promise<void> {
    if (this.loading.active || this.launching) return;

    if (this.hasActiveParty()) {
      await this.startHostedGame();
      return;
    }

    await this.launchQuickMatch();
  }

  private async launchQuickMatch(): Promise<void> {
    this.loading.reset();
    this.loading.show('Joining game...');
    this.launchBtn.disabled = true;
    const rules = getSelectedMatchRules();
    const intent = {
      mode: 'create' as const,
      mapId: getSelectedMapId(),
      gameMode: rules.gameMode,
      matchDurationSec: rules.matchDurationSec,
      killLimit: rules.killLimit,
    };
    setGameJoinIntent(intent);

    try {
      await launchGameOverlay();
    } catch (error) {
      console.warn('[Lobby] failed to launch game', error);
      this.loading.reset();
      this.launchBtn.disabled = false;
      window.location.href = buildGameUrl('/game.html');
    } finally {
      this.loading.reset();
      this.updatePartyButtons();
    }
  }

  private async startHostedGame(): Promise<void> {
    if (
      !this.party?.isHost
      || this.getPartySize() < 2
      || this.launching
      || this.isBusy()
      || !this.canHostLaunchParty()
    ) {
      return;
    }

    this.launching = true;
    this.startBtn.disabled = true;
    this.startBtn.textContent = 'STARTING...';
    this.friendlyFireCheckbox.disabled = true;
    this.updateLaunchButton();
    this.loading.show('Starting game...');
    this.startLaunchTimeout();
    const rules = getSelectedMatchRules();
    this.lobby.startGameInvite(
      this.party.partyId,
      this.friendlyFireCheckbox.checked,
      getSelectedMapId(),
      rules.gameMode,
      rules.matchDurationSec,
      rules.killLimit,
    );
  }

  private async leaveParty(): Promise<void> {
    if (!this.party || this.getPartySize() <= 1 || this.isBusy()) return;

    const partyId = this.party.partyId;
    this.partyLeaveInFlight = true;
    this.lobby.leaveParty(partyId);

    try {
      await this.waitForPartySnapshot(
        (snapshot) => snapshot.partyId !== partyId || (snapshot.isHost && snapshot.members.length === 1),
        'Leaving party...',
      );
      this.setStatus('Left the party');
    } catch (error) {
      this.partyLeaveInFlight = false;
      this.handleActionError(error instanceof Error ? error.message : 'Could not leave party');
    }
  }

  private launchGame(data: {
    roomId: string;
    mapId?: string;
    teamId?: number;
    gameMode?: string;
    matchDurationSec?: number;
    killLimit?: number;
    participants?: import('../../shared/network/gameInvite').GameLaunchParticipant[];
  }): void {
    this.clearLaunchTimeout();
    // Prefetch roster into sessionStorage so the game iframe can paint the
    // pre-match screen immediately (even before re-fetching the lobby launch).
    const rules = getSelectedMatchRules();
    setGameJoinIntent({
      roomId: data.roomId,
      mode: 'join',
      mapId: data.mapId ?? getSelectedMapId(),
      gameMode: (data.gameMode as typeof rules.gameMode | undefined) ?? rules.gameMode,
      matchDurationSec: data.matchDurationSec ?? rules.matchDurationSec,
      killLimit: data.killLimit ?? rules.killLimit,
      ...(typeof data.teamId === 'number' ? { teamId: data.teamId } : {}),
      ...(data.participants && data.participants.length > 0
        ? { participants: data.participants }
        : {}),
    });
    // Replace any prior spinner (e.g. "Starting game...") — depth must not stack.
    this.loading.reset();
    this.loading.show('Joining game...');
    // Keep the lobby connection; the match runs in an overlay iframe.
    // Game client fetches roomId from the lobby WebSocket on load.
    void launchGameOverlay()
      .catch((error) => {
        console.warn('[Lobby] failed to launch game overlay', error);
        this.launching = false;
        this.loading.reset();
        this.updatePartyButtons();
        setGameJoinIntent({
          roomId: data.roomId,
          mode: 'join',
          mapId: data.mapId ?? getSelectedMapId(),
          ...getSelectedMatchRules(),
          ...(typeof data.teamId === 'number' ? { teamId: data.teamId } : {}),
          ...(data.participants && data.participants.length > 0
            ? { participants: data.participants }
            : {}),
        });
        window.location.assign(buildGameUrl('/game.html'));
      })
      .finally(() => {
        this.loading.reset();
      });
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
    toast.className = 'friend-toast hud-panel';
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
    // One invite UI at a time — dismiss prior toast(s) and replay fly-in.
    this.dismissActiveGameInviteToasts(data.inviteId);

    if (this.pendingGameInvites.has(data.inviteId)) {
      this.removeGameInviteToast(data.inviteId);
      this.pendingGameInvites.delete(data.inviteId);
    }

    this.pendingGameInvites.set(data.inviteId, data);

    const toast = document.createElement('div');
    toast.className = 'friend-toast friend-toast--invite hud-panel';
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

    // Restart CSS fly-in even if a toast node was recycled in the same frame.
    void toast.offsetWidth;
    toast.classList.add('is-flying-in');
  }

  /** Drop other invite toasts; auto-decline superseded invites on the server. */
  private dismissActiveGameInviteToasts(keepInviteId?: string): void {
    for (const [inviteId, pending] of [...this.pendingGameInvites]) {
      if (inviteId === keepInviteId) continue;
      this.lobby.respondGameInvite(inviteId, pending.fromUsername, false);
      this.removeGameInviteToast(inviteId);
      this.pendingGameInvites.delete(inviteId);
    }
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
    const canStart = this.canHostLaunchParty() && !this.launching && !this.isBusy();
    const canLeave = partySize > 1;
    const showPartyControls = partySize >= 2;
    const blockPartyActions = this.launching;

    if (showPartyControls && this.activeListTab !== 'party') {
      this.activeListTab = 'party';
    }

    const slotEl = document.getElementById('party-slot-count');
    if (slotEl) {
      slotEl.textContent = `${partySize}/${MAX_PARTY_SIZE}`;
    }

    this.friendlyFireToggle.hidden = !showPartyControls;
    this.friendlyFireCheckbox.checked = this.party?.friendlyFire ?? false;
    this.friendlyFireCheckbox.disabled = blockPartyActions || !isHost;
    this.friendlyFireToggle.title = isHost
      ? 'Allow damage between teammates (testing)'
      : 'Only the party host can change friendly fire';

    this.updateTeamPicker(showPartyControls, blockPartyActions);
    this.addBtn.disabled = false;
    this.input.disabled = false;

    this.startBtn.hidden = true;
    this.startBtn.disabled = !canStart;

    this.leaveBtn.hidden = !canLeave;
    this.leaveBtn.disabled = blockPartyActions || !canLeave;
    this.leaveBtn.textContent = isHost ? 'DISBAND' : 'LEAVE';

    this.syncListTabs();
    this.updateLaunchButton();
  }

  private updateLaunchButton(): void {
    const partySize = this.getPartySize();
    const inParty = this.hasActiveParty();
    const isHost = this.party?.isHost ?? false;
    const canPartyLaunch = this.canHostLaunchParty() && !this.launching && !this.isBusy();
    const waitingForMembers = this.getMembersNotInLobby();

    if (inParty) {
      this.launchBtn.textContent = this.launching ? 'STARTING...' : 'LAUNCH';
      this.launchBtn.classList.add('is-party-launch');

      if (!isHost) {
        this.launchBtn.disabled = true;
        this.launchBtn.title = 'Only the party host can launch';
      } else if (partySize < 2) {
        this.launchBtn.disabled = true;
        this.launchBtn.title = 'Need at least one party member';
      } else if (waitingForMembers.length > 0) {
        this.launchBtn.disabled = true;
        const names = waitingForMembers
          .map((member) => member.username)
          .slice(0, 2)
          .join(', ');
        this.launchBtn.title = `Waiting for ${names} to return to lobby`;
      } else if (this.party?.status === 'in_match') {
        this.launchBtn.disabled = true;
        this.launchBtn.title = 'Party is still finishing the match';
      } else {
        this.launchBtn.disabled = !canPartyLaunch;
        this.launchBtn.title = canPartyLaunch ? 'Start party match' : '';
      }
      return;
    }

    this.launchBtn.classList.remove('is-party-launch');
    this.launchBtn.textContent = 'LAUNCH QUICK MATCH';
    this.launchBtn.disabled = this.isBusy() || this.launching;
    this.launchBtn.title = '';
  }

  private hasActiveParty(): boolean {
    return this.getPartySize() >= 2;
  }

  /** Host may launch only when every party member is back in lobby/menus. */
  private canHostLaunchParty(): boolean {
    if (!this.party?.isHost || this.getPartySize() < 2) return false;
    if (this.party.status === 'in_match') return false;
    // Server presence check is authoritative when the snapshot includes it.
    if (typeof this.party.allMembersInLobby === 'boolean') {
      return this.party.allMembersInLobby;
    }
    return this.getMembersNotInLobby().length === 0;
  }

  private getMembersNotInLobby(): Array<{ userId: string; username: string }> {
    if (!this.party) return [];
    if (this.party.allMembersInLobby === true) return [];
    const viewerUserId = this.party.viewerUserId;
    return this.party.members.filter((member) => {
      if (member.userId === viewerUserId) return false;
      const presence = this.getMemberPresence(member.userId);
      return !isInviteablePresence(presence);
    });
  }

  private getMyTeamId(): number {
    const viewerUserId = this.party?.viewerUserId;
    const me = this.party?.members.find((member) => member.userId === viewerUserId);
    return me && isValidPartyTeamId(me.teamId) ? me.teamId : 0;
  }

  private pickTeam(teamId: number): void {
    if (!this.hasActiveParty() || this.launching) return;
    if (this.getMyTeamId() === teamId) return;
    this.lobby.setPartyTeam(teamId);
  }

  private updateTeamPicker(show: boolean, blocked: boolean): void {
    this.teamPicker.hidden = !show;
    if (!show) return;

    const myTeamId = this.getMyTeamId();
    this.teamBlueBtn.classList.toggle('is-active', myTeamId === 0);
    this.teamOrangeBtn.classList.toggle('is-active', myTeamId === 1);
    this.teamBlueBtn.disabled = blocked;
    this.teamOrangeBtn.disabled = blocked;
  }

  private setListTab(tab: SocialListTab): void {
    if (tab === 'party' && !this.hasActiveParty()) return;
    this.activeListTab = tab;
    this.syncListTabs();
    this.refreshListPanel();
  }

  private syncListTabs(): void {
    const partyAvailable = this.hasActiveParty();
    if (!partyAvailable && this.activeListTab === 'party') {
      this.activeListTab = 'friends';
    }

    this.friendsTabBtn.classList.toggle('is-active', this.activeListTab === 'friends');
    this.partyTabBtn.classList.toggle('is-active', this.activeListTab === 'party');
    this.partyTabBtn.disabled = !partyAvailable;
    this.partyTabBtn.title = partyAvailable ? 'View party members' : 'Party members appear when someone joins';

    this.friendsSection.hidden = this.activeListTab !== 'friends';
    this.partyMembersSection.hidden = this.activeListTab !== 'party';
  }

  private refreshListPanel(): void {
    if (this.activeListTab === 'party') {
      this.renderPartyMembers();
    } else {
      this.renderFriends();
    }
  }

  private getMemberDisplayName(userId: string, username: string): string {
    return this.friends.find((friend) => friend.userId === userId)?.displayName ?? username;
  }

  private getMemberPresence(userId: string): FriendPresenceStatus {
    const fromSnapshot = this.party?.members.find((member) => member.userId === userId)?.presence;
    if (fromSnapshot) return fromSnapshot;
    const live = this.presenceByUserId.get(userId);
    if (live) return live;
    // Still waiting on a match return — don't flash offline for party mates.
    if (this.party?.status === 'in_match') return 'game';
    return 'offline';
  }

  private renderPartyMembers(): void {
    this.partyList.replaceChildren();

    if (!this.party || this.party.members.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'friends-empty';
      empty.textContent = 'No party members';
      this.partyList.appendChild(empty);
      return;
    }

    const members = [...this.party.members].sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.username.localeCompare(b.username);
    });

    for (const member of members) {
      this.partyList.appendChild(this.createPartyMemberItem(member));
    }

    if (this.party.isHost) {
      for (const userId of this.party.pendingInviteUserIds) {
        this.partyList.appendChild(this.createPendingPartyItem(userId));
      }
    }
  }

  private createPartyMemberItem(member: PartySnapshotMessage['members'][number]): HTMLElement {
    const item = document.createElement('li');
    item.className = 'friends-item';

    const identity = document.createElement('div');
    identity.className = 'friends-item-identity';

    const presence = this.getMemberPresence(member.userId);
    const row = document.createElement('div');
    row.className = 'friends-item-identity-row';

    const dot = document.createElement('span');
    dot.className = `friends-presence-dot friends-presence-dot--${presence}`;
    dot.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'friends-item-name';
    name.textContent = this.getMemberDisplayName(member.userId, member.username);

    row.append(dot, name);

    const status = document.createElement('span');
    status.className = `friends-presence-status friends-presence-status--${presence}`;
    // Host still shows role, but presence wins while they're away in a match.
    if (presence === 'game') {
      status.textContent = 'in game';
    } else if (member.isHost) {
      status.textContent = 'host';
    } else {
      status.textContent = this.presenceLabel(presence);
    }

    identity.append(row, status);

    const badges = document.createElement('div');
    badges.className = 'party-member-badges';

    const teamId = isValidPartyTeamId(member.teamId) ? member.teamId : 0;
    const team = document.createElement('span');
    team.className = 'party-member-team';
    team.textContent = TEAM_NAMES[teamId]!.toUpperCase();
    team.style.setProperty('--team-color', TEAM_COLORS[teamId]!);

    const role = document.createElement('span');
    role.className = `party-member-role${member.isHost ? ' party-member-role--host' : ''}`;
    role.textContent = member.isHost ? 'HOST' : 'MEMBER';

    badges.append(team, role);
    item.append(identity, badges);
    return item;
  }

  private createPendingPartyItem(userId: string): HTMLElement {
    const friend = this.friends.find((entry) => entry.userId === userId);
    const item = document.createElement('li');
    item.className = 'friends-item';

    const identity = document.createElement('div');
    identity.className = 'friends-item-identity';

    const row = document.createElement('div');
    row.className = 'friends-item-identity-row';

    const dot = document.createElement('span');
    dot.className = 'friends-presence-dot friends-presence-dot--menus';
    dot.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'friends-item-name';
    name.textContent = friend?.displayName ?? 'Invited player';

    row.append(dot, name);

    const status = document.createElement('span');
    status.className = 'friends-presence-status friends-presence-status--menus';
    status.textContent = 'invite pending';

    identity.append(row, status);

    const role = document.createElement('span');
    role.className = 'party-member-role party-member-role--pending';
    role.textContent = 'PENDING';

    item.append(identity, role);
    return item;
  }

  private applyPresenceUpdate(update: FriendPresenceUpdate): void {
    this.presenceByUserId.set(update.userId, update.presence);

    const friend = this.friends.find((entry) => entry.userId === update.userId);
    if (friend) {
      friend.online = update.online;
      friend.presence = update.presence;
    }

    this.refreshListPanel();
  }

  private getFriendPresence(userId: string): FriendPresenceStatus {
    return this.presenceByUserId.get(userId) ?? 'offline';
  }

  private presenceLabel(presence: FriendPresenceStatus): string {
    switch (presence) {
      case 'lobby':
        return 'in lobby';
      case 'menus':
        return 'in menus';
      case 'game':
        return 'in game';
      default:
        return 'offline';
    }
  }

  private renderFriends(): void {
    this.list.replaceChildren();
    const blockInvites = this.isInviteUiBlocked();

    if (this.friends.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'friends-empty';
      empty.textContent = 'No friends yet';
      this.list.appendChild(empty);
      return;
    }

    // Missing party snapshot = solo host (common during concurrent lobby boots).
    const isHost = this.party == null || this.party.isHost;
    const partyFull = this.getPartySize() >= MAX_PARTY_SIZE;

    for (const friend of this.friends) {
      const item = document.createElement('li');
      item.className = 'friends-item';

      const identity = document.createElement('div');
      identity.className = 'friends-item-identity';

      const presence = this.getFriendPresence(friend.userId);

      const row = document.createElement('div');
      row.className = 'friends-item-identity-row';

      const dot = document.createElement('span');
      dot.className = `friends-presence-dot friends-presence-dot--${presence}`;
      dot.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'friends-item-name';
      name.textContent = friend.displayName;
      name.title = friend.email;

      row.append(dot, name);

      const status = document.createElement('span');
      status.className = `friends-presence-status friends-presence-status--${presence}`;
      status.textContent = this.presenceLabel(presence);

      identity.append(row, status);

      const inviteBtn = document.createElement('button');
      inviteBtn.type = 'button';
      inviteBtn.className = 'friend-invite-btn';

      const inParty = this.isPartyMember(friend.userId);
      const pending = this.isPendingInvite(friend.userId);
      const cooldownUntil = this.inviteCooldownUntilByUserId.get(friend.userId) ?? 0;
      const onCooldown = cooldownUntil > Date.now();
      const canInvite =
        !blockInvites &&
        isHost &&
        !partyFull &&
        isInviteablePresence(presence) &&
        !inParty &&
        !onCooldown;

      if (inParty) {
        inviteBtn.textContent = 'IN PARTY';
        inviteBtn.disabled = true;
        inviteBtn.title = 'Friend is in your party';
      } else if (!isHost) {
        inviteBtn.textContent = 'INVITE';
        inviteBtn.disabled = true;
        inviteBtn.title = 'Only the party host can invite';
      } else {
        inviteBtn.textContent = pending ? 'REINVITE' : 'INVITE';
        inviteBtn.disabled = !canInvite;
        if (!canInvite && blockInvites) {
          inviteBtn.title = this.launching
            ? 'Match is starting'
            : 'Invite already sending…';
        } else if (!canInvite && onCooldown) {
          inviteBtn.title = 'Please wait a moment before re-inviting';
        } else if (!canInvite && presence === 'game') {
          inviteBtn.title = 'Friend is in a match';
        } else if (!canInvite && presence === 'offline') {
          inviteBtn.title = 'Friend is offline';
        } else if (!canInvite && partyFull) {
          inviteBtn.title = 'Party is full';
        } else if (pending) {
          inviteBtn.title = 'Send again (replaces the pending invite)';
        } else {
          inviteBtn.title = 'Invite to party';
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
