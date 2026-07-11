import * as THREE from 'three';
import type {
  WeaponConfig,
  WeaponShotSoundPhase,
  WeaponSoundClip,
  WeaponSoundsConfig,
} from '../../shared/content/weaponConfig';
import type { WeaponSpatialAudioConfig } from '../content/audioConfig';

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

/** Keep reload SFX from becoming unrecognizably fast/slow. */
const MIN_RELOAD_PLAYBACK_RATE = 0.12;
const MAX_RELOAD_PLAYBACK_RATE = 6;

/**
 * Stretch/compress the reload clip so its audible length matches `reloadSec`
 * (Armory reloadTime / catalog reload duration).
 */
function reloadPlaybackRate(
  buffer: AudioBuffer | undefined,
  reloadSec: number | undefined,
): number {
  const sec = Number(reloadSec);
  if (!buffer || !Number.isFinite(sec) || sec <= 0.05) return 1;
  const duration = buffer.duration;
  if (!(duration > 0.05)) return 1;
  const rate = duration / sec;
  return Math.min(MAX_RELOAD_PLAYBACK_RATE, Math.max(MIN_RELOAD_PLAYBACK_RATE, rate));
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

const _listenerPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _shotPos = new THREE.Vector3();

export function collectWeaponSoundUrls(configs: readonly WeaponConfig[]): string[] {
  const urls = new Set<string>();

  for (const config of configs) {
    const sounds = config.sounds;
    if (!sounds) continue;
    addSoundUrl(urls, sounds.singleShot);
    addSoundUrl(urls, sounds.autoShot);
    addSoundUrl(urls, sounds.reload);
    addSoundUrl(urls, sounds.reloadPartial);
    addSoundUrl(urls, sounds.reloadComplete);
  }

  return [...urls];
}

interface RemoteAutoFireNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode;
  url: string;
}

export class WeaponSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly buffers = new Map<string, LoadedSoundBuffer>();
  private autoSource: AudioBufferSourceNode | null = null;
  private autoGain: GainNode | null = null;
  private activeAutoUrl: string | null = null;
  private reloadSource: AudioBufferSourceNode | null = null;
  private readonly remoteAutoFire = new Map<string, RemoteAutoFireNodes>();
  private outOfAmmoConfig: { src: string; volume: number } | null = null;
  private spatialConfig: WeaponSpatialAudioConfig | null = null;

  configureSpatial(config: WeaponSpatialAudioConfig): void {
    this.spatialConfig = config;
  }

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

  playReload(sounds: WeaponSoundsConfig | undefined, reloadSec?: number): void {
    if (!sounds) return;

    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip = resolveSoundClip(sounds.reload, defaultVolume);
    if (!clip) return;

    this.stopReload();
    this.ensureContext();
    const loaded = this.buffers.get(clip.url);
    if (!loaded) {
      // Still attempt play after ensure — preload may race on first reload.
      void this.preload([clip.url]).then(() => {
        const ready = this.buffers.get(clip.url);
        if (!ready) return;
        this.playReloadOneShot(
          clip.url,
          clip.volume,
          reloadPlaybackRate(ready.buffer, reloadSec),
        );
      });
      return;
    }

    this.playReloadOneShot(
      clip.url,
      clip.volume,
      reloadPlaybackRate(loaded.buffer, reloadSec),
    );
  }

  /** Per-shell insert (shotgun) — natural playback, no duration stretch. */
  playReloadPartial(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;
    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip =
      resolveSoundClip(sounds.reloadPartial, defaultVolume) ??
      resolveSoundClip(sounds.reload, defaultVolume);
    if (!clip) return;
    this.playReloadInsertClip(clip.url, clip.volume);
  }

  /** Magazine became full after a shell-style reload. */
  playReloadComplete(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;
    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip =
      resolveSoundClip(sounds.reloadComplete, defaultVolume) ??
      resolveSoundClip(sounds.reloadPartial, defaultVolume) ??
      resolveSoundClip(sounds.reload, defaultVolume);
    if (!clip) return;
    this.playReloadInsertClip(clip.url, clip.volume);
  }

  private playReloadInsertClip(url: string, volume: number): void {
    this.stopReload();
    this.ensureContext();
    const loaded = this.buffers.get(url);
    if (!loaded) {
      void this.preload([url]).then(() => {
        if (!this.buffers.get(url)) return;
        this.playReloadOneShot(url, volume, 1);
      });
      return;
    }
    this.playReloadOneShot(url, volume, 1);
  }

  stopReload(): void {
    if (!this.reloadSource) return;
    try {
      this.reloadSource.stop();
    } catch {
      // Already stopped.
    }
    this.reloadSource.disconnect();
    this.reloadSource = null;
  }

  updateListener(camera: THREE.Camera): void {
    if (!this.context) return;

    camera.updateMatrixWorld(true);
    camera.getWorldPosition(_listenerPos);
    camera.getWorldQuaternion(_quat);
    _forward.set(0, 0, -1).applyQuaternion(_quat);
    _up.set(0, 1, 0).applyQuaternion(_quat);

    const listener = this.context.listener;
    if ('positionX' in listener) {
      listener.positionX.value = _listenerPos.x;
      listener.positionY.value = _listenerPos.y;
      listener.positionZ.value = _listenerPos.z;
      listener.forwardX.value = _forward.x;
      listener.forwardY.value = _forward.y;
      listener.forwardZ.value = _forward.z;
      listener.upX.value = _up.x;
      listener.upY.value = _up.y;
      listener.upZ.value = _up.z;
      return;
    }

    const legacyListener = listener as AudioListener;
    legacyListener.setPosition(_listenerPos.x, _listenerPos.y, _listenerPos.z);
    legacyListener.setOrientation(
      _forward.x,
      _forward.y,
      _forward.z,
      _up.x,
      _up.y,
      _up.z,
    );
  }

  playRemoteShot(
    sessionId: string,
    sounds: WeaponSoundsConfig | undefined,
    phase: WeaponShotSoundPhase,
    position: THREE.Vector3,
  ): void {
    if (phase === 'autoStop') {
      this.stopRemoteAutoFire(sessionId);
      return;
    }

    if (!sounds || !this.spatialConfig) return;

    if (phase === 'autoStart') {
      const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
      // Looping auto only when a dedicated auto clip exists; otherwise remotes
      // hear per-shot SFX from projectile spawns.
      if (!resolveSoundClip(sounds.autoShot, defaultVolume)) return;
      this.startRemoteAutoFire(sessionId, sounds, position);
      return;
    }

    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip =
      resolveSoundClip(sounds.singleShot, defaultVolume) ??
      resolveSoundClip(sounds.autoShot, defaultVolume);
    if (!clip) return;

    const volume = clip.volume * this.spatialConfig.remoteVolumeScale;
    _shotPos.copy(position);
    this.playSpatialOneShot(clip.url, volume, _shotPos);
  }

  stopRemoteAutoFire(sessionId: string): void {
    const nodes = this.remoteAutoFire.get(sessionId);
    if (!nodes) return;

    try {
      nodes.source.stop();
    } catch {
      // Already stopped.
    }

    nodes.source.disconnect();
    nodes.gain.disconnect();
    nodes.panner.disconnect();
    this.remoteAutoFire.delete(sessionId);
  }

  updateRemoteAutoFirePositions(
    resolvePosition: (sessionId: string) => THREE.Vector3 | null,
  ): void {
    for (const sessionId of this.remoteAutoFire.keys()) {
      const position = resolvePosition(sessionId);
      if (!position) continue;

      const nodes = this.remoteAutoFire.get(sessionId);
      if (!nodes) continue;

      nodes.panner.positionX.value = position.x;
      nodes.panner.positionY.value = position.y;
      nodes.panner.positionZ.value = position.z;
    }
  }

  private startRemoteAutoFire(
    sessionId: string,
    sounds: WeaponSoundsConfig,
    position: THREE.Vector3,
  ): void {
    if (!this.spatialConfig) return;

    const defaultVolume = sounds.volume ?? DEFAULT_VOLUME;
    const clip =
      resolveSoundClip(sounds.autoShot, defaultVolume) ??
      resolveSoundClip(sounds.singleShot, defaultVolume);
    if (!clip) return;

    const existing = this.remoteAutoFire.get(sessionId);
    if (existing?.url === clip.url) {
      existing.panner.positionX.value = position.x;
      existing.panner.positionY.value = position.y;
      existing.panner.positionZ.value = position.z;
      return;
    }

    this.stopRemoteAutoFire(sessionId);
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
    gain.gain.value = clip.volume * this.spatialConfig.remoteVolumeScale;

    const panner = this.createSpatialPanner();
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);
    source.start(0, loaded.autoLoopStart);

    this.remoteAutoFire.set(sessionId, { source, gain, panner, url: clip.url });
  }

  private createSpatialPanner(): PannerNode {
    const panner = this.context!.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.spatialConfig!.refDistance;
    panner.maxDistance = this.spatialConfig!.maxHearingDistance;
    panner.rolloffFactor = this.spatialConfig!.rolloffFactor;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    return panner;
  }

  private playReloadOneShot(url: string, volume: number, playbackRate: number): void {
    this.ensureContext();
    if (!this.context || !this.masterGain) return;

    const loaded = this.buffers.get(url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;
    const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
    // `.value` is the reliable path across browsers; setValueAtTime alone can no-op.
    source.playbackRate.value = rate;

    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.onended = () => {
      if (this.reloadSource === source) this.reloadSource = null;
    };
    source.start(0);
    this.reloadSource = source;
  }

  private playOneShot(url: string, volume: number, playbackRate = 1): void {
    this.ensureContext();
    if (!this.context || !this.masterGain) return;

    const loaded = this.buffers.get(url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;
    const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
    source.playbackRate.value = rate;

    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  private playSpatialOneShot(url: string, volume: number, position: THREE.Vector3): void {
    this.ensureContext();
    if (!this.context || !this.masterGain || !this.spatialConfig) return;

    const loaded = this.buffers.get(url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;

    const gain = this.context.createGain();
    gain.gain.value = volume;

    const panner = this.createSpatialPanner();
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);
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
