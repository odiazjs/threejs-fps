import type {
  WeaponConfig,
  WeaponShotSoundVariant,
  WeaponSoundsConfig,
} from '../../shared/content/weaponConfig';

const DEFAULT_VOLUME = 1;

export function collectWeaponSoundUrls(configs: readonly WeaponConfig[]): string[] {
  const urls = new Set<string>();

  for (const config of configs) {
    const sounds = config.sounds;
    if (!sounds) continue;
    if (sounds.singleShot) urls.add(sounds.singleShot);
    if (sounds.autoShot) urls.add(sounds.autoShot);
  }

  return [...urls];
}

export class WeaponSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();

  async preload(urls: readonly string[]): Promise<void> {
    this.ensureContext();
    if (!this.context) return;

    await Promise.all(
      urls.map(async (url) => {
        if (this.buffers.has(url)) return;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load weapon sound: ${url}`);
        }

        const data = await response.arrayBuffer();
        const buffer = await this.context!.decodeAudioData(data);
        this.buffers.set(url, buffer);
      }),
    );
  }

  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
  }

  playShot(sounds: WeaponSoundsConfig | undefined, variant: WeaponShotSoundVariant): void {
    if (!sounds) return;

    const url =
      variant === 'auto'
        ? (sounds.autoShot ?? sounds.singleShot)
        : sounds.singleShot;
    if (!url) return;

    this.play(url, sounds.volume ?? DEFAULT_VOLUME);
  }

  private play(url: string, volume: number): void {
    this.ensureContext();
    if (!this.context || !this.masterGain) return;

    const buffer = this.buffers.get(url);
    if (!buffer) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  private ensureContext(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.context.destination);
  }
}
