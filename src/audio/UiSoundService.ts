import type { GlobalAudioConfig } from '../content/audioConfig';

interface LoadedUiSound {
  config: GlobalAudioConfig;
  buffer: AudioBuffer;
}

export class UiSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 1;
  private hover: LoadedUiSound | null = null;
  private click: LoadedUiSound | null = null;

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  async preloadHover(config: GlobalAudioConfig): Promise<void> {
    this.hover = await this.loadSound(config);
  }

  async preloadClick(config: GlobalAudioConfig): Promise<void> {
    this.click = await this.loadSound(config);
  }

  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
  }

  playHover(): void {
    this.play(this.hover);
  }

  playClick(): void {
    this.play(this.click);
  }

  private async loadSound(config: GlobalAudioConfig): Promise<LoadedUiSound> {
    this.ensureContext();
    if (!this.context) {
      throw new Error('Audio context unavailable');
    }

    const response = await fetch(config.src);
    if (!response.ok) {
      throw new Error(`Failed to load UI sound: ${config.src}`);
    }

    const data = await response.arrayBuffer();
    const buffer = await this.context.decodeAudioData(data);
    return { config, buffer };
  }

  private play(sound: LoadedUiSound | null): void {
    if (!sound) return;

    this.ensureContext();
    if (!this.context || !this.masterGain) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;

    const gain = this.context.createGain();
    gain.gain.value = sound.config.volume;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  private ensureContext(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.context.destination);
  }
}
