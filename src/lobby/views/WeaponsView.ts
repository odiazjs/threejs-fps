import { WeaponsScene } from '../../weapons/WeaponsScene';

export class WeaponsView {
  private scene: WeaponsScene | null = null;

  async mount(): Promise<void> {
    if (this.scene) return;

    const canvasHost = document.getElementById('weapons-canvas')!;
    const picker = document.getElementById('weapons-picker')!;
    this.scene = new WeaponsScene(canvasHost, picker);
    await this.scene.whenReady();
  }

  unmount(): void {
    this.scene?.dispose();
    this.scene = null;
  }
}
