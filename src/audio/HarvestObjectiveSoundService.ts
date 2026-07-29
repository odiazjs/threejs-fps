import type { GlobalAudioConfig } from '../content/audioConfig';
import { getMasterVolume } from './masterVolumeBus';

/**
 * Plasma Harvest objective VO + install countdown ticks.
 * Install ticks start only after the installing announce finishes, and stop
 * when install ends or is interrupted.
 */
export class HarvestObjectiveSoundService {
  private hasUrl: string | null = null;
  private hasVolume = 1;
  private installUrl: string | null = null;
  private installVolume = 1;
  private youGotUrl: string | null = null;
  private youGotVolume = 1;
  private tickUrl: string | null = null;
  private tickVolume = 1;

  private installAudio: HTMLAudioElement | null = null;
  private tickIntervalId: number | null = null;
  /** Bumped to cancel in-flight install announce ? tick handoff. */
  private installGeneration = 0;

  async preloadHasBox(config: GlobalAudioConfig): Promise<void> {
    this.hasUrl = config.src;
    this.hasVolume = config.volume;
    await this.warmUrl(config.src);
  }

  async preloadInstalling(config: GlobalAudioConfig): Promise<void> {
    this.installUrl = config.src;
    this.installVolume = config.volume;
    await this.warmUrl(config.src);
  }

  async preloadYouGotBox(config: GlobalAudioConfig): Promise<void> {
    this.youGotUrl = config.src;
    this.youGotVolume = config.volume;
    await this.warmUrl(config.src);
  }

  async preloadTick(config: GlobalAudioConfig): Promise<void> {
    this.tickUrl = config.src;
    this.tickVolume = config.volume;
    await this.warmUrl(config.src);
  }

  playOpponentHasBox(): void {
    this.playOneShot(this.hasUrl, this.hasVolume);
  }

  playYouGotBox(): void {
    this.playOneShot(this.youGotUrl, this.youGotVolume);
  }

  /** Announce install, then loop clock ticks until {@link stopInstalling}. */
  playOpponentInstalling(): void {
    this.stopInstalling();
    if (!this.installUrl) return;

    const generation = ++this.installGeneration;
    const audio = new Audio(this.installUrl);
    audio.volume = this.scaledVolume(this.installVolume);
    this.installAudio = audio;

    audio.addEventListener(
      'ended',
      () => {
        if (generation !== this.installGeneration) return;
        this.installAudio = null;
        this.startTicks();
      },
      { once: true },
    );

    void audio.play().catch(() => {
      if (generation !== this.installGeneration) return;
      // Autoplay blocked  still try ticks so the cue isn't totally lost.
      this.startTicks();
    });
  }

  /** Stop install announce + countdown ticks (install ended / interrupted). */
  stopInstalling(): void {
    this.installGeneration += 1;
    if (this.installAudio) {
      try {
        this.installAudio.pause();
        this.installAudio.currentTime = 0;
      } catch {
        // Ignore.
      }
      this.installAudio = null;
    }
    this.stopTicks();
  }

  stopAll(): void {
    this.stopInstalling();
  }

  private startTicks(): void {
    this.stopTicks();
    if (!this.tickUrl) return;
    this.playOneShot(this.tickUrl, this.tickVolume);
    this.tickIntervalId = window.setInterval(() => {
      this.playOneShot(this.tickUrl, this.tickVolume);
    }, 1000);
  }

  private stopTicks(): void {
    if (this.tickIntervalId === null) return;
    window.clearInterval(this.tickIntervalId);
    this.tickIntervalId = null;
  }

  private playOneShot(url: string | null, volume: number): void {
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = this.scaledVolume(volume);
    void audio.play().catch(() => {
      // Autoplay blocked until a user gesture unlocks audio.
    });
  }

  private scaledVolume(volume: number): number {
    return Math.max(0, Math.min(1, volume * getMasterVolume()));
  }

  private async warmUrl(src: string): Promise<void> {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load harvest sound: ${src}`);
    }
    await response.arrayBuffer();
  }
}
