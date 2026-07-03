import { STATS_INCOMING_AUDIO, type GlobalAudioConfig } from '../content/audioConfig';

const FADE_OUT_SEC = 1.35;

/**
 * Low-volume stats entrance cue with a linear fade-out.
 * Shared by leaderboard and TDM match results swipe-in animations.
 */
class StatsIncomingSound {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private loadPromise: Promise<void> | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;
  private readonly config: GlobalAudioConfig = STATS_INCOMING_AUDIO;

  play(): void {
    void this.ensureLoaded().then(() => this.start());
  }

  private async ensureLoaded(): Promise<void> {
    if (this.buffer) return;
    if (!this.loadPromise) {
      this.loadPromise = this.load();
    }
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    this.ensureContext();
    if (!this.context) return;

    const response = await fetch(this.config.src);
    if (!response.ok) {
      throw new Error(`Failed to load stats incoming sound: ${this.config.src}`);
    }

    const data = await response.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(data);
  }

  private start(): void {
    this.stop();
    this.ensureContext();
    if (!this.context || !this.buffer) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;

    const gain = this.context.createGain();
    const now = this.context.currentTime;
    const peak = this.config.volume;

    gain.gain.setValueAtTime(peak, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_OUT_SEC);

    source.connect(gain);
    gain.connect(this.context.destination);
    source.onended = () => {
      if (this.activeSource === source) {
        this.activeSource = null;
        this.activeGain = null;
      }
    };

    source.start(now);
    source.stop(now + FADE_OUT_SEC + 0.05);
    this.activeSource = source;
    this.activeGain = gain;
  }

  private stop(): void {
    if (!this.activeSource) return;

    try {
      this.activeSource.stop();
    } catch {
      // Already stopped.
    }

    this.activeSource.disconnect();
    this.activeGain?.disconnect();
    this.activeSource = null;
    this.activeGain = null;
  }

  private ensureContext(): void {
    if (this.context) return;
    this.context = new AudioContext();
  }
}

let shared: StatsIncomingSound | null = null;

export function playStatsIncomingSound(): void {
  if (!shared) {
    shared = new StatsIncomingSound();
  }
  shared.play();
}
