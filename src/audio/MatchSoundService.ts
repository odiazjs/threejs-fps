import type { GlobalAudioConfig } from '../content/audioConfig';
import { getMasterVolume } from './masterVolumeBus';

interface LoadedSound {
  config: GlobalAudioConfig;
  buffer: AudioBuffer;
}

/**
 * Match UI audio: countdown ticks use HTMLAudioElement (reliable one-shots),
 * results music uses Web Audio for volume control.
 */
export class MatchSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 1;
  private tickUrl: string | null = null;
  private tickVolume = 1;
  private gameStartUrl: string | null = null;
  private gameStartVolume = 1;
  private end30Url: string | null = null;
  private end30Volume = 1;
  private end10Url: string | null = null;
  private end10Volume = 1;
  private tickPrimed = false;
  private resultsMusic: LoadedSound | null = null;
  private resultsSource: AudioBufferSourceNode | null = null;

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  async preloadTick(config: GlobalAudioConfig): Promise<void> {
    this.tickUrl = config.src;
    this.tickVolume = config.volume;
    await this.warmUrl(config.src);
  }

  async preloadGameStart(config: GlobalAudioConfig): Promise<void> {
    this.gameStartUrl = config.src;
    this.gameStartVolume = config.volume;
    await this.warmUrl(config.src);
  }

  async preloadEnd30(config: GlobalAudioConfig): Promise<void> {
    this.end30Url = config.src;
    this.end30Volume = config.volume;
    await this.warmUrl(config.src);
  }

  async preloadEnd10(config: GlobalAudioConfig): Promise<void> {
    this.end10Url = config.src;
    this.end10Volume = config.volume;
    await this.warmUrl(config.src);
  }

  async preloadResultsMusic(config: GlobalAudioConfig): Promise<void> {
    this.resultsMusic = await this.loadSound(config);
  }

  /** Call from a user-gesture handler (click-to-play) before countdown ticks. */
  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
    this.primeTickAudio();
  }

  playTick(): void {
    this.playHtml(this.tickUrl, this.tickVolume);
  }

  playGameStart(): void {
    this.playHtml(this.gameStartUrl, this.gameStartVolume);
  }

  playEnd30(): void {
    this.playHtml(this.end30Url, this.end30Volume);
  }

  playEnd10(): void {
    this.playHtml(this.end10Url, this.end10Volume);
  }

  private playHtml(url: string | null, volume: number): void {
    if (!url) return;

    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume * getMasterVolume()));
    void audio.play().catch(() => {
      // Autoplay blocked until unlock() runs from a user gesture.
    });
  }

  private async warmUrl(src: string): Promise<void> {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load match sound: ${src}`);
    }
    await response.arrayBuffer();
  }

  private primeTickAudio(): void {
    if (!this.tickUrl || this.tickPrimed) return;

    const audio = new Audio(this.tickUrl);
    audio.volume = 0;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        this.tickPrimed = true;
      })
      .catch(() => {
        // Gesture may not be active yet.
      });
  }

  playResultsMusic(): void {
    this.stopResultsMusic();
    if (!this.resultsMusic) return;

    void this.playBuffer(this.resultsMusic, false).then((source) => {
      this.resultsSource = source;
      if (source) {
        source.onended = () => {
          if (this.resultsSource === source) {
            this.resultsSource = null;
          }
        };
      }
    });
  }

  stopResultsMusic(): void {
    if (!this.resultsSource) return;

    try {
      this.resultsSource.stop();
    } catch {
      // Already stopped.
    }

    this.resultsSource.disconnect();
    this.resultsSource = null;
  }

  private async playBuffer(
    sound: LoadedSound,
    loop: boolean,
  ): Promise<AudioBufferSourceNode | null> {
    this.ensureContext();
    if (!this.context || !this.masterGain) return null;

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return null;
      }
    }

    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;
    source.loop = loop;

    const gain = this.context.createGain();
    gain.gain.value = sound.config.volume;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    return source;
  }

  private async loadSound(config: GlobalAudioConfig): Promise<LoadedSound> {
    this.ensureContext();
    if (!this.context) {
      throw new Error('Audio context unavailable');
    }

    const response = await fetch(config.src);
    if (!response.ok) {
      throw new Error(`Failed to load match sound: ${config.src}`);
    }

    const data = await response.arrayBuffer();
    const buffer = await this.context.decodeAudioData(data);
    return { config, buffer };
  }

  private ensureContext(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.context.destination);
  }
}
