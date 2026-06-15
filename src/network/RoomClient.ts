import { Client, Callbacks, type Room } from '@colyseus/sdk';
import { FpsState, type PlayerState } from '../../shared/schema/FpsState';
import type {
  PlayerAddHandler,
  PlayerChangeHandler,
  PlayerRemoveHandler,
  PlayerSnapshot,
} from './types';

const DEFAULT_URL = 'http://localhost:4001';

function toSnapshot(player: PlayerState): PlayerSnapshot {
  return {
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
  };
}

export class RoomClient {
  private room: Room | null = null;

  private onAddHandlers: PlayerAddHandler[] = [];
  private onRemoveHandlers: PlayerRemoveHandler[] = [];
  private onChangeHandlers: PlayerChangeHandler[] = [];

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get connected(): boolean {
    return this.room !== null;
  }

  async connect(url = import.meta.env.VITE_COLYSEUS_URL ?? DEFAULT_URL): Promise<void> {
    const client = new Client(url);
    this.room = await client.joinOrCreate('fps', {}, FpsState);
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

  sendMove(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.room?.send('move', { x, y, z, yaw, pitch });
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
  }
}
