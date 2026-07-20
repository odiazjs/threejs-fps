import type { GlobalAudioConfig } from '../content/audioConfig';

interface LoadedGlobalSound {
  config: GlobalAudioConfig;
  buffer: AudioBuffer;
}

export class ImpactSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 1;
  private enemyHit: LoadedGlobalSound | null = null;
  private killConfirm: LoadedGlobalSound | null = null;
  private shieldBreak: LoadedGlobalSound | null = null;
  private shieldBreakLocal: LoadedGlobalSound | null = null;
  private shieldChargeEnd: LoadedGlobalSound | null = null;

  async preload(config: GlobalAudioConfig): Promise<void> {
    this.enemyHit = await this.loadSound(config);
  }

  async preloadKillConfirm(config: GlobalAudioConfig): Promise<void> {
    this.killConfirm = await this.loadSound(config);
  }

  async preloadShieldBreak(config: GlobalAudioConfig): Promise<void> {
    this.shieldBreak = await this.loadSound(config);
  }

  async preloadShieldBreakLocal(config: GlobalAudioConfig): Promise<void> {
    this.shieldBreakLocal = await this.loadSound(config);
  }

  async preloadShieldChargeEnd(config: GlobalAudioConfig): Promise<void> {
    this.shieldChargeEnd = await this.loadSound(config);
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
  }

  playEnemyHit(): void {
    this.play(this.enemyHit);
  }

  playKillConfirm(): void {
    this.play(this.killConfirm);
  }

  playShieldBreak(): void {
    this.play(this.shieldBreak);
  }

  playShieldBreakLocal(): void {
    this.play(this.shieldBreakLocal);
  }

  playShieldChargeEnd(): void {
    this.play(this.shieldChargeEnd);
  }

  /** Play at zero gain so the first audible hit does not hitch the audio graph. */
  primeEnemyHit(): void {
    this.playAtGain(this.enemyHit, 0);
  }

  private play(sound: LoadedGlobalSound | null): void {
    if (!sound) return;
    this.playAtGain(sound, sound.config.volume);
  }

  private playAtGain(sound: LoadedGlobalSound | null, gainValue: number): void {
    if (!sound) return;

    this.ensureContext();
    if (!this.context || !this.masterGain) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;

    const gain = this.context.createGain();
    gain.gain.value = gainValue;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  private async loadSound(config: GlobalAudioConfig): Promise<LoadedGlobalSound> {
    this.ensureContext();
    if (!this.context) {
      throw new Error('Audio context unavailable');
    }

    const response = await fetch(config.src);
    if (!response.ok) {
      throw new Error(`Failed to load impact sound: ${config.src}`);
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
