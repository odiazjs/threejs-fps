import * as THREE from 'three';
import type { GlobalAudioConfig, WeaponSpatialAudioConfig } from '../content/audioConfig';

interface LoadedGlobalSound {
  config: GlobalAudioConfig;
  buffer: AudioBuffer;
}

const _listenerPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/** Grenade equip, throw, bounce, and explosion sounds. */
export class GrenadeSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private spatialConfig: WeaponSpatialAudioConfig | null = null;
  private equip: LoadedGlobalSound | null = null;
  private throwSound: LoadedGlobalSound | null = null;
  private bounce: LoadedGlobalSound | null = null;
  private explosion: LoadedGlobalSound | null = null;

  configureSpatial(config: WeaponSpatialAudioConfig): void {
    this.spatialConfig = config;
  }

  async preloadEquip(config: GlobalAudioConfig): Promise<void> {
    this.equip = await this.loadSound(config);
  }

  async preloadThrow(config: GlobalAudioConfig): Promise<void> {
    this.throwSound = await this.loadSound(config);
  }

  async preloadBounce(config: GlobalAudioConfig): Promise<void> {
    this.bounce = await this.loadSound(config);
  }

  async preloadExplosion(config: GlobalAudioConfig): Promise<void> {
    this.explosion = await this.loadSound(config);
  }

  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
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

  playEquip(): void {
    this.playLocal(this.equip);
  }

  playThrow(): void {
    this.playLocal(this.throwSound);
  }

  playBounce(x: number, y: number, z: number, impactSpeed: number): void {
    if (!this.bounce || impactSpeed < 2.2) return;
    const strength = THREE.MathUtils.clamp(impactSpeed / 14, 0.35, 1);
    this.playSpatial(this.bounce, x, y, z, strength);
  }

  playExplosion(x: number, y: number, z: number): void {
    if (!this.explosion) return;
    this.playSpatial(this.explosion, x, y, z, 1);
  }

  private playLocal(sound: LoadedGlobalSound | null): void {
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

  private playSpatial(
    sound: LoadedGlobalSound,
    x: number,
    y: number,
    z: number,
    strength: number,
  ): void {
    this.ensureContext();
    if (!this.context || !this.masterGain || !this.spatialConfig) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;

    const gain = this.context.createGain();
    gain.gain.value = sound.config.volume * strength;

    const panner = this.createSpatialPanner();
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);
    source.start();
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

  private async loadSound(config: GlobalAudioConfig): Promise<LoadedGlobalSound> {
    this.ensureContext();
    if (!this.context) {
      throw new Error('Audio context unavailable');
    }

    const response = await fetch(config.src);
    if (!response.ok) {
      throw new Error(`Failed to load grenade sound: ${config.src}`);
    }

    const data = await response.arrayBuffer();
    const buffer = await this.context.decodeAudioData(data);
    return { config, buffer };
  }

  private ensureContext(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.context.destination);
  }
}
