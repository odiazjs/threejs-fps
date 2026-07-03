import type { GlobalAudioConfig } from '../content/audioConfig';

type CueId = 'tick' | 'gameStart';

interface Cue {
  url: string;
  volume: number;
}

/** Match countdown cues; unlock from a lobby click gesture. */
export class CountdownTickPlayer {
  private readonly cues = new Map<CueId, Cue>();
  private primed = false;

  async preload(id: CueId, config: GlobalAudioConfig): Promise<void> {
    const response = await fetch(config.src);
    if (!response.ok) {
      throw new Error(`Failed to load match cue: ${config.src}`);
    }
    await response.arrayBuffer();
    this.cues.set(id, { url: config.src, volume: config.volume });
  }

  /** Call from a user-gesture handler (e.g. lobby Join). */
  unlock(): void {
    if (this.primed) return;

    const cue = this.cues.get('tick') ?? this.cues.values().next().value;
    if (!cue) return;

    const audio = new Audio(cue.url);
    audio.volume = 0;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        this.primed = true;
      })
      .catch(() => {
        // Gesture may not be active.
      });
  }

  playTick(): void {
    this.play('tick');
  }

  playGameStart(): void {
    this.play('gameStart');
  }

  private play(id: CueId): void {
    const cue = this.cues.get(id);
    if (!cue) return;

    const audio = new Audio(cue.url);
    audio.volume = cue.volume;
    void audio.play().catch(() => {
      // Autoplay blocked when not primed from a user gesture.
    });
  }

  get isPrimed(): boolean {
    return this.primed;
  }
}

let sharedPlayer: CountdownTickPlayer | null = null;

export function getCountdownTickPlayer(): CountdownTickPlayer {
  if (!sharedPlayer) {
    sharedPlayer = new CountdownTickPlayer();
  }
  return sharedPlayer;
}

export const FPS_COUNTDOWN_TICK_MESSAGE = 'fps-countdown-tick';
export const FPS_GAME_START_MESSAGE = 'fps-game-start';
export const FPS_LEAVE_GAME_MESSAGE = 'fps-leave-game';
