import { Room } from 'colyseus';
import { clampEyeY, movePlayer } from '../../../shared/level/collision.js';
import { EYE_HEIGHT } from '../../../shared/level/levelData.js';
import { pickSpawnPoint } from '../../../shared/level/kiloSectorColliders.js';
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
  maxClients = 8;

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
      player.z = resolved.z;
      player.y = clampEyeY(resolved.x, resolved.z, data.y);
      player.yaw = data.yaw;
      player.pitch = data.pitch;
    },
  };

  onJoin(client): void {
    const player = new PlayerState();
    const spawn = pickSpawnPoint(this.state.players.size);

    player.x = spawn.x;
    player.y = EYE_HEIGHT;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client): void {
    this.state.players.delete(client.sessionId);
  }
}
