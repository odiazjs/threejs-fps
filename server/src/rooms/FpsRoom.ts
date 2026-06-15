import { Room } from 'colyseus';
import { movePlayer } from '../../../shared/level/collision.js';
import { EYE_HEIGHT } from '../../../shared/level/levelData.js';
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

      const feetY = player.y - EYE_HEIGHT;
      const deltaX = data.x - player.x;
      const deltaZ = data.z - player.z;
      const resolved = movePlayer(player.x, feetY, player.z, deltaX, deltaZ);

      player.x = resolved.x;
      player.y = resolved.y + EYE_HEIGHT;
      player.z = resolved.z;
      player.yaw = data.yaw;
      player.pitch = data.pitch;
    },
  };

  onJoin(client): void {
    const player = new PlayerState();
    player.x = (Math.random() - 0.5) * 4;
    player.y = EYE_HEIGHT;
    player.z = (Math.random() - 0.5) * 4;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client): void {
    this.state.players.delete(client.sessionId);
  }
}
