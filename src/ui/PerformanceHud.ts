import type { WebGLRenderer } from 'three';
import {
  isMatchPerfEnabled,
  MatchPerfStats,
} from '../debug/MatchPerfStats';
import { MatchPlaytestLog } from '../debug/MatchPlaytestLog';

const FPS_SAMPLE_SEC = 0.5;
const WORST_WINDOW_SEC = 2;
const TIME_SAMPLE_SEC = 2;
const LONG_FRAME_LOG_MS = 50;
const LONG_FRAME_LOG_COOLDOWN_MS = 1000;

export class PerformanceHud {
  private readonly root: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly frameEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly worstEl: HTMLElement;
  private readonly gpuEl: HTMLElement;
  private readonly swapEl: HTMLElement | null;
  private readonly patchEl: HTMLElement | null;
  private readonly lockEl: HTMLElement | null;
  private readonly longEl: HTMLElement | null;
  private readonly diagnosticsEnabled: boolean;

  private frameAccumulator = 0;
  private frameCount = 0;
  private fps = 0;
  private worstMs = 0;
  private worstInWindow = 0;
  private worstWindow = 0;
  private simTimeAccum = 0;
  private wallSampleStartMs = 0;
  private timeScale = 1;
  private lastLongFrameLogMs = 0;

  constructor() {
    this.diagnosticsEnabled = isMatchPerfEnabled();
    this.root = document.createElement('div');
    this.root.id = 'perf-hud';
    this.root.className = 'hud-panel game-perf-hud';

    this.fpsEl = this.createRow('FPS', 'game-perf-value');
    this.frameEl = this.createRow('FRAME', 'game-perf-meta');
    this.timeEl = this.createRow('TIME', 'game-perf-meta');
    this.worstEl = this.createRow('WORST', 'game-perf-meta');
    this.gpuEl = this.createRow('GPU', 'game-perf-meta');

    const rows: HTMLElement[] = [
      this.fpsEl.parentElement!,
      this.frameEl.parentElement!,
      this.timeEl.parentElement!,
      this.worstEl.parentElement!,
      this.gpuEl.parentElement!,
    ];

    if (this.diagnosticsEnabled) {
      this.swapEl = this.createRow('SWAPS', 'game-perf-meta');
      this.patchEl = this.createRow('PATCH', 'game-perf-meta');
      this.lockEl = this.createRow('LOCK', 'game-perf-meta');
      this.longEl = this.createRow('LONG', 'game-perf-meta');
      rows.push(
        this.swapEl.parentElement!,
        this.patchEl.parentElement!,
        this.lockEl.parentElement!,
        this.longEl.parentElement!,
      );
    } else {
      this.swapEl = null;
      this.patchEl = null;
      this.lockEl = null;
      this.longEl = null;
    }

    this.root.append(...rows);
    document.body.appendChild(this.root);
  }

  private createRow(label: string, valueClass: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'game-perf-row';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = valueClass;

    row.append(labelEl, valueEl);
    return valueEl;
  }

  update(delta: number, renderer?: WebGLRenderer): void {
    const frameMs = delta * 1000;
    if (this.diagnosticsEnabled) {
      MatchPerfStats.recordFrame(frameMs);
      if (frameMs >= LONG_FRAME_LOG_MS) {
        const now = performance.now();
        if (now - this.lastLongFrameLogMs >= LONG_FRAME_LOG_COOLDOWN_MS) {
          this.lastLongFrameLogMs = now;
          MatchPlaytestLog.longFrame(frameMs);
        }
      }
    }
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

    if (this.wallSampleStartMs === 0) {
      this.wallSampleStartMs = performance.now();
    }
    this.simTimeAccum += delta;
    const wallSec = (performance.now() - this.wallSampleStartMs) / 1000;
    if (wallSec >= TIME_SAMPLE_SEC) {
      this.timeScale = wallSec > 0 ? this.simTimeAccum / wallSec : 1;
      this.simTimeAccum = 0;
      this.wallSampleStartMs = performance.now();
    }

    const stable = this.fps >= 55;
    const warn = this.fps >= 45 && !stable;
    this.fpsEl.textContent = `${this.fps.toFixed(0)}`;
    this.fpsEl.classList.toggle('game-perf-value--stable', stable);
    this.fpsEl.classList.toggle('game-perf-value--neutral', warn);
    this.fpsEl.classList.toggle('game-perf-value--warn', !stable && !warn);

    this.frameEl.textContent = `${frameMs.toFixed(1)} MS`;
    this.timeEl.textContent = `${this.timeScale.toFixed(2)}×`;
    this.timeEl.classList.toggle(
      'game-perf-value--warn',
      this.timeScale < 0.95 || this.timeScale > 1.05,
    );
    this.worstEl.textContent = `${this.worstMs.toFixed(1)} MS (2S)`;

    if (renderer) {
      const { calls, triangles } = renderer.info.render;
      this.gpuEl.textContent = `${calls} DRAWS · ${(triangles / 1000).toFixed(0)}K TRIS`;
    } else {
      this.gpuEl.textContent = '—';
    }

    if (!this.diagnosticsEnabled) return;

    const snap = MatchPerfStats.snapshot();
    if (this.swapEl) {
      this.swapEl.textContent =
        `${snap.poseSwapsPerSec}/S · ${snap.poseCrossfadesPerSec} XF · ${snap.poseClonesPerSec} CLONE`;
      this.swapEl.classList.toggle('game-perf-value--warn', snap.poseSwapsPerSec > 2);
    }
    if (this.patchEl) {
      const age = snap.lastPatchAgeMs;
      this.patchEl.textContent = age < 0 ? '—' : `${age.toFixed(0)} MS`;
      this.patchEl.classList.toggle('game-perf-value--warn', age > 500);
    }
    if (this.lockEl) {
      this.lockEl.textContent = snap.pointerLocked
        ? 'ON'
        : `OFF · E${snap.pointerLockErrors}`;
      this.lockEl.classList.toggle('game-perf-value--warn', !snap.pointerLocked);
    }
    if (this.longEl) {
      this.longEl.textContent = `${snap.longFramesPerSec}/S`;
      this.longEl.classList.toggle('game-perf-value--warn', snap.longFramesPerSec > 2);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
