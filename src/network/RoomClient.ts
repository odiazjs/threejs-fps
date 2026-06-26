import { Client, Callbacks, type Room } from '@colyseus/sdk';
import type { KillFeedMessage } from '../../shared/network/damage';
import type { ProjectileSpawnMessage } from '../../shared/network/projectile';
import { PLAYER_MAX_HP } from '../../shared/combat/damage';
import {
  FpsState,
  type AmmoBoxState,
  type PlayerState,
} from '../../shared/schema/FpsState';
import { SERVER_URL } from '../config/serverUrl';
import type { WeaponId } from '../../shared/content/weaponIds';
import type { GameJoinIntent } from '../auth/gameJoin';
import type {
  AmmoBoxChangeHandler,
  AmmoBoxSnapshot,
  AmmoPickupGrantedHandler,
  KillFeedHandler,
  LocalPlayerChangeHandler,
  PlayerAddHandler,
  PlayerChangeHandler,
  PlayerRemoveHandler,
  PlayerSnapshot,
  ProjectileSpawnHandler,
} from './types';

function toSnapshot(player: PlayerState): PlayerSnapshot {
  return {
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    username: player.username,
    teamId: player.teamId,
    hp: player.hp,
    alive: player.alive,
    reloading: player.reloading,
    reloadEndAt: player.reloadEndAt,
    activeWeaponId: player.activeWeaponId,
    sprinting: player.sprinting,
    walking: player.walking,
    jumping: player.jumping,
  };
}

function toAmmoBoxSnapshot(box: AmmoBoxState): AmmoBoxSnapshot {
  return {
    x: box.x,
    z: box.z,
    collected: box.collected,
  };
}

export class RoomClient {
  private room: Room | null = null;
  private readonly boundAmmoBoxes = new Set<number>();
  private readonly boundPlayers = new Set<string>();
  private syncedWorldTime = 0;
  private worldTimeSyncAt = 0;

  private onAddHandlers: PlayerAddHandler[] = [];
  private onRemoveHandlers: PlayerRemoveHandler[] = [];
  private onChangeHandlers: PlayerChangeHandler[] = [];
  private onLocalChangeHandlers: LocalPlayerChangeHandler[] = [];
  private onProjectileHandlers: ProjectileSpawnHandler[] = [];
  private onAmmoBoxChangeHandlers: AmmoBoxChangeHandler[] = [];
  private onAmmoPickupGrantedHandlers: AmmoPickupGrantedHandler[] = [];
  private onKillFeedHandlers: KillFeedHandler[] = [];

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

  async connect(
    username: string,
    joinIntent?: GameJoinIntent | null,
    url = SERVER_URL,
  ): Promise<void> {
    const client = new Client(url);
    if (joinIntent?.mode === 'join' && joinIntent.roomId) {
      this.room = await this.joinByIdWithRetry(
        client,
        joinIntent.roomId,
        { username, teamId: joinIntent.teamId },
      );
    } else {
      this.room = await client.joinOrCreate('fps', { username }, FpsState);
    }
    this.bindProjectileMessages();
    this.bindAmmoPickupMessages();
    this.bindKillMessages();
  }

  private async joinByIdWithRetry(
    client: Client,
    roomId: string,
    options: { username: string; teamId: number },
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

  onAmmoBoxChange(handler: AmmoBoxChangeHandler): void {
    this.onAmmoBoxChangeHandlers.push(handler);
  }

  onAmmoPickupGranted(handler: AmmoPickupGrantedHandler): void {
    this.onAmmoPickupGrantedHandlers.push(handler);
  }

  onKillFeed(handler: KillFeedHandler): void {
    this.onKillFeedHandlers.push(handler);
  }

  getLocalSnapshot(): PlayerSnapshot | null {
    if (!this.room) return null;

    const state = this.room.state as FpsState;
    const player = state.players?.get(this.room.sessionId) as PlayerState | undefined;
    return player ? toSnapshot(player) : null;
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
    jumping: boolean,
  ): void {
    this.room?.send('move', { x, y, z, yaw, pitch, sprinting, walking, jumping });
  }

  sendShoot(spawn: ProjectileSpawnMessage): void {
    this.room?.send('shoot', spawn);
  }

  sendPickupAmmo(index: number, feetX: number, feetZ: number): void {
    this.room?.send('pickupAmmo', { index, x: feetX, z: feetZ });
  }

  sendHit(targetId: string, weaponId: WeaponId): void {
    this.room?.send('hit', { targetId, weaponId });
  }

  sendReload(weaponId: WeaponId): void {
    this.room?.send('reload', { weaponId });
  }

  sendSwitchWeapon(slot: number): void {
    this.room?.send('switchWeapon', { slot });
  }

  async disconnect(): Promise<void> {
    if (!this.room) return;

    const room = this.room;
    this.room = null;
    this.boundPlayers.clear();
    this.boundAmmoBoxes.clear();

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

  private bindAmmoPickupMessages(): void {
    this.room?.onMessage('ammoPickupGranted', () => {
      this.onAmmoPickupGrantedHandlers.forEach((handler) => handler());
    });
  }

  private bindKillMessages(): void {
    this.room?.onMessage('kill', (data: KillFeedMessage) => {
      this.onKillFeedHandlers.forEach((handler) =>
        handler(data.killerName, data.victimName),
      );
    });
  }

  private bindStateCallbacks(): void {
    if (!this.room) return;

    const callbacks = Callbacks.get(this.room);
    const myId = this.room.sessionId;
    const state = this.room.state as FpsState;

    this.syncWorldTime(state.worldTime);
    callbacks.onChange(state, () => {
      this.syncWorldTime(state.worldTime);
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
}

export { PLAYER_MAX_HP };
