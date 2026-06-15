import { Room } from 'colyseus';
import { FpsState, PlayerState } from '../../../shared/schema/FpsState.js';

interface MoveMessage {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export class FpsRoom extends Room<{ state: FpsState }> {
  state = new FpsState();
  maxClients = 16;

  onCreate(): void {
    this.autoDispose = true;
    this.patchRate = 50;
  }

  messages = {
    move: (client, data: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      player.x = data.x;
      player.y = data.y;
      player.z = data.z;
      player.yaw = data.yaw;
      player.pitch = data.pitch;
    },
  };

  onJoin(client): void {
    const player = new PlayerState();
    player.x = (Math.random() - 0.5) * 4;
    player.y = 1.6;
    player.z = (Math.random() - 0.5) * 4;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client): void {
    this.state.players.delete(client.sessionId);
  }
}
