import { Client, Room } from 'colyseus';
import { AMMO_BOX_POSITIONS, overlapsAmmoBox } from '../../../shared/level/ammoBoxSpawns.js';
import { clampEyeY, movePlayer } from '../../../shared/level/collision.js';
import { EYE_HEIGHT, PLAYER_HALF_WIDTH } from '../../../shared/level/levelData.js';
import { pickSpawnPoint } from '../../../shared/level/kiloSectorColliders.js';
import {
  MAX_HIT_DISTANCE,
  PLASMA_RIFLE_DAMAGE,
  PLAYER_MAX_HP,
  RESPAWN_DELAY_SEC,
} from '../../../shared/combat/damage.js';
import { isValidTeamId } from '../../../shared/combat/teams.js';
import type { KillFeedMessage, PlayerHitMessage } from '../../../shared/network/damage.js';
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

interface JoinOptions {
  username?: string;
  teamId?: number;
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
      if (!player?.alive) return;

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
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      this.broadcast('projectile', data, { except: client });
    },

    pickupAmmo: (client: Client, data: PickupAmmoMessage) => {
      const index = data.index;
      if (index < 0 || index >= this.state.ammoBoxes.length) return;

      const box = this.state.ammoBoxes.at(index);
      if (!box || box.collected) return;

      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;

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

    hit: (client: Client, data: PlayerHitMessage) => {
      const shooter = this.state.players.get(client.sessionId);
      const target = this.state.players.get(data.targetId);
      if (!shooter?.alive || !target?.alive) return;
      if (shooter.teamId === target.teamId) return;

      const distance = Math.hypot(shooter.x - target.x, shooter.z - target.z);
      if (distance > MAX_HIT_DISTANCE) return;

      target.hp = Math.max(0, target.hp - PLASMA_RIFLE_DAMAGE);
      if (target.hp > 0) return;

      target.hp = 0;
      target.alive = false;

      const killFeed: KillFeedMessage = {
        killerName: shooter.username,
        victimName: target.username,
      };
      this.broadcast('kill', killFeed);

      const targetId = data.targetId;
      this.clock.setTimeout(() => {
        this.respawnPlayer(targetId);
      }, RESPAWN_DELAY_SEC * 1000);
    },
  };

  onJoin(client: Client, options: JoinOptions): void {
    const player = new PlayerState();
    const spawn = pickSpawnPoint(this.state.players.size);
    const username = this.sanitizeUsername(options.username);

    player.username = username;
    player.teamId = this.resolveTeamId(options.teamId);
    player.hp = PLAYER_MAX_HP;
    player.alive = true;
    player.x = spawn.x;
    player.y = EYE_HEIGHT;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  private sanitizeUsername(raw?: string): string {
    const trimmed = raw?.trim().slice(0, 16);
    return trimmed && trimmed.length > 0 ? trimmed : 'Player';
  }

  private resolveTeamId(requested?: number): number {
    const team = Number(requested);
    if (Number.isFinite(team) && isValidTeamId(team)) {
      return team;
    }
    return this.pickBalancedTeam();
  }

  private pickBalancedTeam(): number {
    let team0 = 0;
    let team1 = 0;

    for (const player of this.state.players.values()) {
      if (player.teamId === 0) team0 += 1;
      else team1 += 1;
    }

    return team0 <= team1 ? 0 : 1;
  }

  private respawnPlayer(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    const spawn = pickSpawnPoint(this.state.players.size);
    player.hp = PLAYER_MAX_HP;
    player.alive = true;
    player.x = spawn.x;
    player.y = EYE_HEIGHT;
    player.z = spawn.z;
    player.yaw = 0;
    player.pitch = 0;
  }
}
