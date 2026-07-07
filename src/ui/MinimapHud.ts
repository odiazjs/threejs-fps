import { MINIMAP_RENDER_STYLE, MinimapRenderer } from './minimapRenderer';
import type { MinimapLayout, MinimapUpdateState } from './minimapTypes';

export class MinimapHud {
  private readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly renderer = new MinimapRenderer(MINIMAP_RENDER_STYLE);

  private layout: MinimapLayout | null = null;
  private mapActive = false;
  private playVisible = false;

  constructor() {
    this.root = document.getElementById('minimap-hud')!;
    this.label = this.root.querySelector('.minimap-label')!;
    this.canvas = this.root.querySelector('.minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  setLayout(layout: MinimapLayout): void {
    this.layout = layout;
    this.label.textContent = layout.label;
    this.renderer.setLayout(layout);
    this.applyVisibility();
  }

  setMapActive(active: boolean): void {
    this.mapActive = active;
    this.applyVisibility();
  }

  setVisible(visible: boolean): void {
    this.playVisible = visible;
    this.applyVisibility();
  }

  update(state: MinimapUpdateState): void {
    if (!this.layout || !this.mapActive || !this.playVisible) return;
    this.renderer.render(this.ctx, state);
  }

  private applyVisibility(): void {
    this.root.hidden = !this.mapActive || !this.playVisible || !this.layout;
  }
}
