import * as THREE from 'three';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { pickSpawnPoint } from '../../shared/level/kiloSectorColliders';
import { KeyboardInput } from '../input/KeyboardInput';
import { PointerInput } from '../input/PointerInput';
import { ProjectileManager } from '../combat/ProjectileManager';
import { NetworkManager } from '../network/NetworkManager';
import { Player } from '../player/Player';
import { PlayerControls } from '../player/PlayerControls';
import { RenderContext } from '../render/RenderContext';
import { StaminaHud } from '../ui/StaminaHud';
import { AmmoHud } from '../ui/AmmoHud';
import { MessageHud } from '../ui/MessageHud';
import { WorldBuilder } from '../world/WorldBuilder';
import { AmmoPickups } from '../world/AmmoPickups';

export class Game {
  private scene!: THREE.Scene;
  private player!: Player;
  private playerControls!: PlayerControls;
  private network!: NetworkManager;
  private staminaHud = new StaminaHud();
  private ammoHud = new AmmoHud();
  private messageHud = new MessageHud();
  private ammoPickups!: AmmoPickups;
  private input = new KeyboardInput();
  private pointer = new PointerInput();
  private projectiles!: ProjectileManager;
  private renderContext = new RenderContext();
  private clock = new THREE.Clock();

  start(): void {
    this.initWorld();
    this.initPlayer();
    this.initNetwork();
    this.initResize();
    this.loop();
  }

  private initWorld(): void {
    this.scene = new WorldBuilder()
      .build()
      .withLighting()
      .withLevel()
      .getScene();
    this.projectiles = new ProjectileManager(this.scene);
    this.ammoPickups = new AmmoPickups(this.scene);
  }

  private initPlayer(): void {
    this.player = Player.createLocal();
    const spawn = pickSpawnPoint(0);
    this.player.setEyePosition(spawn.x, EYE_HEIGHT, spawn.z);
    this.player.attachToScene(this.scene);
    this.playerControls = new PlayerControls(this.player.camera!);
    this.playerControls.setStaminaHud(this.staminaHud);
    this.playerControls.setAmmoHud(this.ammoHud);
  }
  private initNetwork(): void {
    this.network = new NetworkManager(
      this.scene,
      this.projectiles,
      this.ammoPickups,
      () => {
        this.player.addReserveClip();
        this.messageHud.push('Picked up some ammo');
      },
    );
    this.network.bindShoot(this.player);
    this.network.connect().then(() => {
      this.network.applyLocalSpawn(this.player);
    }).catch((error) => {
      console.warn('[Network] offline — start server with: npm run dev:server', error);
      this.ammoPickups.bindNetwork(null, () => {
        this.player.addReserveClip();
        this.messageHud.push('Picked up some ammo');
      });
    });
  }

  private initResize(): void {
    window.addEventListener('resize', () => {
      this.player.resize();
      this.renderContext.resize();
    });
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.05);

    this.player.update(
      delta,
      this.input,
      this.pointer,
      this.playerControls.isLocked,
      this.projectiles,
    );
    this.projectiles.update(delta);
    this.network.update(delta, this.player, this.playerControls);
    this.messageHud.update(delta);
    if (this.playerControls.isLocked) {
      this.ammoPickups.tryPickup(
        this.player.object.position.x,
        this.player.object.position.z,
        delta,
      );

      this.staminaHud.update(this.player.getSprintState());
      const ammo = this.player.getAmmoState();
      if (ammo) this.ammoHud.update(ammo);
    }
    this.renderContext.render(this.scene, this.player.camera!);
    this.input.endFrame();
    this.pointer.endFrame();
  };
}
