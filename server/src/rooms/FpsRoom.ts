import { Client, Room } from 'colyseus';
import { overlapsAmmoBox } from '../../../shared/level/ammoBoxSpawns.js';
import { overlapsGrenadePickup } from '../../../shared/network/grenadePickup.js';
import type { PlayerPhysicsState } from '../../../shared/level/collision.js';
import {
  clampEyeYForMap,
  getMapPhysics,
  getSpawnCollidersForMap,
  isSpawnBlockedForMap,
  movePlayerForMap,
  resolveMoveFeetYForMap,
  stepPlayerPhysicsForMap,
} from '../../../shared/level/mapMeshMovement.js';
import { applyForwardLimbWallClearance } from '../../../shared/physics/forwardWallClearance.js';
import { CROUCH_EYE_HEIGHT } from '../../../shared/combat/crouch.js';
import { EYE_HEIGHT, PLAYER_HALF_WIDTH } from '../../../shared/level/levelData.js';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../../shared/combat/playerHitbox.js';
import { getMapDef, normalizeMapId, type MapCollisionDef } from '../../../shared/level/maps.js';
import type { SpawnPickContext } from '../../../shared/level/spawnPick.js';
import {
  PLAYER_MAX_HP,
  RESPAWN_DELAY_SEC,
} from '../../../shared/combat/damage.js';
import { isValidTeamId, isValidTdmTeamId } from '../../../shared/combat/teams.js';
import {
  defaultTdmExpectedPlayers,
  normalizeGameMode,
  resolveTdmTeamCount,
  TDM_COUNTDOWN_SEC,
  TDM_KILL_POINTS,
  TDM_MATCH_DURATION_SEC,
  type GameMode,
} from '../../../shared/combat/match.js';
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
  MELEE_ATTACK_ANIM_SEC,
  WEAPON_SWITCH_ANIM_SEC,
} from '../../../shared/combat/characterAnim.js';
import {
  getWeaponDamage,
  getWeaponMaxHitDistance,
  getWeaponReloadSec,
  WEAPON_FIRE_MODE,
} from '../../../shared/content/weaponStats.js';
import {
  computeGrenadeThrowVelocity,
  createGrenadeMotionState,
  grenadeDamageAtDistance,
} from '../../../shared/combat/grenadePhysics.js';
import {
  GRENADE_BLAST_RADIUS,
  GRENADE_COLLISION_RADIUS,
  GRENADE_FUSE_SEC,
  GRENADE_MAX_DAMAGE,
  GRENADE_PICKUP_GRANT,
  GRENADE_PICKUP_RESPAWN_SEC,
  GRENADE_SERVER_FALLBACK_GRACE_SEC,
  GRENADE_THROW_AIM_HALF_ANGLE_RAD,
  GRENADE_THROW_ORIGIN_MAX_OFFSET,
} from '../../../shared/throwables/grenadeConfig.js';
import type {
  GrenadeDetonateRequest,
  GrenadeThrowRequest,
} from '../../../shared/network/grenade.js';
import type { PickupGrenadeMessage } from '../../../shared/network/grenadePickup.js';
import {
  aimDirectionFromYawPitch,
  feetYFromEyeY,
  isMeleeHitValid,
} from '../../../shared/combat/meleeHit.js';
import { normalizeBodyPartId } from '../../../shared/combat/bodyParts.js';
import {
  raycastPlayerBodyPart,
  scaleDamageForBodyPart,
} from '../../../shared/combat/playerHitbox.js';
import { applyDamageWithShield, applyShieldChargeRecharge, canUseShieldCharge, getShieldCapacity, resetPlayerShield } from '../../../shared/combat/shield.js';
import { SHIELD_CHARGE_TIME_SEC } from '../../../shared/combat/shieldRecharge.js';
import {
  isPickableWeaponId,
  isWeaponId,
  LOADOUT_WEAPON_IDS,
  MELEE_WEAPON_ID,
} from '../../../shared/content/weaponIds.js';
import type { KillFeedMessage, PlayerDamagedMessage, PlayerHitMessage } from '../../../shared/network/damage.js';
import type { ReloadMessage } from '../../../shared/network/reload.js';
import type { SwitchWeaponMessage, EquipMeleeMessage } from '../../../shared/network/weapon.js';
import type { MeleeAttackMessage } from '../../../shared/network/meleeAttack.js';
import type { AutoFireStopMessage } from '../../../shared/network/autoFireStop.js';
import type { WeaponShotSoundMessage } from '../../../shared/network/weaponShot.js';
import {
  PICKUP_MAX_DESYNC,
  type PickupAmmoMessage,
} from '../../../shared/network/pickup.js';
import type { PickupShieldChargeMessage } from '../../../shared/network/shieldPickup.js';
import { SHIELD_PICKUP_MAX_DISTANCE } from '../../../shared/network/shieldPickup.js';
import type { DropShieldChargeMessage } from '../../../shared/network/shieldDrop.js';
import type { StartShieldDomeChargeMessage } from '../../../shared/network/shieldDome.js';
import type { StartShieldRechargeMessage } from '../../../shared/network/shieldRecharge.js';
import {
  SHIELD_DOME_CHARGE_SEC,
  SHIELD_DOME_COOLDOWN_SEC,
  SHIELD_DOME_DURATION_SEC,
  GRENADE_SHIELD_DOME_TIMER_PENALTY_SEC,
  shieldDomeCenterYFromFeet,
} from '../../../shared/combat/shieldDomeAbility.js';
import {
  grenadeBlastBlockedByShieldDome,
  grenadeExplosionHitsShieldDome,
  type GrenadeShieldDome,
} from '../../../shared/combat/grenadeShieldDome.js';
import type { DropWeaponMessage } from '../../../shared/network/weaponDrop.js';
import type { PickupWeaponDropMessage } from '../../../shared/network/weaponPickup.js';
import { WEAPON_PICKUP_MAX_DISTANCE } from '../../../shared/network/weaponPickup.js';
import {
  EMPTY_WEAPON_SLOT,
  clearLoadoutSlots,
  findLowestOccupiedLoadoutSlot,
  getLoadoutSlotWeapon,
  initDefaultLoadoutSlots,
  isValidDropSlot,
  resolveWeaponPickup,
  sanitizeLoadoutSlots,
  setLoadoutSlotWeapon,
} from '../../../shared/loadout/loadoutSlots.js';
import { MAX_SHIELD_CHARGES, MAX_GRENADES } from '../../../shared/inventory/inventoryLimits.js';
import { WORLD_PICKUP_RESPAWN_SEC } from '../../../shared/combat/worldPickupRespawn.js';
import type { ProjectileSpawnMessage } from '../../../shared/network/projectile.js';
import { AmmoBoxState, FpsState, GrenadePickupState, PlayerState, ShieldChargeState, WeaponDropState } from '../../../shared/schema/FpsState.js';
import { incrementDeaths, incrementKills } from '../stats/service.js';
import { registerGameUser, restoreLobbyPresenceAfterGame } from '../lobby/presence.js';
import { loadMapPhysicsForServer } from '../level/loadMapPhysics.js';

interface MoveMessage {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  sprinting?: boolean;
  walking?: boolean;
  walkingBackward?: boolean;
  jumping?: boolean;
  crouching?: boolean;
}

interface JoinOptions {
  username?: string;
  userId?: string;
  teamId?: number;
  inviteMatch?: boolean;
  maxPartySize?: number;
  friendlyFire?: boolean;
  mapId?: string;
  gameMode?: string;
}

interface LastShotOrigin {
  x: number;
  y: number;
  z: number;
  time: number;
}

interface ActiveServerGrenade {
  id: string;
  throwerId: string;
  throwerTeamId: number;
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  fuseEndAt: number;
  grounded: boolean;
  bounceCount: number;
}

export class FpsRoom extends Room<{ state: FpsState }> {
  state = new FpsState();
  maxClients = 8;
  private inviteMatch = false;
  private gameMode: GameMode = 'playground';
  private expectedPlayers = 0;
  private mapDef!: MapCollisionDef;
  private emptyDisposeTimer?: ReturnType<Room['clock']['setTimeout']>;
  private readonly botSpawns = new Map<string, { x: number; z: number; yaw: number }>();
  private readonly botPhysics = new Map<string, PlayerPhysicsState>();
  private readonly botMoveState = new Map<string, TrainingBotMoveState>();
  private readonly userIdBySession = new Map<string, string>();
  private readonly lastShotOriginBySession = new Map<string, LastShotOrigin>();
  private readonly autoFiringSessions = new Set<string>();
  private readonly holsteredWeaponIdBySession = new Map<string, string>();
  private readonly ammoRespawnAt = new Map<number, number>();
  private readonly shieldRespawnAt = new Map<number, number>();
  private readonly grenadeRespawnAt = new Map<number, number>();
  private readonly activeGrenades = new Map<string, ActiveServerGrenade>();
  private grenadeIdCounter = 0;

  async onCreate(options: JoinOptions = {}): Promise<void> {
    this.inviteMatch = options.inviteMatch === true;
    this.autoDispose = !this.inviteMatch;
    const partySize = Math.min(
      8,
      Math.max(2, Math.floor(options.maxPartySize ?? 2)),
    );
    this.maxClients = this.inviteMatch ? partySize : 8;
    this.expectedPlayers = this.inviteMatch ? partySize : 0;
    this.state.friendlyFire = options.friendlyFire === true;
    const mapId = normalizeMapId(options.mapId);
    this.state.mapId = mapId;
    this.mapDef = getMapDef(mapId);
    this.gameMode = normalizeGameMode(options.gameMode);
    this.state.gameMode = this.gameMode;

    await loadMapPhysicsForServer(this.mapDef);

    if (this.gameMode === 'tdm') {
      this.state.friendlyFire = false;
      this.state.matchPhase = 'waiting';
      this.state.matchDurationSec = TDM_MATCH_DURATION_SEC;
      this.state.expectedPlayers = this.expectedPlayers > 0
        ? this.expectedPlayers
        : defaultTdmExpectedPlayers(mapId);
      this.expectedPlayers = this.state.expectedPlayers;
      this.state.teamCount = resolveTdmTeamCount(this.expectedPlayers);
    }
    this.patchRate = 50;

    for (const pos of this.mapDef.getAmmoPositions?.() ?? this.mapDef.ammoPositions) {
      const box = new AmmoBoxState();
      box.x = pos.x;
      box.z = pos.z;
      this.state.ammoBoxes.push(box);
    }

    for (const pos of this.mapDef.getShieldPositions?.() ?? this.mapDef.shieldPositions) {
      const charge = new ShieldChargeState();
      charge.x = pos.x;
      charge.z = pos.z;
      this.state.shieldCharges.push(charge);
    }

    for (const pos of this.mapDef.getGrenadePositions?.() ?? []) {
      const pickup = new GrenadePickupState();
      pickup.x = pos.x;
      pickup.z = pos.z;
      pickup.count = this.mapDef.grenadePickupGrant ?? GRENADE_PICKUP_GRANT;
      this.state.grenadePickups.push(pickup);
    }

    for (const spawn of this.mapDef.getInitialWeaponSpawns?.() ?? []) {
      this.spawnWeaponDrop(spawn.x, spawn.z, spawn.yaw, spawn.weaponId);
    }

    if (this.mapDef.spawnTrainingBots) {
      this.spawnTrainingBots();
    }

    this.setSimulationInterval((deltaTime) => {
      const deltaSec = deltaTime / 1000;
      this.state.worldTime += deltaSec;
      this.tickReloads();
      this.tickShieldRecharges();
      this.tickShieldDomeCharges();
      this.tickTrainingBots(deltaSec);
      this.tickMatchState();
      this.tickWorldPickupRespawns();
      this.tickGrenades();
    });
  }

  private tickGrenades(): void {
    const now = this.state.worldTime;

    // Grenades are client-authoritative: the thrower simulates flight/bounces
    // and reports the detonation position (see `grenadeDetonate`). This tick is
    // only a safety net — if a thrower never reports (disconnect / dropped
    // message), force-detonate at the throw origin shortly after the fuse.
    for (const [id, grenade] of this.activeGrenades) {
      if (now >= grenade.fuseEndAt + GRENADE_SERVER_FALLBACK_GRACE_SEC) {
        this.detonateGrenade(id, grenade);
      }
    }
  }

  private getActiveShieldDomes(worldTime: number): GrenadeShieldDome[] {
    const domes: GrenadeShieldDome[] = [];

    for (const player of this.state.players.values()) {
      if (player.shieldDomeEndAt <= worldTime) continue;
      domes.push({
        centerX: player.shieldDomeCenterX,
        centerY: player.shieldDomeCenterY,
        centerZ: player.shieldDomeCenterZ,
        endAt: player.shieldDomeEndAt,
      });
    }

    return domes;
  }

  private applyGrenadeShieldDomePenalty(
    grenade: ActiveServerGrenade,
    thrower: PlayerState,
    now: number,
  ): void {
    for (const [ownerId, owner] of this.state.players) {
      if (ownerId === grenade.throwerId) continue;
      if (
        !this.state.friendlyFire &&
        thrower.teamId === owner.teamId &&
        !isTrainingBotSessionId(ownerId)
      ) {
        continue;
      }
      if (owner.shieldDomeEndAt <= now) continue;

      const dome: GrenadeShieldDome = {
        centerX: owner.shieldDomeCenterX,
        centerY: owner.shieldDomeCenterY,
        centerZ: owner.shieldDomeCenterZ,
        endAt: owner.shieldDomeEndAt,
      };
      if (!grenadeExplosionHitsShieldDome(grenade.x, grenade.y, grenade.z, dome, now)) {
        continue;
      }

      const newEndAt = owner.shieldDomeEndAt - GRENADE_SHIELD_DOME_TIMER_PENALTY_SEC;
      owner.shieldDomeEndAt = newEndAt <= now ? 0 : newEndAt;
    }
  }

  private detonateGrenade(id: string, grenade: ActiveServerGrenade): void {
    this.activeGrenades.delete(id);

    this.broadcast('grenadeExplosion', {
      id,
      throwerId: grenade.throwerId,
      x: grenade.x,
      y: grenade.y,
      z: grenade.z,
    });

    if (!this.isMatchCombatAllowed()) return;

    const thrower = this.state.players.get(grenade.throwerId);
    if (!thrower) return;

    const now = this.state.worldTime;
    this.applyGrenadeShieldDomePenalty(grenade, thrower, now);
    const shieldDomes = this.getActiveShieldDomes(now);

    const blastCenterY = grenade.y;
    const feetBlastY = blastCenterY - GRENADE_COLLISION_RADIUS;

    for (const [targetId, target] of this.state.players) {
      if (!target.alive) continue;

      // A grenade always hurts its thrower; only teammates are exempt with FF off.
      const isSelfDamage = targetId === grenade.throwerId;
      if (
        !isSelfDamage &&
        !this.state.friendlyFire &&
        thrower.teamId === target.teamId &&
        !isTrainingBotSessionId(targetId)
      ) {
        continue;
      }

      const targetFeetY = feetYFromEyeY(target.y);
      const targetCenterY = targetFeetY + PLAYER_HIT_CAPSULE_HEIGHT * 0.55;
      if (
        grenadeBlastBlockedByShieldDome(
          grenade.x,
          blastCenterY,
          grenade.z,
          target.x,
          targetCenterY,
          target.z,
          shieldDomes,
          now,
        )
      ) {
        continue;
      }

      const dx = target.x - grenade.x;
      const dy = targetCenterY - blastCenterY;
      const dz = target.z - grenade.z;
      const distance = Math.hypot(dx, dy, dz);
      const damage = grenadeDamageAtDistance(distance, GRENADE_MAX_DAMAGE, GRENADE_BLAST_RADIUS);
      if (damage <= 0) continue;

      const prevShieldPoints = target.shieldPoints;
      const result = applyDamageWithShield(target.hp, target.shieldPoints, damage);
      target.shieldPoints = result.shieldPoints;
      target.hp = result.hp;

      if (result.absorbedByShield > 0 || result.dealtToHealth > 0) {
        const victimClient = this.clients.find((c) => c.sessionId === targetId);
        if (victimClient) {
          victimClient.send('damaged', {
            shooterId: grenade.throwerId,
            shooterWorldX: grenade.x,
            shooterWorldY: feetBlastY,
            shooterWorldZ: grenade.z,
            absorbedByShield: result.absorbedByShield,
            dealtToHealth: result.dealtToHealth,
            shieldBroken: prevShieldPoints > 0 && result.shieldPoints <= 0,
          } satisfies PlayerDamagedMessage);
        }
      }

      if (target.hp > 0) continue;

      target.hp = 0;
      target.alive = false;
      target.reloading = false;
      target.reloadEndAt = 0;
      target.weaponSwitchEndAt = 0;
      target.meleeAttackEndAt = 0;
      this.stopAutoFireSound(targetId);
      this.cancelShieldRecharge(target);
      this.cancelShieldDome(target);

      const killFeed: KillFeedMessage = {
        killerId: grenade.throwerId,
        killerName: thrower.username,
        victimName: target.username,
      };
      this.broadcast('kill', killFeed);

      if (!isSelfDamage) {
        thrower.matchKills += 1;

        if (this.isTdm() && isValidTdmTeamId(thrower.teamId, this.state.teamCount)) {
          this.addTeamScore(thrower.teamId, TDM_KILL_POINTS);
        }
      }

      this.persistKillStats(grenade.throwerId, targetId);

      this.clock.setTimeout(() => {
        if (this.isTdm() && this.state.matchPhase === 'ended') return;
        this.respawnPlayer(targetId);
      }, RESPAWN_DELAY_SEC * 1000);
    }
  }

  private isThrowDirectionValid(
    player: PlayerState,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): boolean {
    const aim = aimDirectionFromYawPitch(player.yaw, player.pitch);
    const len = Math.hypot(dirX, dirY, dirZ);
    if (len <= 1e-8) return false;
    const nx = dirX / len;
    const ny = dirY / len;
    const nz = dirZ / len;
    const dot = aim.x * nx + aim.y * ny + aim.z * nz;
    return dot >= Math.cos(GRENADE_THROW_AIM_HALF_ANGLE_RAD);
  }

  private tickWorldPickupRespawns(): void {
    const now = this.state.worldTime;

    for (const [index, respawnAt] of this.ammoRespawnAt) {
      if (now < respawnAt) continue;
      const box = this.state.ammoBoxes.at(index);
      if (box) box.collected = false;
      this.ammoRespawnAt.delete(index);
    }

    for (const [index, respawnAt] of this.shieldRespawnAt) {
      if (now < respawnAt) continue;
      const charge = this.state.shieldCharges.at(index);
      if (charge) charge.collected = false;
      this.shieldRespawnAt.delete(index);
    }

    for (const [index, respawnAt] of this.grenadeRespawnAt) {
      if (now < respawnAt) continue;
      const pickup = this.state.grenadePickups.at(index);
      if (pickup) pickup.collected = false;
      this.grenadeRespawnAt.delete(index);
    }
  }

  private scheduleAmmoRespawn(index: number): void {
    this.ammoRespawnAt.set(index, this.state.worldTime + WORLD_PICKUP_RESPAWN_SEC);
  }

  private scheduleShieldRespawn(index: number): void {
    this.shieldRespawnAt.set(index, this.state.worldTime + WORLD_PICKUP_RESPAWN_SEC);
  }

  private scheduleGrenadeRespawn(index: number): void {
    const respawnDelay = this.mapDef.grenadePickupRespawnSec ?? GRENADE_PICKUP_RESPAWN_SEC;
    this.grenadeRespawnAt.set(index, this.state.worldTime + respawnDelay);
  }

  private isTdm(): boolean {
    return this.gameMode === 'tdm';
  }

  private isMatchCombatAllowed(): boolean {
    if (!this.isTdm()) return true;
    if (this.state.matchPhase !== 'playing') return false;
    return this.state.worldTime < this.state.matchEndAt;
  }

  private getTeamScore(teamId: number): number {
    switch (teamId) {
      case 0:
        return this.state.teamScore0;
      case 1:
        return this.state.teamScore1;
      case 2:
        return this.state.teamScore2;
      case 3:
        return this.state.teamScore3;
      default:
        return 0;
    }
  }

  private addTeamScore(teamId: number, points: number): void {
    switch (teamId) {
      case 0:
        this.state.teamScore0 += points;
        break;
      case 1:
        this.state.teamScore1 += points;
        break;
      case 2:
        this.state.teamScore2 += points;
        break;
      case 3:
        this.state.teamScore3 += points;
        break;
    }
  }

  private tickMatchState(): void {
    if (!this.isTdm()) return;

    const now = this.state.worldTime;

    if (this.state.matchPhase === 'waiting') {
      if (this.countHumanPlayers() >= this.expectedPlayers) {
        this.assignTdmTeams();
        this.teleportHumansToTeamSpawns();
        this.resetMatchKills();
        this.state.matchPhase = 'countdown';
        this.state.matchCountdownEndAt = now + TDM_COUNTDOWN_SEC;
      }
      return;
    }

    if (this.state.matchPhase === 'countdown') {
      if (now >= this.state.matchCountdownEndAt) {
        this.assignTdmTeams();
        this.teleportHumansToTeamSpawns();
        this.state.matchPhase = 'playing';
        this.state.matchStartAt = now;
        this.state.matchEndAt = now + this.state.matchDurationSec;
      }
      return;
    }

    if (this.state.matchPhase === 'playing' && now >= this.state.matchEndAt) {
      this.endMatch();
    }
  }

  private resetMatchKills(): void {
    for (const player of this.state.players.values()) {
      player.matchKills = 0;
    }
  }

  private assignTdmTeams(): void {
    const humans = [...this.state.players.entries()]
      .filter(([sessionId]) => !isTrainingBotSessionId(sessionId))
      .sort(([sessionIdA], [sessionIdB]) => sessionIdA.localeCompare(sessionIdB))
      .map(([, player]) => player);
    const count = humans.length;
    const teamCount = resolveTdmTeamCount(count);
    this.state.teamCount = teamCount;

    if (count === 2) {
      humans[0]!.teamId = 0;
      humans[1]!.teamId = 1;
      return;
    }

    if (count === 3) {
      humans[0]!.teamId = 0;
      humans[1]!.teamId = 1;
      humans[2]!.teamId = 2;
      return;
    }

    if (count >= 4) {
      humans[0]!.teamId = 0;
      humans[1]!.teamId = 0;
      humans[2]!.teamId = 1;
      humans[3]!.teamId = 1;
    }
  }

  private countPlayersOnTeam(teamId: number): number {
    let count = 0;
    for (const [sessionId, player] of this.state.players.entries()) {
      if (isTrainingBotSessionId(sessionId)) continue;
      if (player.teamId === teamId) count += 1;
    }
    return count;
  }

  private usesTeamSpawns(): boolean {
    return this.isTdm() && typeof this.mapDef.pickTeamSpawnPoint === 'function';
  }

  private getOccupiedSpawnPositions(excludeSessionId?: string): Array<{ x: number; z: number }> {
    const positions: Array<{ x: number; z: number }> = [];
    for (const [sessionId, player] of this.state.players.entries()) {
      if (isTrainingBotSessionId(sessionId)) continue;
      if (excludeSessionId && sessionId === excludeSessionId) continue;
      if (!player.alive) continue;
      // Ignore unset default origin — it breaks separation checks near map center.
      if (Math.abs(player.x) < 0.05 && Math.abs(player.z) < 0.05) continue;
      positions.push({ x: player.x, z: player.z });
    }
    return positions;
  }

  private createSpawnContext(
    occupied: Array<{ x: number; z: number }>,
    playersOnTeam?: number,
  ): SpawnPickContext {
    return {
      occupied,
      playersOnTeam,
      teamCount: this.state.teamCount,
      colliders: getSpawnCollidersForMap(this.mapDef),
      isGeometryBlocked: (x, z) => isSpawnBlockedForMap(x, z, this.mapDef),
    };
  }

  private pickTeamSpawn(
    teamId: number,
    indexOnTeam: number,
    occupied: Array<{ x: number; z: number }> = [],
    playersOnTeam?: number,
  ): { x: number; z: number } {
    const context = this.createSpawnContext(occupied, playersOnTeam ?? indexOnTeam + 1);
    if (this.mapDef.pickTeamSpawnPoint) {
      return this.mapDef.pickTeamSpawnPoint(teamId, indexOnTeam, context);
    }

    const spawnsPerTeam = 8;
    return this.mapDef.pickSpawnPoint(teamId * spawnsPerTeam + indexOnTeam, context);
  }

  private pickSpawnForJoiningPlayer(player: PlayerState): { x: number; z: number } {
    const occupied = this.getOccupiedSpawnPositions();
    if (this.usesTeamSpawns()) {
      const indexOnTeam = this.countPlayersOnTeam(player.teamId);
      const playersOnTeam = indexOnTeam + 1;
      return this.pickTeamSpawn(player.teamId, indexOnTeam, occupied, playersOnTeam);
    }
    return this.mapDef.pickSpawnPoint(this.countHumanPlayers(), this.createSpawnContext(occupied));
  }

  private teleportHumansToTeamSpawns(): void {
    const humans = [...this.state.players.entries()]
      .filter(([sessionId]) => !isTrainingBotSessionId(sessionId))
      .sort(([sessionIdA], [sessionIdB]) => sessionIdA.localeCompare(sessionIdB));

    if (!this.usesTeamSpawns()) {
      const occupied: Array<{ x: number; z: number }> = [];
      for (const [, player] of humans) {
        const spawn = this.mapDef.pickSpawnPoint(occupied.length, this.createSpawnContext(occupied));
        player.x = spawn.x;
        player.z = spawn.z;
        player.y = EYE_HEIGHT;
        occupied.push(spawn);
      }
      return;
    }

    const humansByTeam = new Map<number, PlayerState[]>();
    for (const [, player] of humans) {
      const teamPlayers = humansByTeam.get(player.teamId) ?? [];
      teamPlayers.push(player);
      humansByTeam.set(player.teamId, teamPlayers);
    }

    const globalOccupied: Array<{ x: number; z: number }> = [];
    const teamIds = [...humansByTeam.keys()].sort((a, b) => a - b);

    for (const teamId of teamIds) {
      const teamPlayers = humansByTeam.get(teamId)!;
      const context = this.createSpawnContext(globalOccupied, teamPlayers.length);
      const spawns = this.mapDef.pickTeamSpawnBatch
        ? this.mapDef.pickTeamSpawnBatch(teamId, teamPlayers.length, context)
        : teamPlayers.map((_, indexOnTeam) =>
            this.pickTeamSpawn(teamId, indexOnTeam, globalOccupied, teamPlayers.length),
          );

      for (let i = 0; i < teamPlayers.length; i++) {
        const spawn = spawns[i]!;
        const player = teamPlayers[i]!;
        player.x = spawn.x;
        player.z = spawn.z;
        player.y = EYE_HEIGHT;
        globalOccupied.push(spawn);
      }
    }
  }

  private endMatch(): void {
    if (this.state.matchPhase === 'ended') return;
    this.state.matchPhase = 'ended';

    let winningTeam = -1;
    let topScore = -1;
    let tied = false;

    for (let teamId = 0; teamId < this.state.teamCount; teamId++) {
      const score = this.getTeamScore(teamId);
      if (score > topScore) {
        topScore = score;
        winningTeam = teamId;
        tied = false;
      } else if (score === topScore && topScore >= 0) {
        tied = true;
      }
    }

    this.state.winningTeamId = tied ? -1 : winningTeam;
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

  private tickShieldRecharges(): void {
    const now = this.state.worldTime;
    for (const player of this.state.players.values()) {
      if (!player.shieldRecharging) continue;
      if (now < player.shieldRechargeEndAt) continue;
      this.completeShieldRecharge(player);
    }
  }

  private completeShieldRecharge(player: PlayerState): void {
    player.shieldRecharging = false;
    player.shieldRechargeEndAt = 0;
    if (player.shieldCharges <= 0) return;
    if (!canUseShieldCharge(player.shieldLevel, player.shieldPoints)) return;

    player.shieldCharges -= 1;
    const recharged = applyShieldChargeRecharge(
      player.shieldLevel,
      player.shieldPoints,
    );
    player.shieldLevel = recharged.shieldLevel;
    player.shieldPoints = recharged.shieldPoints;
  }

  private cancelShieldRecharge(player: PlayerState): void {
    if (!player.shieldRecharging) return;
    player.shieldRecharging = false;
    player.shieldRechargeEndAt = 0;
  }

  private startWeaponSwitchAnim(player: PlayerState): void {
    player.reloading = false;
    player.reloadEndAt = 0;
    player.meleeAttackEndAt = 0;
    player.weaponSwitchEndAt = this.state.worldTime + WEAPON_SWITCH_ANIM_SEC;
  }

  private cancelShieldDome(player: PlayerState): void {
    player.shieldDomeChargeEndAt = 0;
    player.shieldDomeEndAt = 0;
    player.shieldDomeCenterX = 0;
    player.shieldDomeCenterY = 0;
    player.shieldDomeCenterZ = 0;
  }

  private tryStartShieldDomeCharge(player: PlayerState): boolean {
    const now = this.state.worldTime;
    if (!player.alive) return false;
    if (now < player.shieldDomeCooldownEndAt) return false;
    if (now < player.shieldDomeEndAt) return false;
    if (now < player.shieldDomeChargeEndAt) return false;
    if (player.sprinting || player.jumping) return false;
    if (player.reloading) return false;

    const feetY = player.y - EYE_HEIGHT;
    player.shieldDomeCenterX = player.x;
    player.shieldDomeCenterY = shieldDomeCenterYFromFeet(feetY);
    player.shieldDomeCenterZ = player.z;
    player.shieldDomeChargeEndAt = now + SHIELD_DOME_CHARGE_SEC;
    return true;
  }

  private completeShieldDomeDeploy(player: PlayerState): void {
    const now = this.state.worldTime;
    player.shieldDomeChargeEndAt = 0;
    player.shieldDomeEndAt = now + SHIELD_DOME_DURATION_SEC;
    player.shieldDomeCooldownEndAt = now + SHIELD_DOME_COOLDOWN_SEC;
  }

  private tickShieldDomeCharges(): void {
    const now = this.state.worldTime;
    for (const player of this.state.players.values()) {
      if (player.shieldDomeChargeEndAt <= 0) continue;
      if (now < player.shieldDomeChargeEndAt) continue;
      this.completeShieldDomeDeploy(player);
    }
  }

  private tryStartShieldRecharge(player: PlayerState): boolean {
    if (!player.alive) return false;
    if (player.shieldRecharging) return false;
    if (player.shieldCharges <= 0) return false;
    if (!canUseShieldCharge(player.shieldLevel, player.shieldPoints)) return false;

    player.shieldRecharging = true;
    player.shieldRechargeEndAt = this.state.worldTime + SHIELD_CHARGE_TIME_SEC;
    return true;
  }

  private spawnWeaponDrop(
    x: number,
    z: number,
    yaw: number,
    weaponId: string,
  ): number {
    if (!isPickableWeaponId(weaponId)) return -1;

    const drop = new WeaponDropState();
    drop.x = x;
    drop.z = z;
    drop.yaw = yaw;
    drop.weaponId = weaponId;
    this.state.weaponDrops.push(drop);
    const dropIndex = this.state.weaponDrops.length - 1;
    this.broadcast('weaponDrop', {
      index: dropIndex,
      x: drop.x,
      z: drop.z,
      yaw: drop.yaw,
      weaponId: drop.weaponId,
    });
    return dropIndex;
  }

  private spawnShieldCharge(x: number, z: number): number {
    const charge = new ShieldChargeState();
    charge.x = x;
    charge.z = z;
    this.state.shieldCharges.push(charge);
    const index = this.state.shieldCharges.length - 1;
    this.broadcast('shieldChargeSpawn', {
      index,
      x: charge.x,
      z: charge.z,
    });
    return index;
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
      const result = stepPlayerPhysicsForMap(
        player.x,
        feetY,
        player.z,
        physics,
        deltaX,
        deltaZ,
        jump,
        deltaSec,
        this.mapDef,
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
      if (this.isTdm() && this.state.matchPhase !== 'playing') return;

      const airborne = data.jumping === true;
      const crouching = data.crouching === true && !airborne;
      const eyeHeight = crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
      const clientFeetY = data.y - eyeHeight;
      const feetYForMove = resolveMoveFeetYForMap(data.x, data.z, clientFeetY, this.mapDef);
      const deltaX = data.x - player.x;
      const deltaZ = data.z - player.z;
      const resolved = movePlayerForMap(
        player.x,
        feetYForMove,
        player.z,
        deltaX,
        deltaZ,
        this.mapDef,
      );

      player.x = resolved.x;
      player.z = resolved.z;

      const aim = aimDirectionFromYawPitch(data.yaw, data.pitch);
      const cleared = applyForwardLimbWallClearance(
        getMapPhysics(),
        player.x,
        feetYForMove,
        player.z,
        aim.x,
        aim.z,
        crouching,
      );
      player.x = cleared.x;
      player.z = cleared.z;

      player.y = clampEyeYForMap(cleared.x, cleared.z, data.y, this.mapDef, crouching);
      player.yaw = data.yaw;
      player.pitch = data.pitch;
      player.crouching = crouching;
      player.jumping = airborne;
      player.sprinting = data.sprinting === true && !player.jumping && !crouching;
      player.walking = data.walking === true && !player.sprinting && !player.jumping;
      player.walkingBackward =
        player.walking && data.walkingBackward === true;

      if (player.shieldRecharging && (player.jumping || player.sprinting)) {
        this.cancelShieldRecharge(player);
      }
    },

    reload: (client: Client, data: ReloadMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive || player.reloading) return;
      if (!isWeaponId(data.weaponId)) return;
      if (data.weaponId === MELEE_WEAPON_ID) return;

      let hasWeapon = false;
      for (let i = 0; i < LOADOUT_WEAPON_IDS.length; i++) {
        if (getLoadoutSlotWeapon(player, i) === data.weaponId) {
          hasWeapon = true;
          break;
        }
      }
      if (!hasWeapon) return;

      player.reloading = true;
      player.activeWeaponId = data.weaponId;
      player.reloadEndAt = this.state.worldTime + getWeaponReloadSec(data.weaponId);
    },

    switchWeapon: (client: Client, data: SwitchWeaponMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;

      const slot = data.slot;
      if (slot < 0 || slot >= LOADOUT_WEAPON_IDS.length) return;
      if (!getLoadoutSlotWeapon(player, slot)) return;

      const nextWeapon = getLoadoutSlotWeapon(player, slot)!;
      if (nextWeapon === MELEE_WEAPON_ID) return;
      if (player.activeWeaponId === nextWeapon) return;

      player.activeWeaponId = nextWeapon;
      this.startWeaponSwitchAnim(player);
      this.cancelShieldRecharge(player);
    },

    equipMelee: (client: Client, data: EquipMeleeMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;

      if (data.equipped) {
        if (player.activeWeaponId === MELEE_WEAPON_ID) return;
        if (isWeaponId(player.activeWeaponId)) {
          this.holsteredWeaponIdBySession.set(client.sessionId, player.activeWeaponId);
        }
        player.activeWeaponId = MELEE_WEAPON_ID;
      } else {
        if (player.activeWeaponId !== MELEE_WEAPON_ID) return;
        const nextSlot = findLowestOccupiedLoadoutSlot(player);
        if (nextSlot < 0) return;
        player.activeWeaponId = getLoadoutSlotWeapon(player, nextSlot)!;
        this.holsteredWeaponIdBySession.delete(client.sessionId);
      }

      this.startWeaponSwitchAnim(player);
      this.cancelShieldRecharge(player);
    },

    meleeAttack: (client: Client, _data: MeleeAttackMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      if (!this.isMatchCombatAllowed()) return;
      if (player.activeWeaponId !== MELEE_WEAPON_ID) return;

      player.meleeAttackEndAt = this.state.worldTime + MELEE_ATTACK_ANIM_SEC;

      const chestY = player.y - EYE_HEIGHT + PLAYER_HIT_CAPSULE_HEIGHT * 0.5;
      this.broadcastWeaponShot(
        client,
        MELEE_WEAPON_ID,
        player.x,
        chestY,
        player.z,
        'single',
      );
    },

    dropWeapon: (client: Client, data: DropWeaponMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;

      const slot = data.slot;
      if (!isValidDropSlot(player, slot)) return;

      const weaponId = getLoadoutSlotWeapon(player, slot);
      if (!isPickableWeaponId(weaponId)) return;

      setLoadoutSlotWeapon(player, slot, EMPTY_WEAPON_SLOT);
      this.spawnWeaponDrop(player.x, player.z, player.yaw, weaponId);

      if (player.activeWeaponId === weaponId) {
        const nextSlot = findLowestOccupiedLoadoutSlot(player);
        if (nextSlot >= 0) {
          player.activeWeaponId = getLoadoutSlotWeapon(player, nextSlot)!;
          this.startWeaponSwitchAnim(player);
        }
      }

      player.reloading = false;
      player.reloadEndAt = 0;
      this.cancelShieldRecharge(player);
    },

    dropShieldCharge: (client: Client, _data: DropShieldChargeMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      if (player.shieldCharges <= 0) return;

      player.shieldCharges -= 1;
      const index = this.spawnShieldCharge(player.x, player.z);
      this.cancelShieldRecharge(player);
      client.send('shieldChargeDropGranted', { index });
    },

    pickupWeaponDrop: (client: Client, data: PickupWeaponDropMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;

      const index = data.index;
      if (index < 0 || index >= this.state.weaponDrops.length) return;

      const drop = this.state.weaponDrops.at(index);
      if (!drop || drop.collected) return;
      if (!isPickableWeaponId(drop.weaponId)) return;

      const distance = Math.hypot(player.x - drop.x, player.z - drop.z);
      if (distance > WEAPON_PICKUP_MAX_DISTANCE) return;

      const resolution = resolveWeaponPickup(
        player,
        player.activeWeaponId,
        drop.weaponId,
        this.holsteredWeaponIdBySession.get(client.sessionId),
      );
      if (!resolution) return;

      if (
        resolution.replacedWeaponId &&
        isPickableWeaponId(resolution.replacedWeaponId)
      ) {
        this.spawnWeaponDrop(
          player.x,
          player.z,
          player.yaw,
          resolution.replacedWeaponId,
        );
        if (
          this.holsteredWeaponIdBySession.get(client.sessionId)
          === resolution.replacedWeaponId
        ) {
          this.holsteredWeaponIdBySession.delete(client.sessionId);
        }
      }

      drop.collected = true;
      setLoadoutSlotWeapon(player, resolution.targetSlot, drop.weaponId);
      sanitizeLoadoutSlots(player);
      player.activeWeaponId = drop.weaponId;
      this.startWeaponSwitchAnim(player);

      player.reloading = false;
      player.reloadEndAt = 0;
      this.cancelShieldRecharge(player);
      client.send('weaponPickupGranted', {
        index,
        weaponId: drop.weaponId,
      });
    },

    shoot: (client: Client, data: ProjectileSpawnMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      if (!isWeaponId(player.activeWeaponId)) return;
      if (!this.isMatchCombatAllowed()) return;
      this.cancelShieldRecharge(player);

      const chestY = player.y - EYE_HEIGHT + PLAYER_HIT_CAPSULE_HEIGHT * 0.5;
      this.lastShotOriginBySession.set(client.sessionId, {
        x: data.shooterWorldX ?? player.x,
        y: data.shooterWorldY ?? chestY,
        z: data.shooterWorldZ ?? player.z,
        time: this.state.worldTime,
      });

      let weaponId = data.weaponId;
      if (!weaponId || !isWeaponId(weaponId)) {
        weaponId = player.activeWeaponId;
      }
      if (weaponId && isWeaponId(weaponId)) {
        if (WEAPON_FIRE_MODE[weaponId] === 'auto') {
          if (!this.autoFiringSessions.has(client.sessionId)) {
            this.autoFiringSessions.add(client.sessionId);
            this.broadcastWeaponShot(
              client,
              weaponId,
              data.x,
              data.y,
              data.z,
              'autoStart',
            );
          }
        } else {
          this.broadcastWeaponShot(
            client,
            weaponId,
            data.x,
            data.y,
            data.z,
            'single',
          );
        }
      }

      this.broadcast('projectile', { ...data, shooterId: client.sessionId }, { except: client });
    },

    autoFireStop: (client: Client, _data: AutoFireStopMessage) => {
      this.stopAutoFireSound(client.sessionId);
    },

    startShieldRecharge: (client: Client, _data: StartShieldRechargeMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.tryStartShieldRecharge(player);
    },

    startShieldDomeCharge: (client: Client, _data: StartShieldDomeChargeMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.tryStartShieldDomeCharge(player);
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
      this.scheduleAmmoRespawn(index);
      client.send('ammoPickupGranted', { index });
    },

    pickupShieldCharge: (client: Client, data: PickupShieldChargeMessage) => {
      const index = data.index;
      if (index < 0 || index >= this.state.shieldCharges.length) return;

      const charge = this.state.shieldCharges.at(index);
      if (!charge || charge.collected) return;

      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      if (player.shieldCharges >= MAX_SHIELD_CHARGES) return;

      const distance = Math.hypot(player.x - charge.x, player.z - charge.z);
      if (distance > SHIELD_PICKUP_MAX_DISTANCE) return;

      charge.collected = true;
      player.shieldCharges += 1;
      this.scheduleShieldRespawn(index);
      client.send('shieldChargePickupGranted', { index });
    },

    throwGrenade: (client: Client, data: GrenadeThrowRequest) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      if (!this.isMatchCombatAllowed()) return;
      if (player.grenadeCount <= 0) return;

      const originOffset = Math.hypot(data.x - player.x, data.y - player.y, data.z - player.z);
      if (originOffset > GRENADE_THROW_ORIGIN_MAX_OFFSET) return;
      if (!this.isThrowDirectionValid(player, data.dirX, data.dirY, data.dirZ)) return;

      const dirLen = Math.hypot(data.dirX, data.dirY, data.dirZ);
      if (dirLen <= 1e-8) return;
      const vel = computeGrenadeThrowVelocity(data.dirX, data.dirY, data.dirZ);

      player.grenadeCount -= 1;
      this.cancelShieldRecharge(player);

      const id = `grenade-${++this.grenadeIdCounter}`;
      const fuseEndAt = this.state.worldTime + GRENADE_FUSE_SEC;
      const grenade: ActiveServerGrenade = {
        ...createGrenadeMotionState(
          data.x,
          data.y,
          data.z,
          vel.velX,
          vel.velY,
          vel.velZ,
        ),
        id,
        throwerId: client.sessionId,
        throwerTeamId: player.teamId,
        fuseEndAt,
      };
      this.activeGrenades.set(id, grenade);

      const payload = {
        id,
        throwerId: client.sessionId,
        x: data.x,
        y: data.y,
        z: data.z,
        velX: vel.velX,
        velY: vel.velY,
        velZ: vel.velZ,
        fuseEndAt,
      };

      client.send('grenadeThrown', payload);
      this.broadcast('grenadeThrown', payload, { except: client });
    },

    grenadeDetonate: (client: Client, data: GrenadeDetonateRequest) => {
      const grenade = this.activeGrenades.get(data.id);
      if (!grenade) return;
      // Only the thrower's client is authoritative for its grenade's position.
      if (grenade.throwerId !== client.sessionId) return;

      if (
        !Number.isFinite(data.x) ||
        !Number.isFinite(data.y) ||
        !Number.isFinite(data.z)
      ) {
        return;
      }

      grenade.x = data.x;
      grenade.y = data.y;
      grenade.z = data.z;
      this.detonateGrenade(data.id, grenade);
    },

    pickupGrenade: (client: Client, data: PickupGrenadeMessage) => {
      const index = data.index;
      if (index < 0 || index >= this.state.grenadePickups.length) return;

      const pickup = this.state.grenadePickups.at(index);
      if (!pickup || pickup.collected) return;

      const player = this.state.players.get(client.sessionId);
      if (!player?.alive) return;
      if (player.grenadeCount >= MAX_GRENADES) return;

      const serverOverlap = overlapsGrenadePickup(
        player.x,
        player.z,
        pickup.x,
        pickup.z,
        PLAYER_HALF_WIDTH,
      );

      if (!serverOverlap) {
        const desync = Math.hypot(data.x - player.x, data.z - player.z);
        if (desync > PICKUP_MAX_DESYNC) return;

        if (
          !overlapsGrenadePickup(
            data.x,
            data.z,
            pickup.x,
            pickup.z,
            PLAYER_HALF_WIDTH,
          )
        ) {
          return;
        }
      }

      const grant = Math.min(pickup.count, MAX_GRENADES - player.grenadeCount);
      if (grant <= 0) return;

      pickup.collected = true;
      player.grenadeCount += grant;
      this.scheduleGrenadeRespawn(index);
      client.send('grenadePickupGranted', { index, count: grant });
    },

    hit: (client: Client, data: PlayerHitMessage) => {
      const shooter = this.state.players.get(client.sessionId);
      const target = this.state.players.get(data.targetId);
      if (!shooter?.alive || !target?.alive) return;
      if (!this.isMatchCombatAllowed()) return;
      if (data.targetId === client.sessionId) return;
      if (!isWeaponId(data.weaponId)) return;
      if (shooter.activeWeaponId !== data.weaponId) return;
      if (
        !this.state.friendlyFire &&
        shooter.teamId === target.teamId &&
        !isTrainingBotSessionId(data.targetId)
      ) {
        return;
      }

      const distance = Math.hypot(shooter.x - target.x, shooter.z - target.z);
      const maxDistance = getWeaponMaxHitDistance(data.weaponId);
      if (distance > maxDistance) return;

      const targetFeetY = feetYFromEyeY(target.y);
      if (data.weaponId === MELEE_WEAPON_ID) {
        if (
          !isMeleeHitValid(
            shooter.x,
            shooter.y,
            shooter.z,
            shooter.yaw,
            shooter.pitch,
            target.x,
            targetFeetY,
            target.z,
            maxDistance,
          )
        ) {
          return;
        }
      }

      const targetHit = {
        feetX: target.x,
        feetY: targetFeetY,
        feetZ: target.z,
        yaw: target.yaw,
        pitch: target.pitch,
      };

      let bodyPart = normalizeBodyPartId(data.bodyPart);
      if (data.weaponId === MELEE_WEAPON_ID) {
        const dir = aimDirectionFromYawPitch(shooter.yaw, shooter.pitch);
        const meleeHit = raycastPlayerBodyPart(
          shooter.x,
          shooter.y,
          shooter.z,
          dir.x,
          dir.y,
          dir.z,
          maxDistance,
          targetHit,
        );
        if (meleeHit) bodyPart = meleeHit.part;
      }

      const damage = scaleDamageForBodyPart(getWeaponDamage(data.weaponId), bodyPart);
      const prevShieldPoints = target.shieldPoints;
      const result = applyDamageWithShield(target.hp, target.shieldPoints, damage);
      target.shieldPoints = result.shieldPoints;
      target.hp = result.hp;

      if (result.absorbedByShield > 0 || result.dealtToHealth > 0) {
        const lastShot = this.lastShotOriginBySession.get(client.sessionId);
        const victimClient = this.clients.find((c) => c.sessionId === data.targetId);
        if (victimClient && lastShot) {
          victimClient.send('damaged', {
            shooterId: client.sessionId,
            shooterWorldX: lastShot.x,
            shooterWorldY: lastShot.y,
            shooterWorldZ: lastShot.z,
            absorbedByShield: result.absorbedByShield,
            dealtToHealth: result.dealtToHealth,
            shieldBroken: prevShieldPoints > 0 && result.shieldPoints <= 0,
          } satisfies PlayerDamagedMessage);
        }
      }

      if (target.hp > 0) return;

      target.hp = 0;
      target.alive = false;
      target.reloading = false;
      target.reloadEndAt = 0;
      target.weaponSwitchEndAt = 0;
      target.meleeAttackEndAt = 0;
      this.stopAutoFireSound(data.targetId);
      this.cancelShieldRecharge(target);
      this.cancelShieldDome(target);

      const killFeed: KillFeedMessage = {
        killerId: client.sessionId,
        killerName: shooter.username,
        victimName: target.username,
      };
      this.broadcast('kill', killFeed);
      shooter.matchKills += 1;

      if (this.isTdm() && isValidTdmTeamId(shooter.teamId, this.state.teamCount)) {
        this.addTeamScore(shooter.teamId, TDM_KILL_POINTS);
      }

      this.persistKillStats(client.sessionId, data.targetId);

      const targetId = data.targetId;
      this.clock.setTimeout(() => {
        if (this.isTdm() && this.state.matchPhase === 'ended') return;
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
    const username = this.sanitizeUsername(options.username);

    player.username = username;
    const userId = this.normalizeUserId(options.userId);
    if (userId) {
      this.userIdBySession.set(client.sessionId, userId);
      registerGameUser(userId);
    }
    player.teamId = this.isTdm()
      ? this.pickBalancedTdmTeam()
      : this.resolveTeamId(options.teamId);
    player.hp = PLAYER_MAX_HP;
    const shield = resetPlayerShield();
    player.shieldLevel = shield.shieldLevel;
    player.shieldPoints = shield.shieldPoints;
    player.alive = true;
    const spawn = this.pickSpawnForJoiningPlayer(player);
    player.x = spawn.x;
    player.y = EYE_HEIGHT;
    player.z = spawn.z;
    this.initPlayerLoadout(player);
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.stopAutoFireSound(client.sessionId);
    this.holsteredWeaponIdBySession.delete(client.sessionId);
    const userId = this.userIdBySession.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.userIdBySession.delete(client.sessionId);
    if (userId) {
      restoreLobbyPresenceAfterGame(userId);
    }

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

  private normalizeUserId(raw?: string): string | null {
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }

  private persistKillStats(killerSessionId: string, victimSessionId: string): void {
    const isSuicide = killerSessionId === victimSessionId;
    if (!isSuicide && !isTrainingBotSessionId(killerSessionId)) {
      const killerUserId = this.userIdBySession.get(killerSessionId);
      if (killerUserId) {
        void incrementKills(killerUserId).catch((error) => {
          console.error('[stats] failed to increment kills', error);
        });
      }
    }

    if (!isTrainingBotSessionId(victimSessionId)) {
      const victimUserId = this.userIdBySession.get(victimSessionId);
      if (victimUserId) {
        void incrementDeaths(victimUserId).catch((error) => {
          console.error('[stats] failed to increment deaths', error);
        });
      }
    }
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

  private pickBalancedTdmTeam(): number {
    const teamCount = this.state.teamCount;
    const counts = Array.from({ length: teamCount }, () => 0);

    for (const [sessionId, player] of this.state.players.entries()) {
      if (isTrainingBotSessionId(sessionId)) continue;
      if (player.teamId >= 0 && player.teamId < teamCount) {
        counts[player.teamId]! += 1;
      }
    }

    let minTeam = 0;
    for (let teamId = 1; teamId < teamCount; teamId++) {
      if (counts[teamId]! < counts[minTeam]!) {
        minTeam = teamId;
      }
    }
    return minTeam;
  }

  private broadcastWeaponShot(
    shooterClient: Client,
    weaponId: string,
    x: number,
    y: number,
    z: number,
    phase: WeaponShotSoundMessage['phase'],
  ): void {
    this.broadcast(
      'weaponShot',
      {
        shooterId: shooterClient.sessionId,
        weaponId,
        x,
        y,
        z,
        phase,
      } satisfies WeaponShotSoundMessage,
      { except: shooterClient },
    );
  }

  private stopAutoFireSound(sessionId: string): void {
    if (!this.autoFiringSessions.delete(sessionId)) return;

    const player = this.state.players.get(sessionId);
    if (!player) return;

    const chestY = player.y - EYE_HEIGHT + PLAYER_HIT_CAPSULE_HEIGHT * 0.5;
    const weaponId = isWeaponId(player.activeWeaponId)
      ? player.activeWeaponId
      : LOADOUT_WEAPON_IDS[0]!;

    this.broadcast('weaponShot', {
      shooterId: sessionId,
      weaponId,
      x: player.x,
      y: chestY,
      z: player.z,
      phase: 'autoStop',
    } satisfies WeaponShotSoundMessage);
  }

  private respawnPlayer(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    if (isTrainingBotSessionId(sessionId)) {
      const spawn = this.botSpawns.get(sessionId);
      if (!spawn) return;

      player.hp = PLAYER_MAX_HP;
      const botShield = resetPlayerShield();
      player.shieldLevel = botShield.shieldLevel;
      player.shieldPoints = botShield.shieldPoints;
      player.alive = true;
      player.pitch = 0;
      player.reloading = false;
      player.reloadEndAt = 0;
      player.weaponSwitchEndAt = 0;
      player.meleeAttackEndAt = 0;
      player.sprinting = false;
      player.walking = false;
      this.placeTrainingBot(sessionId, player, spawn);
      return;
    }

    const deathPosition = { x: player.x, z: player.z };
    const occupied = this.getOccupiedSpawnPositions(sessionId);
    const spawnContext = this.createSpawnContext(
      occupied,
      this.countPlayersOnTeam(player.teamId),
    );
    const spawn = this.isTdm() && this.mapDef.pickTeamRespawnPoint
      ? this.mapDef.pickTeamRespawnPoint(player.teamId, deathPosition, spawnContext)
      : this.mapDef.pickSpawnPoint(occupied.length, spawnContext);
    player.hp = PLAYER_MAX_HP;
    const shield = resetPlayerShield();
    player.shieldLevel = shield.shieldLevel;
    player.shieldPoints = shield.shieldPoints;
    this.cancelShieldRecharge(player);
    this.cancelShieldDome(player);
    player.shieldDomeCooldownEndAt = 0;
    player.alive = true;
    player.x = spawn.x;
    player.y = EYE_HEIGHT;
    player.z = spawn.z;
    player.yaw = 0;
    player.pitch = 0;
    player.reloading = false;
    player.reloadEndAt = 0;
    player.weaponSwitchEndAt = 0;
    player.meleeAttackEndAt = 0;
    player.sprinting = false;
    player.walking = false;
    player.jumping = false;
    player.crouching = false;
    this.holsteredWeaponIdBySession.delete(sessionId);
    this.initPlayerLoadout(player);
    if (this.mapDef.respawnGrenadeCount !== undefined) {
      player.grenadeCount = this.mapDef.respawnGrenadeCount;
    }
  }

  private initPlayerLoadout(player: PlayerState): void {
    if (this.mapDef.emptyStartingLoadout) {
      clearLoadoutSlots(player);
      player.activeWeaponId = EMPTY_WEAPON_SLOT;
    } else {
      initDefaultLoadoutSlots(player);
      player.activeWeaponId = LOADOUT_WEAPON_IDS[0]!;
    }

    sanitizeLoadoutSlots(player);
  }
}
