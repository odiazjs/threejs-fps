import type {
  MinimapBlip,
  MinimapBounds,
  MinimapLayout,
  MinimapUpdateState,
} from './minimapTypes';

export interface MinimapRenderStyle {
  canvasSize: number;
  padding: number;
  crateMinPixels: number;
  gridStep: number;
  blipRadiusSelf: number;
  blipRadiusOther: number;
  wedgeLength: number;
}

export const MINIMAP_RENDER_STYLE: MinimapRenderStyle = {
  canvasSize: 204,
  padding: 9,
  crateMinPixels: 5,
  gridStep: 5,
  blipRadiusSelf: 5.25,
  blipRadiusOther: 4,
  wedgeLength: 16,
};

export const TACTICAL_MAP_RENDER_STYLE: MinimapRenderStyle = {
  canvasSize: 560,
  padding: 24,
  crateMinPixels: 8,
  gridStep: 5,
  blipRadiusSelf: 8,
  blipRadiusOther: 6.5,
  wedgeLength: 28,
};

const BLIP_COLORS: Record<MinimapBlip['kind'], string> = {
  self: '#5ce8ff',
  teammate: '#6aa8ff',
  enemy: '#ff7a62',
  ping: '#00f2ff',
};

export class MinimapRenderer {
  private readonly staticCanvas: HTMLCanvasElement;
  private readonly staticCtx: CanvasRenderingContext2D;
  private layout: MinimapLayout | null = null;

  constructor(private readonly style: MinimapRenderStyle) {
    this.staticCanvas = document.createElement('canvas');
    this.staticCanvas.width = style.canvasSize;
    this.staticCanvas.height = style.canvasSize;
    this.staticCtx = this.staticCanvas.getContext('2d')!;
  }

  setLayout(layout: MinimapLayout | null): void {
    this.layout = layout;
    if (!layout) return;
    this.rebuildStaticLayer(layout);
  }

  render(ctx: CanvasRenderingContext2D, state: MinimapUpdateState): void {
    if (!this.layout) return;

    const { bounds } = this.layout;
    const { canvasSize } = this.style;

    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.drawImage(this.staticCanvas, 0, 0);

    for (const blip of state.blips ?? []) {
      this.drawBlip(ctx, blip, bounds);
    }

    this.drawBlip(
      ctx,
      { x: state.x, z: state.z, kind: 'self', yaw: state.yaw },
      bounds,
    );
  }

  private rebuildStaticLayer(layout: MinimapLayout): void {
    const ctx = this.staticCtx;
    const { canvasSize } = this.style;
    const { bounds, obstacles } = layout;

    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.fillStyle = 'rgba(6, 10, 14, 0.82)';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    this.drawGrid(ctx, bounds);

    for (const obstacle of obstacles) {
      const rect = this.worldRectToCanvas(obstacle, bounds);
      const isCrate = obstacle.kind === 'crate';
      const drawRect = isCrate
        ? this.expandRectToMinSize(rect, this.style.crateMinPixels)
        : rect;

      if (isCrate) {
        ctx.fillStyle = 'rgba(196, 156, 108, 0.42)';
        ctx.strokeStyle = 'rgba(224, 190, 140, 0.62)';
        ctx.lineWidth = 1;
        ctx.fillRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h);
        ctx.strokeRect(drawRect.x + 0.5, drawRect.y + 0.5, drawRect.w - 1, drawRect.h - 1);
        continue;
      }

      ctx.fillStyle = obstacle.tall
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h);
    }

    const border = this.worldRectToCanvas(bounds, bounds);
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(border.x + 0.5, border.y + 0.5, border.w - 1, border.h - 1);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, bounds: MinimapBounds): void {
    const step = this.style.gridStep;
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      const start = this.worldToCanvas(x, bounds.minZ, bounds);
      const end = this.worldToCanvas(x, bounds.maxZ, bounds);
      ctx.beginPath();
      ctx.moveTo(start.x + 0.5, start.y);
      ctx.lineTo(end.x + 0.5, end.y);
      ctx.stroke();
    }

    for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
      const start = this.worldToCanvas(bounds.minX, z, bounds);
      const end = this.worldToCanvas(bounds.maxX, z, bounds);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y + 0.5);
      ctx.lineTo(end.x, end.y + 0.5);
      ctx.stroke();
    }
  }

  private drawBlip(
    ctx: CanvasRenderingContext2D,
    blip: MinimapBlip,
    bounds: MinimapBounds,
  ): void {
    const point = this.worldToCanvas(blip.x, blip.z, bounds);
    const color = BLIP_COLORS[blip.kind];

    if (blip.kind === 'ping') {
      this.drawPingTriangle(ctx, point.x, point.y, color);
      return;
    }

    if (blip.kind === 'self' && blip.yaw != null) {
      this.drawFacingWedge(ctx, point.x, point.y, blip.yaw, color);
    }

    const radius =
      blip.kind === 'self' ? this.style.blipRadiusSelf : this.style.blipRadiusOther;
    ctxBeginCircle(ctx, point.x, point.y, radius);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Downward-pointing neon triangle for team pings. */
  private drawPingTriangle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    const size = this.style.blipRadiusOther * 1.5;

    ctx.beginPath();
    ctx.moveTo(x, y + size);
    ctx.lineTo(x - size * 0.9, y - size);
    ctx.lineTo(x + size * 0.9, y - size);
    ctx.closePath();

    ctx.shadowColor = withAlpha(color, 0.9);
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawFacingWedge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    yaw: number,
    color: string,
  ): void {
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const length = this.style.wedgeLength;
    const spread = 0.42;

    const tipX = x + forwardX * length;
    const tipY = y + forwardZ * length;
    const leftX = x + (forwardX * Math.cos(spread) - forwardZ * Math.sin(spread)) * (length * 0.55);
    const leftY = y + (forwardX * Math.sin(spread) + forwardZ * Math.cos(spread)) * (length * 0.55);
    const rightX = x + (forwardX * Math.cos(-spread) - forwardZ * Math.sin(-spread)) * (length * 0.55);
    const rightY = y + (forwardX * Math.sin(-spread) + forwardZ * Math.cos(-spread)) * (length * 0.55);

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = withAlpha(color, 0.35);
    ctx.fill();
  }

  private expandRectToMinSize(
    rect: { x: number; y: number; w: number; h: number },
    minSize: number,
  ): { x: number; y: number; w: number; h: number } {
    const expanded = { ...rect };

    if (expanded.w < minSize) {
      const centerX = expanded.x + expanded.w / 2;
      expanded.w = minSize;
      expanded.x = centerX - minSize / 2;
    }

    if (expanded.h < minSize) {
      const centerY = expanded.y + expanded.h / 2;
      expanded.h = minSize;
      expanded.y = centerY - minSize / 2;
    }

    return expanded;
  }

  private worldRectToCanvas(
    rect: { minX: number; maxX: number; minZ: number; maxZ: number },
    bounds: MinimapBounds,
  ): { x: number; y: number; w: number; h: number } {
    const topLeft = this.worldToCanvas(rect.minX, rect.minZ, bounds);
    const bottomRight = this.worldToCanvas(rect.maxX, rect.maxZ, bounds);
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y,
    };
  }

  private worldToCanvas(
    worldX: number,
    worldZ: number,
    bounds: MinimapBounds,
  ): { x: number; y: number } {
    const inner = this.style.canvasSize - this.style.padding * 2;
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    const u = spanX > 0 ? (worldX - bounds.minX) / spanX : 0.5;
    const v = spanZ > 0 ? (worldZ - bounds.minZ) / spanZ : 0.5;
    return {
      x: this.style.padding + u * inner,
      y: this.style.padding + v * inner,
    };
  }
}

function ctxBeginCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
