import type { WebGLRenderer } from 'three';

const FPS_SAMPLE_SEC = 0.5;
const WORST_WINDOW_SEC = 2;

export class PerformanceHud {
  private readonly root: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly frameEl: HTMLElement;
  private readonly worstEl: HTMLElement;
  private readonly gpuEl: HTMLElement;

  private frameAccumulator = 0;
  private frameCount = 0;
  private fps = 0;
  private worstMs = 0;
  private worstInWindow = 0;
  private worstWindow = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'perf-hud';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      zIndex: '10000',
      padding: '8px 10px',
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '11px',
      lineHeight: '1.45',
      color: '#d8ffe0',
      background: 'rgba(8, 16, 12, 0.72)',
      border: '1px solid rgba(120, 200, 140, 0.35)',
      borderRadius: '4px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      textAlign: 'right',
    });

    this.fpsEl = document.createElement('div');
    this.frameEl = document.createElement('div');
    this.worstEl = document.createElement('div');
    this.gpuEl = document.createElement('div');
    this.root.append(this.fpsEl, this.frameEl, this.worstEl, this.gpuEl);
    document.body.appendChild(this.root);
  }

  update(delta: number, renderer?: WebGLRenderer): void {
    const frameMs = delta * 1000;
    this.frameCount += 1;
    this.frameAccumulator += delta;
    this.worstInWindow = Math.max(this.worstInWindow, frameMs);
    this.worstWindow += delta;

    if (this.frameAccumulator >= FPS_SAMPLE_SEC) {
      this.fps = this.frameCount / this.frameAccumulator;
      this.frameCount = 0;
      this.frameAccumulator = 0;
    }

    if (this.worstWindow >= WORST_WINDOW_SEC) {
      this.worstMs = this.worstInWindow;
      this.worstInWindow = frameMs;
      this.worstWindow = 0;
    }

    const fpsColor = this.fps >= 55 ? '#9dffb0' : this.fps >= 45 ? '#ffe08a' : '#ff8a8a';
    this.fpsEl.style.color = fpsColor;
    this.fpsEl.textContent = `FPS ${this.fps.toFixed(0)}`;

    this.frameEl.textContent = `Frame ${frameMs.toFixed(1)} ms`;
    this.worstEl.textContent = `Worst ${this.worstMs.toFixed(1)} ms (2s)`;

    if (renderer) {
      const { calls, triangles } = renderer.info.render;
      this.gpuEl.textContent = `Draws ${calls}  Tris ${(triangles / 1000).toFixed(0)}k`;
    } else {
      this.gpuEl.textContent = '';
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
