import * as THREE from 'three';
import type {
  WeaponConfig,
  WeaponShotSoundPhase,
  WeaponSoundClip,
  WeaponSoundsConfig,
} from '../../shared/content/weaponConfig';
import type { WeaponSpatialAudioConfig } from '../content/audioConfig';
import {
  clampReverbLevel,
  createArenaReverbImpulse,
  reverbDryWetGains,
} from './reverbBus';

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

interface ResolvedSoundClip {
  url: string;
  volume: number;
  reverbLevel: number;
}

function resolveSoundClip(
  clip: string | WeaponSoundClip | undefined,
  defaultVolume: number,
  defaultReverbLevel = 0,
): ResolvedSoundClip | null {
  if (!clip) return null;

  if (typeof clip === 'string') {
    return {
      url: clip,
      volume: defaultVolume,
      reverbLevel: clampReverbLevel(defaultReverbLevel),
    };
  }

  return {
    url: clip.src,
    volume: clip.volume ?? defaultVolume,
    reverbLevel: clampReverbLevel(clip.reverbLevel ?? defaultReverbLevel),
  };
}

function soundDefaults(sounds: WeaponSoundsConfig): {
  volume: number;
  reverbLevel: number;
} {
  return {
    volume: sounds.volume ?? DEFAULT_VOLUME,
    reverbLevel: clampReverbLevel(sounds.reverbLevel),
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
  dryGain: GainNode;
  wetGain: GainNode;
  panner: PannerNode;
  url: string;
}

export class WeaponSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 1;
  private reverbConvolver: ConvolverNode | null = null;
  private readonly buffers = new Map<string, LoadedSoundBuffer>();
  private autoSource: AudioBufferSourceNode | null = null;
  private autoDryGain: GainNode | null = null;
  private autoWetGain: GainNode | null = null;
  private activeAutoUrl: string | null = null;
  private reloadSource: AudioBufferSourceNode | null = null;
  private readonly remoteAutoFire = new Map<string, RemoteAutoFireNodes>();
  private outOfAmmoConfig: { src: string; volume: number } | null = null;
  private shotEndEchoConfig: { src: string; volume: number } | null = null;
  private spatialConfig: WeaponSpatialAudioConfig | null = null;

  configureSpatial(config: WeaponSpatialAudioConfig): void {
    this.spatialConfig = config;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
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

  async preloadShotEndEcho(config: { src: string; volume: number }): Promise<void> {
    this.shotEndEchoConfig = config;
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

    const defaults = soundDefaults(sounds);
    const clip =
      resolveSoundClip(sounds.singleShot, defaults.volume, defaults.reverbLevel) ??
      resolveSoundClip(sounds.autoShot, defaults.volume, defaults.reverbLevel);
    if (!clip) return;

    this.playOneShot(clip.url, clip.volume, clip.reverbLevel);
  }

  /** Loops the auto clip while the trigger is held (silence trimmed from loop bounds). */
  startAutoFire(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;

    const defaults = soundDefaults(sounds);
    const clip =
      resolveSoundClip(sounds.autoShot, defaults.volume, defaults.reverbLevel) ??
      resolveSoundClip(sounds.singleShot, defaults.volume, defaults.reverbLevel);
    if (!clip) return;

    if (this.activeAutoUrl === clip.url && this.autoSource) return;

    this.stopAutoFire();
    this.ensureContext();
    if (!this.context || !this.masterGain || !this.reverbConvolver) return;

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

    const { dry, wet } = reverbDryWetGains(clip.volume, clip.reverbLevel);
    const dryGain = this.context.createGain();
    dryGain.gain.value = dry;
    const wetGain = this.context.createGain();
    wetGain.gain.value = wet;

    source.connect(dryGain);
    dryGain.connect(this.masterGain);
    source.connect(wetGain);
    wetGain.connect(this.reverbConvolver);
    source.start(0, loaded.autoLoopStart);

    this.autoSource = source;
    this.autoDryGain = dryGain;
    this.autoWetGain = wetGain;
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

  /** Room-tail echo when the local player releases fire after shooting. */
  playShotEndEcho(): void {
    if (!this.shotEndEchoConfig) return;
    this.playOneShot(this.shotEndEchoConfig.src, this.shotEndEchoConfig.volume);
  }

  playReload(sounds: WeaponSoundsConfig | undefined, reloadSec?: number): void {
    if (!sounds) return;

    const defaults = soundDefaults(sounds);
    const clip = resolveSoundClip(sounds.reload, defaults.volume, defaults.reverbLevel);
    if (!clip) return;

    this.stopReload();
    this.ensureContext();
    const loaded = this.buffers.get(clip.url);
    if (!loaded) {
      void this.preload([clip.url]).then(() => {
        const ready = this.buffers.get(clip.url);
        if (!ready) return;
        this.playReloadOneShot(
          clip.url,
          clip.volume,
          reloadPlaybackRate(ready.buffer, reloadSec),
          clip.reverbLevel,
        );
      });
      return;
    }

    this.playReloadOneShot(
      clip.url,
      clip.volume,
      reloadPlaybackRate(loaded.buffer, reloadSec),
      clip.reverbLevel,
    );
  }

  /** Per-shell insert (shotgun) — natural playback, no duration stretch. */
  playReloadPartial(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;
    const defaults = soundDefaults(sounds);
    const clip =
      resolveSoundClip(sounds.reloadPartial, defaults.volume, defaults.reverbLevel) ??
      resolveSoundClip(sounds.reload, defaults.volume, defaults.reverbLevel);
    if (!clip) return;
    this.playReloadInsertClip(clip.url, clip.volume, clip.reverbLevel);
  }

  /** Magazine became full after a shell-style reload. */
  playReloadComplete(sounds: WeaponSoundsConfig | undefined): void {
    if (!sounds) return;
    const defaults = soundDefaults(sounds);
    const clip =
      resolveSoundClip(sounds.reloadComplete, defaults.volume, defaults.reverbLevel) ??
      resolveSoundClip(sounds.reloadPartial, defaults.volume, defaults.reverbLevel) ??
      resolveSoundClip(sounds.reload, defaults.volume, defaults.reverbLevel);
    if (!clip) return;
    this.playReloadInsertClip(clip.url, clip.volume, clip.reverbLevel);
  }

  private playReloadInsertClip(url: string, volume: number, reverbLevel: number): void {
    this.stopReload();
    this.ensureContext();
    const loaded = this.buffers.get(url);
    if (!loaded) {
      void this.preload([url]).then(() => {
        if (!this.buffers.get(url)) return;
        this.playReloadOneShot(url, volume, 1, reverbLevel);
      });
      return;
    }
    this.playReloadOneShot(url, volume, 1, reverbLevel);
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
      const defaults = soundDefaults(sounds);
      // Looping auto only when a dedicated auto clip exists; otherwise remotes
      // hear per-shot SFX from projectile spawns.
      if (!resolveSoundClip(sounds.autoShot, defaults.volume, defaults.reverbLevel)) return;
      this.startRemoteAutoFire(sessionId, sounds, position);
      return;
    }

    const defaults = soundDefaults(sounds);
    const clip =
      resolveSoundClip(sounds.singleShot, defaults.volume, defaults.reverbLevel) ??
      resolveSoundClip(sounds.autoShot, defaults.volume, defaults.reverbLevel);
    if (!clip) return;

    const volume = clip.volume * this.spatialConfig.remoteVolumeScale;
    _shotPos.copy(position);
    this.playSpatialOneShot(clip.url, volume, _shotPos, clip.reverbLevel);
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
    nodes.dryGain.disconnect();
    nodes.wetGain.disconnect();
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

    const defaults = soundDefaults(sounds);
    const clip =
      resolveSoundClip(sounds.autoShot, defaults.volume, defaults.reverbLevel) ??
      resolveSoundClip(sounds.singleShot, defaults.volume, defaults.reverbLevel);
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
    if (!this.context || !this.masterGain || !this.reverbConvolver) return;

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

    const { dry, wet } = reverbDryWetGains(
      clip.volume * this.spatialConfig.remoteVolumeScale,
      clip.reverbLevel,
    );
    const dryGain = this.context.createGain();
    dryGain.gain.value = dry;
    const wetGain = this.context.createGain();
    wetGain.gain.value = wet;

    const panner = this.createSpatialPanner();
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    source.connect(dryGain);
    dryGain.connect(panner);
    source.connect(wetGain);
    wetGain.connect(this.reverbConvolver);
    panner.connect(this.masterGain);
    source.start(0, loaded.autoLoopStart);

    this.remoteAutoFire.set(sessionId, { source, dryGain, wetGain, panner, url: clip.url });
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

  private playReloadOneShot(
    url: string,
    volume: number,
    playbackRate: number,
    reverbLevel: number,
  ): void {
    this.ensureContext();
    if (!this.context || !this.masterGain || !this.reverbConvolver) return;

    const loaded = this.buffers.get(url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;
    const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
    source.playbackRate.value = rate;

    this.connectDryWet(source, volume, reverbLevel, this.masterGain);
    source.onended = () => {
      if (this.reloadSource === source) this.reloadSource = null;
    };
    source.start(0);
    this.reloadSource = source;
  }

  private playOneShot(
    url: string,
    volume: number,
    reverbLevel = 0,
    playbackRate = 1,
  ): void {
    this.ensureContext();
    if (!this.context || !this.masterGain || !this.reverbConvolver) return;

    const loaded = this.buffers.get(url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;
    const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
    source.playbackRate.value = rate;

    this.connectDryWet(source, volume, reverbLevel, this.masterGain);
    source.start();
  }

  private playSpatialOneShot(
    url: string,
    volume: number,
    position: THREE.Vector3,
    reverbLevel = 0,
  ): void {
    this.ensureContext();
    if (!this.context || !this.masterGain || !this.reverbConvolver || !this.spatialConfig) return;

    const loaded = this.buffers.get(url);
    if (!loaded) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;

    const panner = this.createSpatialPanner();
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    const { dry, wet } = reverbDryWetGains(volume, reverbLevel);
    const dryGain = this.context.createGain();
    dryGain.gain.value = dry;
    const wetGain = this.context.createGain();
    wetGain.gain.value = wet;

    source.connect(dryGain);
    dryGain.connect(panner);
    source.connect(wetGain);
    wetGain.connect(this.reverbConvolver);
    panner.connect(this.masterGain);
    source.start();
  }

  private connectDryWet(
    source: AudioBufferSourceNode,
    volume: number,
    reverbLevel: number,
    destination: AudioNode,
  ): void {
    const { dry, wet } = reverbDryWetGains(volume, reverbLevel);
    const dryGain = this.context!.createGain();
    dryGain.gain.value = dry;
    const wetGain = this.context!.createGain();
    wetGain.gain.value = wet;

    source.connect(dryGain);
    dryGain.connect(destination);
    source.connect(wetGain);
    wetGain.connect(this.reverbConvolver!);
  }

  private clearAutoNodes(): void {
    this.autoSource?.disconnect();
    this.autoDryGain?.disconnect();
    this.autoWetGain?.disconnect();
    this.autoSource = null;
    this.autoDryGain = null;
    this.autoWetGain = null;
    this.activeAutoUrl = null;
  }

  private ensureContext(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.context.destination);

    this.reverbConvolver = this.context.createConvolver();
    this.reverbConvolver.buffer = createArenaReverbImpulse(this.context);
    this.reverbConvolver.connect(this.masterGain);
  }
}
