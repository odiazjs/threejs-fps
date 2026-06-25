import * as THREE from 'three';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { pickSpawnPoint } from '../../shared/level/kiloSectorColliders';
import { KeyboardInput } from '../input/KeyboardInput';
import { PointerInput } from '../input/PointerInput';
import { ProjectileManager } from '../combat/ProjectileManager';
import { NetworkManager } from '../network/NetworkManager';
import type { LocalCombatState } from '../network/types';
import { Player } from '../player/Player';
import { PlayerControls } from '../player/PlayerControls';
import { RenderContext } from '../render/RenderContext';
import { updateEdgeLinesForCamera } from '../visuals/edgeLines';
import type { LightBeams } from '../world/LightBeams';
import { StaminaHud } from '../ui/StaminaHud';
import { AmmoHud } from '../ui/AmmoHud';
import { MessageHud } from '../ui/MessageHud';
import { HealthHud } from '../ui/HealthHud';
import { KillFeedHud } from '../ui/KillFeedHud';
import { PerformanceHud } from '../ui/PerformanceHud';
import { recordDeath, recordKill, getSession } from '../auth/playerSession';
import type { GameJoinIntent } from '../auth/gameJoin';
import { WorldBuilder } from '../world/WorldBuilder';
import { AmmoPickups } from '../world/AmmoPickups';
import type { TerrainBuilder } from '../world/TerrainBuilder';
import type { DroneField } from '../world/DroneField';

export class Game {
  private scene!: THREE.Scene;
  private player!: Player;
  private playerControls!: PlayerControls;
  private network!: NetworkManager;
  private staminaHud = new StaminaHud();
  private ammoHud = new AmmoHud();
  private healthHud = new HealthHud();
  private killFeedHud = new KillFeedHud();
  private performanceHud = new PerformanceHud();
  private messageHud = new MessageHud();
  private ammoPickups!: AmmoPickups;
  private input = new KeyboardInput();
  private pointer = new PointerInput();
  private projectiles!: ProjectileManager;
  private renderContext = new RenderContext();
  private terrain: TerrainBuilder | null = null;
  private droneField: DroneField | null = null;
  private lightBeams: LightBeams | null = null;
  private clock = new THREE.Clock();
  private wasAlive = true;
  private running = false;
  private leaving = false;
  private localCombat: LocalCombatState = {
    hp: 100,
    maxHp: 100,
    alive: true,
    teamId: 0,
    username: 'Player',
  };

  async start(
    username: string,
    joinIntent?: GameJoinIntent | null,
    onConnected?: () => void,
  ): Promise<void> {
    this.initWorld();
    this.initPlayer();
    this.initResize();
    await this.initNetwork(username, joinIntent);
    onConnected?.();
    document.getElementById('blocker')!.hidden = false;
    this.running = true;
    this.loop();
  }

  private async leaveGame(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.running = false;
    this.playerControls.setLeaveEnabled(false);
    this.playerControls.controls.unlock();

    try {
      await this.network.disconnect();
    } catch (error) {
      console.warn('[Game] disconnect failed', error);
    } finally {
      window.location.replace('/lobby.html');
    }
  }

  private initWorld(): void {
    const world = new WorldBuilder()
      .build()
      .withLighting()
      .withTerrain()
      .withLevel()
      .withDrones()
      .withLightBeams();
    this.terrain = world.getTerrain();
    this.droneField = world.getDroneField();
    this.lightBeams = world.getLightBeams();
    this.scene = world.getScene();
    this.projectiles = new ProjectileManager(this.scene);
    this.ammoPickups = new AmmoPickups(this.scene);
  }

  private initPlayer(): void {
    this.player = Player.createLocal();
    const spawn = pickSpawnPoint(0);
    this.player.setEyePosition(spawn.x, EYE_HEIGHT, spawn.z);
    this.player.attachToScene(this.scene);
    this.playerControls = new PlayerControls(this.player.aimRig!);
    this.playerControls.setStaminaHud(this.staminaHud);
    this.playerControls.setAmmoHud(this.ammoHud);
    this.playerControls.setHealthHud(this.healthHud);
    this.playerControls.setKillFeedHud(this.killFeedHud);
    this.playerControls.setLeaveHandler(() => {
      void this.leaveGame();
    });
  }

  private async initNetwork(
    username: string,
    joinIntent?: GameJoinIntent | null,
  ): Promise<void> {
    this.network = new NetworkManager(
      this.scene,
      this.projectiles,
      this.ammoPickups,
      () => {
        this.player.addReserveClip();
        this.messageHud.push('Picked up some ammo');
      },
      (state) => this.handleLocalCombatChange(state),
      (killerName, victimName) => {
        this.killFeedHud.addKill(killerName, victimName);
        const session = getSession();
        if (!session) return;
        if (killerName === session.username) {
          recordKill(session.username);
          this.messageHud.pushKill(victimName);
        }
        if (victimName === session.username) recordDeath(session.username);
      },
    );
    this.network.bindShoot(this.player);
    await this.network.connect(username, joinIntent);
    this.network.applyLocalSpawn(this.player);
  }

  private handleLocalCombatChange(state: LocalCombatState): void {
    if (!state.alive && this.wasAlive) {
      this.messageHud.push('You died');
      this.playerControls.controls.unlock();
    }

    if (state.alive && !this.wasAlive) {
      this.network.applyLocalSpawn(this.player);
    }

    this.wasAlive = state.alive;
    this.localCombat = state;
    this.player.setProjectileSpawnOptions(state.teamId);
    this.healthHud.update(state);
  }

  private initResize(): void {
    window.addEventListener('resize', () => {
      this.player.resize();
      this.renderContext.resize();
    });
  }

  private loop = (): void => {
    if (!this.running) return;

    requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.05);

    const canAct = this.playerControls.isLocked && this.localCombat.alive;

    this.player.update(
      delta,
      this.input,
      this.pointer,
      canAct,
      this.projectiles,
    );
    this.network?.interpolateRemotes(delta, this.player.camera!);
    this.projectiles.update(delta);
    this.network?.update(delta, this.player, this.playerControls);
    this.messageHud.update(delta);
    this.killFeedHud.update(delta);
    const camera = this.player.camera;
    this.terrain?.update(this.clock.getElapsedTime(), {
      playerPos: this.player.object.position,
      cameraPos: camera?.position,
    });
    this.droneField?.update(this.network?.getWorldTime() ?? 0);
    this.lightBeams?.update(this.clock.getElapsedTime());

    if (this.playerControls.isLocked && this.network) {
      this.ammoPickups.tryPickup(
        this.player.object.position.x,
        this.player.object.position.z,
        delta,
      );

      this.staminaHud.update(this.player.getSprintState());
      const ammo = this.player.getAmmoState();
      if (ammo) this.ammoHud.update(ammo);

      this.healthHud.update(this.localCombat);
    }

    updateEdgeLinesForCamera(this.player.camera!);
    this.renderContext.render(this.scene, this.player.camera!);
    this.performanceHud.update(delta, this.renderContext.renderer);
    this.input.endFrame();
    this.pointer.endFrame();
  };
}
