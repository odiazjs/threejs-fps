import { Client, Callbacks, type Room } from '@colyseus/sdk';
import type { KillFeedMessage, PlayerDamagedMessage } from '../../shared/network/damage';
import type { ProjectileSpawnMessage } from '../../shared/network/projectile';
import type { WeaponShotSoundMessage } from '../../shared/network/weaponShot';
import type { WeaponDropSpawnMessage } from '../../shared/network/weaponDrop';
import type { WeaponPickupGrantedMessage } from '../../shared/network/weaponPickup';
import type { ApplyLoadoutResultMessage } from '../../shared/network/applyLoadout';
import type { GrenadeDetonateRequest, GrenadeThrowRequest } from '../../shared/network/grenade';
import type { TeamPingMessage, TeamPingRequest } from '../../shared/network/ping';
import type { PickupGrenadeMessage } from '../../shared/network/grenadePickup';
import type { ShieldChargeSpawnMessage } from '../../shared/network/shieldDrop';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';
import { getShieldCapacity } from '../../shared/combat/shield';
import {
  FpsState,
  type AmmoBoxState,
  type PlayerState,
  type GrenadePickupState,
  type ShieldChargeState,
  type WeaponDropState,
} from '../../shared/schema/FpsState';
import { getServerUrl } from '../config/serverUrl';
import { DEFAULT_MAP_ID, isValidMapId, normalizeMapId, type MapId } from '../../shared/level/maps';
import {
  normalizeGameMode,
  normalizeMatchPhase,
  TDM_MATCH_DURATION_SEC,
} from '../../shared/combat/match';
import type { FpsJoinCredentials } from '../auth/joinCredentials';
import type { GameJoinIntent } from '../auth/gameJoin';
import type { WeaponId } from '../../shared/content/weaponIds';
import type { BodyPartId } from '../../shared/combat/bodyParts';
import type {
  AmmoBoxChangeHandler,
  AmmoBoxSnapshot,
  AmmoPickupGrantedHandler,
  GrenadeExplosionHandler,
  GrenadePickupChangeHandler,
  GrenadePickupGrantedHandler,
  GrenadePickupSnapshot,
  GrenadeThrownHandler,
  KillFeedHandler,
  LocalDamagedHandler,
  LocalPlayerChangeHandler,
  MatchSnapshot,
  PlayerAddHandler,
  PlayerChangeHandler,
  PlayerRemoveHandler,
  PlayerSnapshot,
  ProjectileSpawnHandler,
  ShieldChargeChangeHandler,
  ShieldChargeDropGrantedHandler,
  ShieldChargePickupGrantedHandler,
  ShieldChargeSnapshot,
  WeaponDropChangeHandler,
  WeaponDropSnapshot,
  WeaponPickupGrantedHandler,
  WeaponShotSoundHandler,
} from './types';

function toSnapshot(player: PlayerState): PlayerSnapshot {
  return {
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    username: player.username,
    selectedCharacterId: player.selectedCharacterId || 'basic',
    teamId: player.teamId,
    hp: player.hp,
    shieldLevel: player.shieldLevel,
    shieldPoints: player.shieldPoints,
    shieldCharges: player.shieldCharges,
    grenadeCount: player.grenadeCount,
    shieldRecharging: player.shieldRecharging,
    shieldRechargeEndAt: player.shieldRechargeEndAt,
    alive: player.alive,
    reloading: player.reloading,
    reloadEndAt: player.reloadEndAt,
    weaponSwitchEndAt: player.weaponSwitchEndAt,
    meleeAttackEndAt: player.meleeAttackEndAt,
    activeWeaponId: player.activeWeaponId,
    weaponSlot0: player.weaponSlot0,
    weaponSlot1: player.weaponSlot1,
    weaponSlot2: player.weaponSlot2,
    sprinting: player.sprinting,
    walking: player.walking,
    walkingBackward: player.walkingBackward,
    jumping: player.jumping,
    crouching: player.crouching,
    sliding: player.sliding === true,
    matchKills: player.matchKills ?? 0,
    shieldDomeChargeEndAt: player.shieldDomeChargeEndAt,
    shieldDomeEndAt: player.shieldDomeEndAt,
    shieldDomeCooldownEndAt: player.shieldDomeCooldownEndAt,
    shieldDomeCenterX: player.shieldDomeCenterX,
    shieldDomeCenterY: player.shieldDomeCenterY,
    shieldDomeCenterZ: player.shieldDomeCenterZ,
  };
}

function toAmmoBoxSnapshot(box: AmmoBoxState): AmmoBoxSnapshot {
  return {
    x: box.x,
    z: box.z,
    collected: box.collected,
  };
}

function toShieldChargeSnapshot(charge: ShieldChargeState): ShieldChargeSnapshot {
  return {
    x: charge.x,
    y: charge.y,
    z: charge.z,
    collected: charge.collected,
  };
}

function toGrenadePickupSnapshot(pickup: GrenadePickupState): GrenadePickupSnapshot {
  return {
    x: pickup.x,
    z: pickup.z,
    collected: pickup.collected,
    count: pickup.count,
  };
}

function toWeaponDropSnapshot(drop: WeaponDropState): WeaponDropSnapshot {
  return {
    x: drop.x,
    y: drop.y,
    z: drop.z,
    yaw: drop.yaw,
    weaponId: drop.weaponId,
    collected: drop.collected,
  };
}

export class RoomClient {
  private room: Room | null = null;
  private readonly boundAmmoBoxes = new Set<number>();
  private readonly boundShieldCharges = new Set<number>();
  private readonly boundGrenadePickups = new Set<number>();
  private readonly boundWeaponDrops = new Set<number>();
  private readonly boundPlayers = new Set<string>();
  private syncedWorldTime = 0;
  private worldTimeSyncAt = 0;
  private cachedMatchState: MatchSnapshot | null = null;

  private onAddHandlers: PlayerAddHandler[] = [];
  private onRemoveHandlers: PlayerRemoveHandler[] = [];
  private onChangeHandlers: PlayerChangeHandler[] = [];
  private onLocalChangeHandlers: LocalPlayerChangeHandler[] = [];
  private onProjectileHandlers: ProjectileSpawnHandler[] = [];
  private onWeaponShotSoundHandlers: WeaponShotSoundHandler[] = [];
  private onAmmoBoxChangeHandlers: AmmoBoxChangeHandler[] = [];
  private onAmmoPickupGrantedHandlers: AmmoPickupGrantedHandler[] = [];
  private onShieldChargeChangeHandlers: ShieldChargeChangeHandler[] = [];
  private onShieldChargePickupGrantedHandlers: ShieldChargePickupGrantedHandler[] = [];
  private onShieldChargeDropGrantedHandlers: ShieldChargeDropGrantedHandler[] = [];
  private onGrenadePickupChangeHandlers: GrenadePickupChangeHandler[] = [];
  private onGrenadePickupGrantedHandlers: GrenadePickupGrantedHandler[] = [];
  private onGrenadeThrownHandlers: GrenadeThrownHandler[] = [];
  private onGrenadeExplosionHandlers: GrenadeExplosionHandler[] = [];
  private onWeaponDropChangeHandlers: WeaponDropChangeHandler[] = [];
  private onWeaponPickupGrantedHandlers: WeaponPickupGrantedHandler[] = [];
  private onApplyLoadoutResultHandlers: Array<(data: ApplyLoadoutResultMessage) => void> = [];
  private onKillFeedHandlers: KillFeedHandler[] = [];
  private onLocalDamagedHandlers: LocalDamagedHandler[] = [];
  private onTeamPingHandlers: Array<(data: TeamPingMessage) => void> = [];

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get connected(): boolean {
    return this.room !== null;
  }

  getWorldTime(): number {
    if (!this.room) return 0;
    return this.syncedWorldTime + (performance.now() - this.worldTimeSyncAt) / 1000;
  }

  getFriendlyFire(): boolean {
    if (!this.room) return false;
    return (this.room.state as FpsState).friendlyFire === true;
  }

  getMapId(): MapId {
    if (!this.room) return DEFAULT_MAP_ID;
    return normalizeMapId((this.room.state as FpsState).mapId);
  }

  /** Returns null when the room has not synced a map id yet (e.g. older servers). */
  getMapIdIfSynced(): MapId | null {
    if (!this.room) return null;
    const raw = (this.room.state as FpsState).mapId;
    return isValidMapId(raw) ? raw : null;
  }

  getMatchState(): MatchSnapshot | null {
    if (!this.room) return null;
    if (this.cachedMatchState) return this.cachedMatchState;
    return this.buildMatchSnapshot();
  }

  private buildMatchSnapshot(): MatchSnapshot | null {
    if (!this.room) return null;
    const state = this.room.state as FpsState;
    const gameMode = normalizeGameMode(state.gameMode);
    const duration = state.matchDurationSec > 0 ? state.matchDurationSec : TDM_MATCH_DURATION_SEC;
    return {
      gameMode,
      phase: normalizeMatchPhase(state.matchPhase),
      expectedPlayers: state.expectedPlayers ?? 0,
      teamCount: Math.max(1, state.teamCount || (gameMode === 'tdm' ? 2 : 2)),
      teamScores: [
        state.teamScore0 ?? 0,
        state.teamScore1 ?? 0,
        state.teamScore2 ?? 0,
        state.teamScore3 ?? 0,
      ],
      matchCountdownEndAt: state.matchCountdownEndAt ?? 0,
      matchStartAt: state.matchStartAt ?? 0,
      matchEndAt: state.matchEndAt ?? 0,
      matchDurationSec: duration,
      winningTeamId: state.winningTeamId ?? -1,
    };
  }

  private refreshMatchCache(): void {
    this.cachedMatchState = this.buildMatchSnapshot();
  }

  async connect(
    credentials: FpsJoinCredentials,
    joinIntent?: GameJoinIntent | null,
    url = getServerUrl(),
  ): Promise<void> {
    const client = new Client(url);
    const joinOptions = {
      userId: credentials.userId,
      username: credentials.username,
    };
    if (joinIntent?.mode === 'join' && joinIntent.roomId) {
      const joinByIdOptions: Record<string, string | number> = { ...joinOptions };
      if (typeof joinIntent.teamId === 'number') {
        joinByIdOptions.teamId = joinIntent.teamId;
      }
      this.room = await this.joinByIdWithRetry(
        client,
        joinIntent.roomId,
        joinByIdOptions,
      );
    } else {
      // Always create so lobby map/mode selection is applied (joinOrCreate can
      // attach to an existing playground room and ignore create options).
      this.room = await this.createWithRetry(client, {
        ...joinOptions,
        mapId: normalizeMapId(joinIntent?.mapId),
        gameMode: joinIntent?.gameMode,
      });
    }
    this.bindProjectileMessages();
    this.bindWeaponShotMessages();
    this.bindAmmoPickupMessages();
    this.bindShieldChargePickupMessages();
    this.bindGrenadePickupMessages();
    this.bindGrenadeCombatMessages();
    this.bindWeaponDropMessages();
    this.bindApplyLoadoutMessages();
    this.bindKillMessages();
    this.bindDamagedMessages();
    this.bindTeamPingMessages();
  }

  private async joinByIdWithRetry(
    client: Client,
    roomId: string,
    options: Record<string, string | number>,
    attempts = 10,
  ): Promise<Room> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await client.joinById(roomId, options, FpsState);
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  private async createWithRetry(
    client: Client,
    options: Record<string, string | number>,
    attempts = 10,
  ): Promise<Room> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await client.create('fps', options, FpsState);
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  bindState(): void {
    if (!this.room) return;
    this.bindStateCallbacks();
  }

  onPlayerAdd(handler: PlayerAddHandler): void {
    this.onAddHandlers.push(handler);
  }

  onPlayerRemove(handler: PlayerRemoveHandler): void {
    this.onRemoveHandlers.push(handler);
  }

  onPlayerChange(handler: PlayerChangeHandler): void {
    this.onChangeHandlers.push(handler);
  }

  onLocalPlayerChange(handler: LocalPlayerChangeHandler): void {
    this.onLocalChangeHandlers.push(handler);
  }

  onProjectileSpawn(handler: ProjectileSpawnHandler): void {
    this.onProjectileHandlers.push(handler);
  }

  onWeaponShotSound(handler: WeaponShotSoundHandler): void {
    this.onWeaponShotSoundHandlers.push(handler);
  }

  onAmmoBoxChange(handler: AmmoBoxChangeHandler): void {
    this.onAmmoBoxChangeHandlers.push(handler);
  }

  onAmmoPickupGranted(handler: AmmoPickupGrantedHandler): void {
    this.onAmmoPickupGrantedHandlers.push(handler);
  }

  onShieldChargeChange(handler: ShieldChargeChangeHandler): void {
    this.onShieldChargeChangeHandlers.push(handler);
  }

  onShieldChargePickupGranted(handler: ShieldChargePickupGrantedHandler): void {
    this.onShieldChargePickupGrantedHandlers.push(handler);
  }

  onShieldChargeDropGranted(handler: ShieldChargeDropGrantedHandler): void {
    this.onShieldChargeDropGrantedHandlers.push(handler);
  }

  onGrenadePickupChange(handler: GrenadePickupChangeHandler): void {
    this.onGrenadePickupChangeHandlers.push(handler);
  }

  onGrenadePickupGranted(handler: GrenadePickupGrantedHandler): void {
    this.onGrenadePickupGrantedHandlers.push(handler);
  }

  onGrenadeThrown(handler: GrenadeThrownHandler): void {
    this.onGrenadeThrownHandlers.push(handler);
  }

  onGrenadeExplosion(handler: GrenadeExplosionHandler): void {
    this.onGrenadeExplosionHandlers.push(handler);
  }

  onWeaponDropChange(handler: WeaponDropChangeHandler): void {
    this.onWeaponDropChangeHandlers.push(handler);
  }

  onWeaponPickupGranted(handler: WeaponPickupGrantedHandler): void {
    this.onWeaponPickupGrantedHandlers.push(handler);
  }

  onApplyLoadoutResult(handler: (data: ApplyLoadoutResultMessage) => void): void {
    this.onApplyLoadoutResultHandlers.push(handler);
  }

  onKillFeed(handler: KillFeedHandler): void {
    this.onKillFeedHandlers.push(handler);
  }

  onLocalDamaged(handler: LocalDamagedHandler): void {
    this.onLocalDamagedHandlers.push(handler);
  }

  getLocalSnapshot(): PlayerSnapshot | null {
    if (!this.room) return null;

    const state = this.room.state as FpsState;
    const player = state.players?.get(this.room.sessionId) as PlayerState | undefined;
    return player ? toSnapshot(player) : null;
  }

  /** Alloc-free iteration over raw player schema state (hot-path friendly). */
  forEachPlayerState(callback: (sessionId: string, player: PlayerState) => void): void {
    if (!this.room) return;
    const state = this.room.state as FpsState;
    state.players?.forEach((player, sessionId) => {
      callback(sessionId, player as PlayerState);
    });
  }

  getAllPlayerSnapshots(): Array<PlayerSnapshot & { sessionId: string }> {
    if (!this.room) return [];

    const state = this.room.state as FpsState;
    if (!state.players) return [];

    const players: Array<PlayerSnapshot & { sessionId: string }> = [];
    state.players.forEach((player, sessionId) => {
      players.push({
        sessionId,
        ...toSnapshot(player as PlayerState),
      });
    });

    return players;
  }

  sendMove(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    sprinting: boolean,
    walking: boolean,
    walkingBackward: boolean,
    jumping: boolean,
    crouching: boolean,
    sliding: boolean,
  ): void {
    this.room?.send('move', {
      x,
      y,
      z,
      yaw,
      pitch,
      sprinting,
      walking,
      walkingBackward,
      jumping,
      crouching,
      sliding,
    });
  }

  sendShoot(spawn: ProjectileSpawnMessage): void {
    this.room?.send('shoot', spawn);
  }

  sendAutoFireStop(): void {
    this.room?.send('autoFireStop', {});
  }

  sendPickupAmmo(index: number, feetX: number, feetZ: number): void {
    this.room?.send('pickupAmmo', { index, x: feetX, z: feetZ });
  }

  sendPickupShieldCharge(index: number): void {
    this.room?.send('pickupShieldCharge', { index });
  }

  sendStartShieldRecharge(): void {
    this.room?.send('startShieldRecharge', {});
  }

  sendStartShieldDomeCharge(): void {
    this.room?.send('startShieldDomeCharge', {});
  }

  sendDropWeapon(slot: number): void {
    this.room?.send('dropWeapon', { slot });
  }

  sendDropShieldCharge(): void {
    this.room?.send('dropShieldCharge', {});
  }

  sendPickupWeaponDrop(index: number): void {
    this.room?.send('pickupWeaponDrop', { index });
  }

  sendHit(targetId: string, weaponId: WeaponId, bodyPart?: BodyPartId): void {
    this.room?.send('hit', { targetId, weaponId, bodyPart });
  }

  sendReload(weaponId: WeaponId, durationSec?: number): void {
    this.room?.send('reload', {
      weaponId,
      ...(durationSec !== undefined ? { durationSec } : {}),
    });
  }

  sendReloadStop(): void {
    this.room?.send('reloadStop', {});
  }

  sendSwitchWeapon(slot: number): void {
    this.room?.send('switchWeapon', { slot });
  }

  sendApplyLoadout(
    loadoutId: string,
    primaryWeaponId?: string,
    secondaryWeaponId?: string,
  ): void {
    this.room?.send('applyLoadout', {
      loadoutId,
      primaryWeaponId,
      secondaryWeaponId,
    });
  }

  sendEquipMelee(equipped: boolean): void {
    this.room?.send('equipMelee', { equipped });
  }

  sendMeleeAttack(): void {
    this.room?.send('meleeAttack', {});
  }

  sendTeamPing(data: TeamPingRequest): void {
    this.room?.send('teamPing', data);
  }

  sendThrowGrenade(data: GrenadeThrowRequest): void {
    this.room?.send('throwGrenade', data);
  }

  sendGrenadeDetonate(data: GrenadeDetonateRequest): void {
    this.room?.send('grenadeDetonate', data);
  }

  sendPickupGrenade(index: number, feetX: number, feetZ: number): void {
    const payload: PickupGrenadeMessage = { index, x: feetX, z: feetZ };
    this.room?.send('pickupGrenade', payload);
  }

  async disconnect(): Promise<void> {
    if (!this.room) return;

    const room = this.room;
    this.room = null;
    this.boundPlayers.clear();
    this.boundAmmoBoxes.clear();
    this.boundShieldCharges.clear();
    this.boundGrenadePickups.clear();
    this.boundWeaponDrops.clear();

    try {
      await Promise.race([
        room.leave(true),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (error) {
      console.warn('[RoomClient] consented leave failed', error);
      try {
        await Promise.race([
          room.leave(false),
          new Promise<void>((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch (fallbackError) {
        console.warn('[RoomClient] forced leave failed', fallbackError);
      }
    }
  }

  private bindProjectileMessages(): void {
    this.room?.onMessage('projectile', (data: ProjectileSpawnMessage) => {
      this.onProjectileHandlers.forEach((handler) => handler(data));
    });
  }

  private bindWeaponShotMessages(): void {
    this.room?.onMessage('weaponShot', (data: WeaponShotSoundMessage) => {
      this.onWeaponShotSoundHandlers.forEach((handler) => handler(data));
    });
  }

  private bindAmmoPickupMessages(): void {
    this.room?.onMessage('ammoPickupGranted', () => {
      this.onAmmoPickupGrantedHandlers.forEach((handler) => handler());
    });
  }

  private bindShieldChargePickupMessages(): void {
    this.room?.onMessage('shieldChargePickupGranted', () => {
      this.onShieldChargePickupGrantedHandlers.forEach((handler) => handler());
    });

    this.room?.onMessage('shieldChargeDropGranted', (data: { index: number }) => {
      this.onShieldChargeDropGrantedHandlers.forEach((handler) => handler(data));
    });

    this.room?.onMessage('shieldChargeSpawn', (data: ShieldChargeSpawnMessage) => {
      this.onShieldChargeChangeHandlers.forEach((handler) =>
        handler(data.index, {
          x: data.x,
          y: data.y,
          z: data.z,
          collected: false,
        }),
      );
    });
  }

  private bindWeaponDropMessages(): void {
    this.room?.onMessage('weaponDrop', (data: WeaponDropSpawnMessage) => {
      this.onWeaponDropChangeHandlers.forEach((handler) =>
        handler(data.index, {
          x: data.x,
          y: data.y,
          z: data.z,
          yaw: data.yaw,
          weaponId: data.weaponId,
          collected: false,
        }),
      );
    });

    this.room?.onMessage('weaponPickupGranted', (data: WeaponPickupGrantedMessage) => {
      this.onWeaponPickupGrantedHandlers.forEach((handler) => handler(data));
    });
  }

  private bindApplyLoadoutMessages(): void {
    this.room?.onMessage('applyLoadoutResult', (data: ApplyLoadoutResultMessage) => {
      this.onApplyLoadoutResultHandlers.forEach((handler) => handler(data));
    });
  }

  private bindKillMessages(): void {
    this.room?.onMessage('kill', (data: KillFeedMessage) => {
      this.onKillFeedHandlers.forEach((handler) =>
        handler(data.killerId, data.killerName, data.victimName),
      );
    });
  }

  private bindDamagedMessages(): void {
    this.room?.onMessage('damaged', (data: PlayerDamagedMessage) => {
      this.onLocalDamagedHandlers.forEach((handler) => handler(data));
    });
  }

  onTeamPing(handler: (data: TeamPingMessage) => void): void {
    this.onTeamPingHandlers.push(handler);
  }

  private bindTeamPingMessages(): void {
    this.room?.onMessage('teamPing', (data: TeamPingMessage) => {
      this.onTeamPingHandlers.forEach((handler) => handler(data));
    });
  }

  private bindGrenadePickupMessages(): void {
    this.room?.onMessage('grenadePickupGranted', (data: { index: number; count: number }) => {
      this.onGrenadePickupGrantedHandlers.forEach((handler) => handler(data));
    });
  }

  private bindGrenadeCombatMessages(): void {
    this.room?.onMessage('grenadeThrown', (data) => {
      this.onGrenadeThrownHandlers.forEach((handler) => handler(data));
    });

    this.room?.onMessage('grenadeExplosion', (data) => {
      this.onGrenadeExplosionHandlers.forEach((handler) => handler(data));
    });
  }

  private bindStateCallbacks(): void {
    if (!this.room) return;

    const callbacks = Callbacks.get(this.room);
    const myId = this.room.sessionId;
    const state = this.room.state as FpsState;

    this.syncWorldTime(state.worldTime);
    this.refreshMatchCache();
    callbacks.onChange(state, () => {
      this.syncWorldTime(state.worldTime);
      this.refreshMatchCache();
    });

    callbacks.onAdd('players', (player, sessionId) => {
      this.bindPlayerCallbacks(
        callbacks,
        sessionId as string,
        player as PlayerState,
        myId,
      );
    });

    state.players.forEach((player, sessionId) => {
      this.bindPlayerCallbacks(
        callbacks,
        sessionId as string,
        player as PlayerState,
        myId,
      );
    });

    callbacks.onRemove('players', (_player, sessionId) => {
      this.boundPlayers.delete(sessionId as string);
      this.onRemoveHandlers.forEach((handler) => handler(sessionId as string));
    });

    callbacks.onAdd('ammoBoxes', (box, index) => {
      this.bindAmmoBoxCallbacks(callbacks, index as number, box as AmmoBoxState);
    });

    state.ammoBoxes?.forEach((box, index) => {
      this.bindAmmoBoxCallbacks(callbacks, index as number, box as AmmoBoxState);
    });

    callbacks.onAdd('shieldCharges', (charge, index) => {
      this.bindShieldChargeCallbacks(
        callbacks,
        index as number,
        charge as ShieldChargeState,
      );
    });

    state.shieldCharges?.forEach((charge, index) => {
      this.bindShieldChargeCallbacks(
        callbacks,
        index as number,
        charge as ShieldChargeState,
      );
    });

    callbacks.onAdd('grenadePickups', (pickup, index) => {
      this.bindGrenadePickupCallbacks(
        callbacks,
        index as number,
        pickup as GrenadePickupState,
      );
    });

    state.grenadePickups?.forEach((pickup, index) => {
      this.bindGrenadePickupCallbacks(
        callbacks,
        index as number,
        pickup as GrenadePickupState,
      );
    });

    callbacks.onAdd('weaponDrops', (drop, index) => {
      this.bindWeaponDropCallbacks(
        callbacks,
        index as number,
        drop as WeaponDropState,
      );
    });

    state.weaponDrops?.forEach((drop, index) => {
      this.bindWeaponDropCallbacks(
        callbacks,
        index as number,
        drop as WeaponDropState,
      );
    });
  }

  private bindPlayerCallbacks(
    callbacks: ReturnType<typeof Callbacks.get>,
    sessionId: string,
    player: PlayerState,
    myId: string,
  ): void {
    if (this.boundPlayers.has(sessionId)) return;
    this.boundPlayers.add(sessionId);

    if (sessionId === myId) {
      this.onLocalChangeHandlers.forEach((handler) =>
        handler(toSnapshot(player)),
      );
      callbacks.onChange(player, () => {
        this.onLocalChangeHandlers.forEach((handler) =>
          handler(toSnapshot(player)),
        );
      });
      return;
    }

    this.onAddHandlers.forEach((handler) =>
      handler(sessionId, toSnapshot(player)),
    );
    callbacks.onChange(player, () => {
      this.onChangeHandlers.forEach((handler) =>
        handler(sessionId, toSnapshot(player)),
      );
    });
  }

  private syncWorldTime(worldTime: number): void {
    this.syncedWorldTime = worldTime;
    this.worldTimeSyncAt = performance.now();
  }

  private bindAmmoBoxCallbacks(
    callbacks: ReturnType<typeof Callbacks.get>,
    index: number,
    box: AmmoBoxState,
  ): void {
    if (this.boundAmmoBoxes.has(index)) return;
    this.boundAmmoBoxes.add(index);

    this.onAmmoBoxChangeHandlers.forEach((handler) =>
      handler(index, toAmmoBoxSnapshot(box)),
    );

    callbacks.onChange(box, () => {
      this.onAmmoBoxChangeHandlers.forEach((handler) =>
        handler(index, toAmmoBoxSnapshot(box)),
      );
    });
  }

  private bindShieldChargeCallbacks(
    callbacks: ReturnType<typeof Callbacks.get>,
    index: number,
    charge: ShieldChargeState,
  ): void {
    if (this.boundShieldCharges.has(index)) return;
    this.boundShieldCharges.add(index);

    this.onShieldChargeChangeHandlers.forEach((handler) =>
      handler(index, toShieldChargeSnapshot(charge)),
    );

    callbacks.onChange(charge, () => {
      this.onShieldChargeChangeHandlers.forEach((handler) =>
        handler(index, toShieldChargeSnapshot(charge)),
      );
    });
  }

  private bindGrenadePickupCallbacks(
    callbacks: ReturnType<typeof Callbacks.get>,
    index: number,
    pickup: GrenadePickupState,
  ): void {
    if (this.boundGrenadePickups.has(index)) return;
    this.boundGrenadePickups.add(index);

    this.onGrenadePickupChangeHandlers.forEach((handler) =>
      handler(index, toGrenadePickupSnapshot(pickup)),
    );

    callbacks.onChange(pickup, () => {
      this.onGrenadePickupChangeHandlers.forEach((handler) =>
        handler(index, toGrenadePickupSnapshot(pickup)),
      );
    });
  }

  private bindWeaponDropCallbacks(
    callbacks: ReturnType<typeof Callbacks.get>,
    index: number,
    drop: WeaponDropState,
  ): void {
    if (this.boundWeaponDrops.has(index)) return;
    this.boundWeaponDrops.add(index);

    this.onWeaponDropChangeHandlers.forEach((handler) =>
      handler(index, toWeaponDropSnapshot(drop)),
    );

    callbacks.onChange(drop, () => {
      this.onWeaponDropChangeHandlers.forEach((handler) =>
        handler(index, toWeaponDropSnapshot(drop)),
      );
    });
  }
}

export { PLAYER_MAX_HP };
