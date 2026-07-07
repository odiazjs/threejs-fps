import { TACTICAL_MAP_RENDER_STYLE, MinimapRenderer } from './minimapRenderer';
import type { MinimapLayout, MinimapUpdateState } from './minimapTypes';

export class TacticalMapOverlay {
  private readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly renderer = new MinimapRenderer(TACTICAL_MAP_RENDER_STYLE);

  private layout: MinimapLayout | null = null;
  private mapActive = false;
  private open = false;

  constructor() {
    this.root = document.getElementById('tactical-map-overlay')!;
    this.label = this.root.querySelector('.tactical-map-label')!;
    this.canvas = this.root.querySelector('.tactical-map-canvas') as HTMLCanvasElement;
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
    if (!active) {
      this.open = false;
    }
    this.applyVisibility();
  }

  isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.applyVisibility();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  update(state: MinimapUpdateState): void {
    if (!this.layout || !this.mapActive || !this.open) return;
    this.renderer.render(this.ctx, state);
  }

  private applyVisibility(): void {
    this.root.hidden = !this.mapActive || !this.open || !this.layout;
  }
}
