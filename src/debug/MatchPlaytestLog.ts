/**
 * Structured playtest events — JSON lines for grepping match soft-locks / stalls.
 * Always on (cheap); use `?perf=1` HUD for live counters.
 */

export type MatchPlaytestEventType =
  | 'pointer_lock_error'
  | 'pointer_lock_change'
  | 'connection_stall'
  | 'connection_resume'
  | 'pose_root_swap'
  | 'long_frame';

export interface MatchPlaytestEvent {
  readonly t: number;
  readonly type: MatchPlaytestEventType;
  readonly [key: string]: unknown;
}

const recent: MatchPlaytestEvent[] = [];
const MAX_RECENT = 80;

function emit(type: MatchPlaytestEventType, data: Record<string, unknown> = {}): void {
  const event: MatchPlaytestEvent = {
    t: Math.round(performance.now()),
    type,
    ...data,
  };
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  // Structured single-line JSON — easy to filter in DevTools / playtest captures.
  console.info('[match-event]', JSON.stringify(event));
}

export const MatchPlaytestLog = {
  pointerLockError(detail?: string): void {
    emit('pointer_lock_error', detail ? { detail } : {});
  },

  pointerLockChange(locked: boolean): void {
    emit('pointer_lock_change', { locked });
  },

  connectionStall(patchAgeMs: number): void {
    emit('connection_stall', { patchAgeMs: Math.round(patchAgeMs) });
  },

  connectionResume(patchAgeMs: number): void {
    emit('connection_resume', { patchAgeMs: Math.round(patchAgeMs) });
  },

  poseRootSwap(modelFile: string): void {
    emit('pose_root_swap', { modelFile });
  },

  longFrame(frameMs: number): void {
    emit('long_frame', { frameMs: Math.round(frameMs * 10) / 10 });
  },

  recentEvents(): readonly MatchPlaytestEvent[] {
    return recent;
  },
};
