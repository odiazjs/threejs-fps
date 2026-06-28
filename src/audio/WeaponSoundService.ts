import type {
  WeaponConfig,
  WeaponSoundClip,
  WeaponSoundsConfig,
} from '../../shared/content/weaponConfig';

const DEFAULT_VOLUME = 1;
/** Samples below this amplitude are treated as silence when trimming auto loops. */
const SILENCE_THRESHOLD = 0.008;
const MIN_SILENCE_RUN_SEC = 0.012;
const LOOP_END_PAD_SEC = 0.004;

interface LoadedSoundBuffer {
  buffer: AudioBuffer;
  autoLoopStart: number;
  autoLoopEnd: number;
}

function resolveSoundClip(
  clip: string | WeaponSoundClip | undefined,
  defaultVolume: number,
): { url: string; volume: number } | null {
  if (!clip) return null;

  if (typeof clip === 'string') {
    return { url: clip, volume: defaultVolume };
  }

  return {
    url: clip.src,
    volume: clip.volume ?? defaultVolume,
  };
}

function addSoundUrl(urls: Set<string>, clip: string | WeaponSoundClip | undefined): void {
  if (!clip) return;
  urls.add(typeof clip === 'string' ? clip : clip.src);
}

function findAudibleBounds(data: Float32Array, sampleRate: number): { start: number; end: number } {
  const minSilentRun = Math.max(1, Math.floor(sampleRate * MIN_SILENCE_RUN_SEC));
  let start = 0;
  let end = data.length - 1;

  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]!) > SILENCE_THRESHOLD) {
      start = i;
      break;
    }
  }

  for (let i = data.length - 1; i >= 0; i--) {
    if (Math.abs(data[i]!) > SILENCE_THRESHOLD) {
      end = i;
      break;
    }
  }

  // Trim a trailing run of near-silence even if a few samples spike earlier.
  let silentRun = 0;
  for (let i = end; i >= start; i--) {
    if (Math.abs(data[i]!) <= SILENCE_THRESHOLD) {
      silentRun += 1;
      if (silentRun >= minSilentRun) {
        end = i + silentRun - minSilentRun;
        break;
      }
      continue;
    }
    silentRun = 0;
  }

  if (end <= start) {
    return { start: 0, end: data.length - 1 };
  }

  return { start, end };
}

function computeAutoLoopRegion(buffer: AudioBuffer): { loopStart: number; loopEnd: number } {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const { start, end } = findAudibleBounds(data, sampleRate);
  const padSamples = Math.floor(sampleRate * LOOP_END_PAD_SEC);

  const loopStart = start / sampleRate;
  const loopEnd = Math.min(buffer.duration, (end + padSamples + 1) / sampleRate);

  if (loopEnd - loopStart < 0.05) {
    return { loopStart: 0, loopEnd: buffer.duration };
  }

  return { loopStart, loopEnd };
}

export function collectWeaponSoundUrls(configs: readonly WeaponConfig[]): string[] {
  const urls = new Set<string>();

  for (const config of configs) {
    const sounds = config.sounds;
    if (!sounds) continue;
    addSoundUrl(urls, sounds.singleShot);
    addSoundUrl(urls, sounds.autoShot);
    addSoundUrl(urls, sounds.reload);
  }

  return [...urls];
}

export class WeaponSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly buffers = new Map<string, LoadedSoundBuffer>();
  private autoSource: AudioBufferSourceNode | null = null;
  private autoGain: GainNode | null = null;
  private activeAutoUrl: string | null = null;
  private outOfAmmoConfig: { src: string; volume: number } | null = null;

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
        const { loopStart, loopEnd } = computeAutoLoopRegion(buffer);
        this.buffers.set(url, { buffer, autoLoopStart: loopStart, autoLoopEnd: loopEnd });
      }),
    );
  }

  async preloadOutOfAmmo(config: { src: string; volume: number }): Promise<void> {
    this.outOfAmmoConfig = config;
    await this.preload([config.src]);
  }

  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
  }

  playSingleShot(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;

    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip =
      resolveSoundClip(sounds.singleShot, defaultVolume) ??
      resolveSoundClip(sounds.autoShot, defaultVolume);
    if (!clip) return;

    this.playOneShot(clip.url, clip.volume);
  }

  /** Loops the auto clip while the trigger is held (silence trimmed from loop bounds). */
  startAutoFire(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;

    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip =
      resolveSoundClip(sounds.autoShot, defaultVolume) ??
      resolveSoundClip(sounds.singleShot, defaultVolume);
    if (!clip) return;

    if (this.activeAutoUrl === clip.url && this.autoSource) return;

    this.stopAutoFire();
    this.ensureContext();
    if (!this.context || !this.masterGain) return;

    const loaded = this.buffers.get(clip.url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;
    source.loop = true;
    source.loopStart = loaded.autoLoopStart;
    source.loopEnd = loaded.autoLoopEnd;

    const gain = this.context.createGain();
    gain.gain.value = clip.volume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(0, loaded.autoLoopStart);

    this.autoSource = source;
    this.autoGain = gain;
    this.activeAutoUrl = clip.url;
  }

  stopAutoFire(): void {
    if (!this.autoSource) return;

    try {
      this.autoSource.stop();
    } catch {
      // Already stopped.
    }

    this.clearAutoNodes();
  }

  playOutOfAmmo(): void {
    if (!this.outOfAmmoConfig) return;
    this.playOneShot(this.outOfAmmoConfig.src, this.outOfAmmoConfig.volume);
  }

  playReload(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;

    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip = resolveSoundClip(sounds.reload, defaultVolume);
    if (!clip) return;

    this.playOneShot(clip.url, clip.volume);
  }

  private playOneShot(url: string, volume: number): void {
    this.ensureContext();
    if (!this.context || !this.masterGain) return;

    const loaded = this.buffers.get(url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;

    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  private clearAutoNodes(): void {
    this.autoSource?.disconnect();
    this.autoGain?.disconnect();
    this.autoSource = null;
    this.autoGain = null;
    this.activeAutoUrl = null;
  }

  private ensureContext(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.context.destination);
  }
}
