import * as THREE from 'three';
import type { ProjectileHitTarget } from '../combat/ProjectileManager';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import { Player } from '../player/Player';
import { RemotePlayerUiVisibility } from '../player/remotePlayerUiVisibility';
import { preloadGameCharacterModels } from '../player/characterModel';
import { preloadWeaponMeshes } from '../content/weaponMeshes';
import type { FootstepSoundService } from '../audio/FootstepSoundService';
import type { RoomClient } from './RoomClient';
import type { PlayerSnapshot } from './types';

const _listenerPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();

/** Near / mid / far squared thresholds for remote presentation LOD. */
const REMOTE_LOD_NEAR_SQ = 28 * 28;
const REMOTE_LOD_MID_SQ = 55 * 55;

export class RemotePlayers {
  private readonly players = new Map<string, Player>();
  private footsteps: FootstepSoundService | null = null;
  private onShieldBreakHandler: ((sessionId: string) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private roomClient: RoomClient,
    private readonly uiVisibility: RemotePlayerUiVisibility,
  ) {
    void Promise.all([preloadGameCharacterModels(), preloadWeaponMeshes()]);
  }

  setFootstepSoundService(service: FootstepSoundService | null): void {
    this.footsteps = service;
    if (!service) return;
    for (const sessionId of this.players.keys()) {
      service.removeRemote(sessionId);
    }
  }

  onShieldBreak(handler: (sessionId: string) => void): void {
    this.onShieldBreakHandler = handler;
  }

  bind(): void {
    this.roomClient.onPlayerAdd((sessionId, snapshot) => {
      this.addPlayer(sessionId, snapshot);
    });

    this.roomClient.onPlayerRemove((sessionId) => {
      this.removePlayer(sessionId);
    });

    this.roomClient.onPlayerChange((sessionId, snapshot) => {
      this.updatePlayer(sessionId, snapshot);
    });
  }

  getPlayer(sessionId: string): Player | undefined {
    return this.players.get(sessionId);
  }

  getAllPlayers(): ReadonlyMap<string, Player> {
    return this.players;
  }

  private readonly enemyHitTargetScratch: ProjectileHitTarget[] = [];

  getEnemyHitTargets(localTeamId: number, localSessionId: string): ProjectileHitTarget[] {
    const targets = this.enemyHitTargetScratch;
    targets.length = 0;
    const friendlyFire = this.roomClient.getFriendlyFire();

    for (const [sessionId, player] of this.players) {
      if (sessionId === localSessionId) continue;
      if (!player.isAlive()) continue;
      const isBot = isTrainingBotSessionId(sessionId);
      if (!friendlyFire && !isBot && player.getTeamId() === localTeamId) continue;

      const feet = player.getFeetPosition();
      const volumes = player.getBodyHitVolumes() ?? undefined;
      targets.push({
        sessionId,
        teamId: player.getTeamId(),
        feetX: feet.x,
        feetY: feet.y,
        feetZ: feet.z,
        yaw: player.getAimYaw(),
        pitch: player.getAimPitch(),
        volumes,
      });
    }

    return targets;
  }

  private isLocal(sessionId: string): boolean {
    return sessionId === this.roomClient.sessionId;
  }

  private addPlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;

    const player = Player.createRemote();
    player.setShieldBreakListener(() => {
      this.onShieldBreakHandler?.(sessionId);
    });
    player.setFromSnapshot(snapshot, true);
    player.attachToScene(this.scene);
    this.players.set(sessionId, player);

    player.syncRemoteCharacterModel(this.roomClient.getWorldTime());
  }

  private updatePlayer(sessionId: string, snapshot: PlayerSnapshot): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;

    if (snapshot.alive && !player.isAlive()) {
      this.uiVisibility.clearSession(sessionId);
    }

    player.setFromSnapshot(snapshot);
    player.syncRemoteCharacterModel(this.roomClient.getWorldTime());
  }

  interpolate(delta: number, camera: THREE.Camera, localTeamId: number): void {
    const worldTime = this.roomClient.getWorldTime();
    const nowSec = performance.now() / 1000;
    this.uiVisibility.prune(nowSec);
    const footsteps = this.footsteps;
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(_camPos);
    if (footsteps) {
      footsteps.updateListener(camera);
      _listenerPos.copy(_camPos);
    }

    for (const [sessionId, player] of this.players) {
      const feet = player.getFeetPosition();
      const dx = feet.x - _camPos.x;
      const dy = feet.y - _camPos.y;
      const dz = feet.z - _camPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const lodTier: 0 | 1 | 2 =
        distSq <= REMOTE_LOD_NEAR_SQ ? 0 : distSq <= REMOTE_LOD_MID_SQ ? 1 : 2;
      player.setRemoteLodTier(lodTier);

      player.interpolateRemote(delta);
      player.syncRemoteCharacterModel(worldTime);
      player.updateRemoteWeapon(delta, worldTime);
      // Training bots are always hostile regardless of team assignment.
      const isTeammate =
        !isTrainingBotSessionId(sessionId) && player.getTeamId() === localTeamId;
      player.setEnemyHighlight(!isTeammate);
      const visibility = this.uiVisibility.resolve(
        sessionId,
        camera,
        feet,
        player.isAlive(),
        isTeammate,
        nowSec,
      );
      player.updateRemoteHealthBar(camera, visibility);
      player.updateDamageNumbers(delta, camera);
      player.updateRemoteShieldRecharge(delta, worldTime, camera);

      if (!footsteps) continue;

      if (!player.isAlive()) {
        footsteps.removeRemote(sessionId);
        continue;
      }

      footsteps.updateRemote(
        sessionId,
        delta,
        player.getFeetPosition(),
        _listenerPos,
        player.getLocomotionState(),
      );
    }
  }

  private removePlayer(sessionId: string): void {
    if (this.isLocal(sessionId)) return;

    const player = this.players.get(sessionId);
    if (!player) return;
    player.dispose();
    this.footsteps?.removeRemote(sessionId);
    this.uiVisibility.clearSession(sessionId);
    this.players.delete(sessionId);
  }
}
