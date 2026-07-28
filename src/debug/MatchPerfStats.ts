/**
 * Gated match diagnostics (`?perf=1` or localStorage `fps_perf=1`).
 * Tracks frame cost, remote pose swaps, patch freshness, and pointer-lock health.
 */

const PERF_QUERY = 'perf';
const PERF_STORAGE_KEY = 'fps_perf';

let enabled: boolean | null = null;

export function isMatchPerfEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PERF_QUERY) === '1' || params.get(PERF_QUERY) === 'true') {
      enabled = true;
      return true;
    }
    if (window.localStorage?.getItem(PERF_STORAGE_KEY) === '1') {
      enabled = true;
      return true;
    }
  } catch {
    // ignore
  }
  enabled = false;
  return false;
}

export interface MatchPerfSnapshot {
  readonly poseSwapsPerSec: number;
  readonly poseClonesPerSec: number;
  readonly poseCrossfadesPerSec: number;
  readonly lastPatchAgeMs: number;
  readonly pointerLocked: boolean;
  readonly pointerLockErrors: number;
  readonly lastPointerLockErrorAgeMs: number;
  readonly connectionOpen: boolean;
  readonly longFramesPerSec: number;
}

const LONG_FRAME_MS = 33;

class MatchPerfStatsImpl {
  private poseSwapWindow: number[] = [];
  private poseCloneWindow: number[] = [];
  private poseCrossfadeWindow: number[] = [];
  private longFrameWindow: number[] = [];
  private lastPatchAtMs = 0;
  private pointerLocked = false;
  private pointerLockErrors = 0;
  private lastPointerLockErrorAtMs = 0;
  private connectionOpen = false;

  recordPoseSwap(): void {
    if (!isMatchPerfEnabled()) return;
    this.poseSwapWindow.push(performance.now());
  }

  recordPoseClone(): void {
    if (!isMatchPerfEnabled()) return;
    this.poseCloneWindow.push(performance.now());
  }

  recordPoseCrossfade(): void {
    if (!isMatchPerfEnabled()) return;
    this.poseCrossfadeWindow.push(performance.now());
  }

  recordFrame(frameMs: number): void {
    if (!isMatchPerfEnabled()) return;
    if (frameMs >= LONG_FRAME_MS) {
      this.longFrameWindow.push(performance.now());
    }
  }

  recordPatch(): void {
    this.lastPatchAtMs = performance.now();
  }

  setPointerLocked(locked: boolean): void {
    this.pointerLocked = locked;
  }

  recordPointerLockError(): void {
    this.pointerLockErrors += 1;
    this.lastPointerLockErrorAtMs = performance.now();
  }

  setConnectionOpen(open: boolean): void {
    this.connectionOpen = open;
  }

  snapshot(): MatchPerfSnapshot {
    const now = performance.now();
    this.prune(this.poseSwapWindow, now);
    this.prune(this.poseCloneWindow, now);
    this.prune(this.poseCrossfadeWindow, now);
    this.prune(this.longFrameWindow, now);
    return {
      poseSwapsPerSec: this.poseSwapWindow.length,
      poseClonesPerSec: this.poseCloneWindow.length,
      poseCrossfadesPerSec: this.poseCrossfadeWindow.length,
      lastPatchAgeMs: this.lastPatchAtMs > 0 ? now - this.lastPatchAtMs : -1,
      pointerLocked: this.pointerLocked,
      pointerLockErrors: this.pointerLockErrors,
      lastPointerLockErrorAgeMs:
        this.lastPointerLockErrorAtMs > 0 ? now - this.lastPointerLockErrorAtMs : -1,
      connectionOpen: this.connectionOpen,
      longFramesPerSec: this.longFrameWindow.length,
    };
  }

  private prune(times: number[], now: number): void {
    const cutoff = now - 1000;
    while (times.length > 0 && times[0]! < cutoff) {
      times.shift();
    }
  }
}

export const MatchPerfStats = new MatchPerfStatsImpl();
