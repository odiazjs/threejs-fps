import { Client, Room } from 'colyseus';
import { AMMO_BOX_POSITIONS, overlapsAmmoBox } from '../../../shared/level/ammoBoxSpawns.js';
import { clampEyeY, movePlayer, resolveMoveFeetY, stepPlayerPhysics, type PlayerPhysicsState } from '../../../shared/level/collision.js';
import { EYE_HEIGHT, PLAYER_HALF_WIDTH } from '../../../shared/level/levelData.js';
import { pickSpawnPoint } from '../../../shared/level/kiloSectorColliders.js';
import {
  PLAYER_MAX_HP,
  RESPAWN_DELAY_SEC,
} from '../../../shared/combat/damage.js';
import { isValidTeamId } from '../../../shared/combat/teams.js';
import {
  isTrainingBotSessionId,
  TRAINING_BOT_SPAWNS,
  TRAINING_BOT_TEAM_ID,
  trainingBotSessionId,
  trainingBotSpawnEyeY,
  trainingBotUsername,
} from '../../../shared/combat/trainingBots.js';
import {
  computeTrainingBotMoveDelta,
  createTrainingBotMoveState,
  updateTrainingBotMoveState,
  type TrainingBotMoveState,
} from '../../../shared/combat/trainingBotMovement.js';
import {
  getWeaponDamage,
  getWeaponMaxHitDistance,
  getWeaponReloadSec,
} from '../../../shared/content/weaponStats.js';
import {
  isWeaponId,
  LOADOUT_WEAPON_IDS,
} from '../../../shared/content/weaponIds.js';
import type { KillFeedMessage, PlayerHitMessage } from '../../../shared/network/damage.js';
import type { ReloadMessage } from '../../../shared/network/reload.js';
import type { SwitchWeaponMessage } from '../../../shared/network/weapon.js';
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
  sprinting?: boolean;
  walking?: boolean;
  jumping?: boolean;
}

interface JoinOptions {
  username?: string;
  teamId?: number;
  inviteMatch?: boolean;
}

export class FpsRoom extends Room<{ state: FpsState }> {
  state = new FpsState();
  maxClients = 8;
  private inviteMatch = false;
  private emptyDisposeTimer?: ReturnType<Room['clock']['setTimeout']>;
  private readonly botSpawns = new Map<string, { x: number; z: number; yaw: number }>();
  private readonly botPhysics = new Map<string, PlayerPhysicsState>();
  private readonly botMoveState = new Map<string, TrainingBotMoveState>();

  onCreate(options: JoinOptions = {}): void {
    this.inviteMatch = options.inviteMatch === true;
    this.autoDispose = !this.inviteMatch;
    this.maxClients = this.inviteMatch ? 2 : 8;
    this.patchRate = 50;

    for (const pos of AMMO_BOX_POSITIONS) {
      const box = new AmmoBoxState();
      box.x = pos.x;
      box.z = pos.z;
      this.state.ammoBoxes.push(box);
    }

    this.spawnTrainingBots();

    this.setSimulationInterval((deltaTime) => {
      const deltaSec = deltaTime / 1000;
      this.state.worldTime += deltaSec;
      this.tickReloads();
      this.tickTrainingBots(deltaSec);
    });
  }

  private tickReloads(): void {
    const now = this.state.worldTime;
    for (const player of this.state.players.values()) {
      if (!player.reloading) continue;
      if (now < player.reloadEndAt) continue;
      player.reloading = false;
      player.reloadEndAt = 0;
    }
  }

  private tickTrainingBots(deltaSec: number): void {
    const worldTime = this.state.worldTime;

    for (const [sessionId, player] of this.state.players.entries()) {
      if (!isTrainingBotSessionId(sessionId) || !player.alive) continue;

      const spawn = this.botSpawns.get(sessionId);
      if (!spawn) continue;

      let moveState = this.botMoveState.get(sessionId);
      if (!moveState) {
        moveState = createTrainingBotMoveState(spawn.yaw, worldTime);
        this.botMoveState.set(sessionId, moveState);
      }

      moveState = updateTrainingBotMoveState(
        moveState,
        spawn.x,
        spawn.z,
        player.x,
        player.z,
        worldTime,
      );

      const physics = this.botPhysics.get(sessionId) ?? {
        verticalVelocity: 0,
        grounded: false,
      };
      const jump = moveState.jumpQueued && physics.grounded;
      if (jump) {
        moveState = { ...moveState, jumpQueued: false };
      }

      const { deltaX, deltaZ } = computeTrainingBotMoveDelta(moveState, deltaSec);
      const feetY = player.y - EYE_HEIGHT;
      const result = stepPlayerPhysics(
        player.x,
        feetY,
        player.z,
        physics,
        deltaX,
        deltaZ,
        jump,
        deltaSec,
      );

      player.x = result.x;
      player.y = result.y + EYE_HEIGHT;
      player.z = result.z;
      if (moveState.moving) {
        player.yaw = moveState.moveYaw;
      }
      player.jumping = !result.state.grounded;
      player.sprinting =
        moveState.moving && moveState.sprinting && result.state.grounded;
      player.walking =
        moveState.moving && !moveState.sprinting && result.state.grounded;

      this.botPhysics.set(sessionId, result.state);
      this.botMoveState.set(sessionId, moveState);
    }
  }

  private placeTrainingBot(
    sessionId: string,
    player: PlayerState,
    spawn: { x: number; z: number; yaw: number },
  ): void {
    player.x = spawn.x;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    player.y = trainingBotSpawnEyeY(spawn.x, spawn.z);
    player.jumping = true;
    this.botPhysics.set(sessionId, { verticalVelocity: 0, grounded: false });
    this.botMoveState.set(
      sessionId,
      createTrainingBotMoveState(spawn.yaw, this.state.worldTime),
    );
  }

  messages = {
    move: (client: Client, data: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;

      const clientFeetY = data.y - EYE_HEIGHT;
      const feetYForMove = resolveMoveFeetY(data.x, data.z, clientFeetY);
      const deltaX = data.x - player.x;
      const deltaZ = data.z - player.z;
      const resolved = movePlayer(player.x, feetYForMove, player.z, deltaX, deltaZ);

      player.x = resolved.x;
      player.z = resolved.z;
      player.y = clampEyeY(resolved.x, resolved.z, data.y);
      player.yaw = data.yaw;
      player.pitch = data.pitch;
      player.jumping = data.jumping === true;
      player.sprinting = data.sprinting === true && !player.jumping;
      player.walking = data.walking === true && !player.sprinting && !player.jumping;
    },

    reload: (client: Client, data: ReloadMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive || player.reloading) return;
      if (!isWeaponId(data.weaponId)) return;

      player.reloading = true;
      player.activeWeaponId = data.weaponId;
      player.reloadEndAt = this.state.worldTime + getWeaponReloadSec(data.weaponId);
    },

    switchWeapon: (client: Client, data: SwitchWeaponMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive || player.reloading) return;

      const slot = data.slot;
      if (slot < 0 || slot >= LOADOUT_WEAPON_IDS.length) return;

      player.activeWeaponId = LOADOUT_WEAPON_IDS[slot]!;
    },

    shoot: (client: Client, data: ProjectileSpawnMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      this.broadcast('projectile', { ...data, shooterId: client.sessionId }, { except: client });
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
      if (data.targetId === client.sessionId) return;
      if (
        shooter.teamId === target.teamId &&
        !isTrainingBotSessionId(data.targetId)
      ) {
        return;
      }

      const distance = Math.hypot(shooter.x - target.x, shooter.z - target.z);
      if (!isWeaponId(data.weaponId)) return;
      if (distance > getWeaponMaxHitDistance(data.weaponId)) return;

      const damage = getWeaponDamage(data.weaponId);
      target.hp = Math.max(0, target.hp - damage);
      if (target.hp > 0) return;

      target.hp = 0;
      target.alive = false;
      target.reloading = false;
      target.reloadEndAt = 0;

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
    if (this.emptyDisposeTimer) {
      this.emptyDisposeTimer.clear();
      this.emptyDisposeTimer = undefined;
    }

    const player = new PlayerState();
    const spawn = pickSpawnPoint(this.countHumanPlayers());
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

    if (!this.inviteMatch || this.clients.length > 0) return;

    this.emptyDisposeTimer = this.clock.setTimeout(() => {
      if (this.clients.length === 0) {
        this.disconnect();
      }
    }, 60_000);
  }

  private countHumanPlayers(): number {
    let count = 0;
    for (const sessionId of this.state.players.keys()) {
      if (!isTrainingBotSessionId(sessionId)) count += 1;
    }
    return count;
  }

  private spawnTrainingBots(): void {
    TRAINING_BOT_SPAWNS.forEach((spawn, index) => {
      const botIndex = index + 1;
      const sessionId = trainingBotSessionId(botIndex);
      const player = new PlayerState();

      player.username = trainingBotUsername(botIndex);
      player.teamId = TRAINING_BOT_TEAM_ID;
      player.hp = PLAYER_MAX_HP;
      player.alive = true;
      player.pitch = 0;
      player.sprinting = false;
      player.walking = false;
      player.reloading = false;
      player.reloadEndAt = 0;

      this.botSpawns.set(sessionId, spawn);
      this.placeTrainingBot(sessionId, player, spawn);
      this.state.players.set(sessionId, player);
    });
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

    for (const [sessionId, player] of this.state.players.entries()) {
      if (isTrainingBotSessionId(sessionId)) continue;
      if (player.teamId === 0) team0 += 1;
      else team1 += 1;
    }

    return team0 <= team1 ? 0 : 1;
  }

  private respawnPlayer(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    if (isTrainingBotSessionId(sessionId)) {
      const spawn = this.botSpawns.get(sessionId);
      if (!spawn) return;

      player.hp = PLAYER_MAX_HP;
      player.alive = true;
      player.pitch = 0;
      player.reloading = false;
      player.reloadEndAt = 0;
      player.sprinting = false;
      player.walking = false;
      this.placeTrainingBot(sessionId, player, spawn);
      return;
    }

    const spawn = pickSpawnPoint(this.countHumanPlayers());
    player.hp = PLAYER_MAX_HP;
    player.alive = true;
    player.x = spawn.x;
    player.y = EYE_HEIGHT;
    player.z = spawn.z;
    player.yaw = 0;
    player.pitch = 0;
    player.reloading = false;
    player.reloadEndAt = 0;
    player.sprinting = false;
    player.walking = false;
    player.jumping = false;
    player.activeWeaponId = LOADOUT_WEAPON_IDS[0]!;
  }
}
