import { Client, Callbacks, type Room } from '@colyseus/sdk';
import type { ProjectileSpawnMessage } from '../../shared/network/projectile';
import {
  FpsState,
  type AmmoBoxState,
  type PlayerState,
} from '../../shared/schema/FpsState';
import { SERVER_URL } from '../config/serverUrl';
import type {
  AmmoBoxChangeHandler,
  AmmoBoxSnapshot,
  AmmoPickupGrantedHandler,
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

  private onAddHandlers: PlayerAddHandler[] = [];
  private onRemoveHandlers: PlayerRemoveHandler[] = [];
  private onChangeHandlers: PlayerChangeHandler[] = [];
  private onProjectileHandlers: ProjectileSpawnHandler[] = [];
  private onAmmoBoxChangeHandlers: AmmoBoxChangeHandler[] = [];
  private onAmmoPickupGrantedHandlers: AmmoPickupGrantedHandler[] = [];

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get connected(): boolean {
    return this.room !== null;
  }

  async connect(url = SERVER_URL): Promise<void> {
    const client = new Client(url);
    this.room = await client.joinOrCreate('fps', {}, FpsState);
    this.bindProjectileMessages();
    this.bindAmmoPickupMessages();
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

  onProjectileSpawn(handler: ProjectileSpawnHandler): void {
    this.onProjectileHandlers.push(handler);
  }

  onAmmoBoxChange(handler: AmmoBoxChangeHandler): void {
    this.onAmmoBoxChangeHandlers.push(handler);
  }

  onAmmoPickupGranted(handler: AmmoPickupGrantedHandler): void {
    this.onAmmoPickupGrantedHandlers.push(handler);
  }

  getLocalSnapshot(): PlayerSnapshot | null {
    if (!this.room) return null;

    const player = this.room.state.players.get(this.room.sessionId) as PlayerState | undefined;
    return player ? toSnapshot(player) : null;
  }

  sendMove(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.room?.send('move', { x, y, z, yaw, pitch });
  }

  sendShoot(spawn: ProjectileSpawnMessage): void {
    this.room?.send('shoot', spawn);
  }

  sendPickupAmmo(index: number, feetX: number, feetZ: number): void {
    this.room?.send('pickupAmmo', { index, x: feetX, z: feetZ });
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

  private bindStateCallbacks(): void {
    if (!this.room) return;

    const callbacks = Callbacks.get(this.room);

    const myId = this.room.sessionId;

    callbacks.onAdd('players', (player, sessionId) => {
      const id = sessionId as string;
      if (id === myId) return;

      const schemaPlayer = player as PlayerState;
      this.onAddHandlers.forEach((handler) => handler(id, toSnapshot(schemaPlayer)));

      callbacks.onChange(schemaPlayer, () => {
        this.onChangeHandlers.forEach((handler) => handler(id, toSnapshot(schemaPlayer)));
      });
    });

    callbacks.onRemove('players', (_player, sessionId) => {
      this.onRemoveHandlers.forEach((handler) => handler(sessionId as string));
    });

    const state = this.room.state as FpsState;
    state.ammoBoxes.forEach((box, index) => {
      this.bindAmmoBoxCallbacks(callbacks, index, box as AmmoBoxState);
    });

    callbacks.onAdd('ammoBoxes', (box, index) => {
      this.bindAmmoBoxCallbacks(callbacks, index as number, box as AmmoBoxState);
    });
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
