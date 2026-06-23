import { Client, Room } from 'colyseus';
import { AMMO_BOX_POSITIONS, overlapsAmmoBox } from '../../../shared/level/ammoBoxSpawns.js';
import { clampEyeY, movePlayer } from '../../../shared/level/collision.js';
import { EYE_HEIGHT, PLAYER_HALF_WIDTH } from '../../../shared/level/levelData.js';
import { pickSpawnPoint } from '../../../shared/level/kiloSectorColliders.js';
import {
  PICKUP_MAX_DESYNC,
  type PickupAmmoMessage,
} from '../../../shared/network/pickup.js';
import type { ProjectileSpawnMessage } from '../../../shared/network/projectile.js';
import { AmmoBoxState, FpsState, PlayerState } from '../../../shared/schema/FpsState.js';

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

    for (const pos of AMMO_BOX_POSITIONS) {
      const box = new AmmoBoxState();
      box.x = pos.x;
      box.z = pos.z;
      this.state.ammoBoxes.push(box);
    }
  }

  messages = {
    move: (client: Client, data: MoveMessage) => {
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

    shoot: (client: Client, data: ProjectileSpawnMessage) => {
      if (!this.state.players.has(client.sessionId)) return;
      this.broadcast('projectile', data, { except: client });
    },

    pickupAmmo: (client: Client, data: PickupAmmoMessage) => {
      const index = data.index;
      if (index < 0 || index >= this.state.ammoBoxes.length) return;

      const box = this.state.ammoBoxes.at(index);
      if (!box || box.collected) return;

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const serverOverlap = overlapsAmmoBox(
        player.x,
        player.z,
        box.x,
        box.z,
        PLAYER_HALF_WIDTH,
      );

      if (!serverOverlap) {
        const desync = Math.hypot(data.x - player.x, data.z - player.z);
        if (desync > PICKUP_MAX_DESYNC) return;

        if (
          !overlapsAmmoBox(
            data.x,
            data.z,
            box.x,
            box.z,
            PLAYER_HALF_WIDTH,
          )
        ) {
          return;
        }
      }

      box.collected = true;
      client.send('ammoPickupGranted', { index });
    },
  };

  onJoin(client: Client): void {
    const player = new PlayerState();
    const spawn = pickSpawnPoint(this.state.players.size);

    player.x = spawn.x;
    player.y = EYE_HEIGHT;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }
}
