import * as THREE from 'three';
import { WorldBuilder } from '../world/WorldBuilder';
import { KeyboardInput } from '../input/KeyboardInput';
import { NetworkManager } from '../network/NetworkManager';
import { Player } from '../player/Player';
import { PlayerControls } from '../player/PlayerControls';
import { RenderContext } from '../render/RenderContext';

export class Game {
  private scene!: THREE.Scene;
  private player!: Player;
  private playerControls!: PlayerControls;
  private network!: NetworkManager;
  private input = new KeyboardInput();
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
  }

  private initPlayer(): void {
    this.player = Player.createLocal();
    this.player.attachToScene(this.scene);
    this.playerControls = new PlayerControls(this.player.camera!);
  }
  private initNetwork(): void {
    this.network = new NetworkManager(this.scene);
    this.network.connect().catch((error) => {
      console.warn('[Network] offline — start server with: npm run dev:server', error);
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

    this.player.update(delta, this.input, this.playerControls.isLocked);
    this.network.update(delta, this.player, this.playerControls);
    this.renderContext.render(this.scene, this.player.camera!);  };
}
