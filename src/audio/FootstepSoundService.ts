import * as THREE from 'three';
import type { FootstepAudioConfig } from '../content/audioConfig';

const _listenerPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export interface RemoteFootstepLocomotion {
  isWalking: boolean;
  isSprinting: boolean;
  isJumping: boolean;
  isSliding?: boolean;
}

export class FootstepSoundService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private config: FootstepAudioConfig | null = null;
  private localStepTimer = 0;
  private readonly remoteStepTimers = new Map<string, number>();

  async preload(config: FootstepAudioConfig): Promise<void> {
    this.config = config;
    this.ensureContext();
    if (!this.context || this.buffer) return;

    const response = await fetch(config.src);
    if (!response.ok) {
      throw new Error(`Failed to load footstep sound: ${config.src}`);
    }

    const data = await response.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(data);
  }

  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
  }

  updateLocal(delta: number, active: boolean, sprinting: boolean): void {
    if (!active || !this.config) {
      this.localStepTimer = 0;
      return;
    }

    this.localStepTimer += delta;
    const interval = sprinting
      ? this.config.sprintStepIntervalSec
      : this.config.walkStepIntervalSec;
    if (this.localStepTimer < interval) return;

    this.localStepTimer -= interval;
    this.playLocal(sprinting);
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

    listener.setPosition(_listenerPos.x, _listenerPos.y, _listenerPos.z);
    listener.setOrientation(
      _forward.x,
      _forward.y,
      _forward.z,
      _up.x,
      _up.y,
      _up.z,
    );
  }

  updateRemote(
    sessionId: string,
    delta: number,
    position: THREE.Vector3,
    listenerPosition: THREE.Vector3,
    locomotion: RemoteFootstepLocomotion,
  ): void {
    if (!this.config) return;

    const moving =
      !locomotion.isJumping &&
      !locomotion.isSliding &&
      (locomotion.isWalking || locomotion.isSprinting);
    if (!moving) {
      this.remoteStepTimers.delete(sessionId);
      return;
    }

    const distance = listenerPosition.distanceTo(position);
    if (distance > this.config.maxHearingDistance) {
      this.remoteStepTimers.delete(sessionId);
      return;
    }

    const sprinting = locomotion.isSprinting;
    const interval = sprinting
      ? this.config.sprintStepIntervalSec
      : this.config.walkStepIntervalSec;

    let timer = this.remoteStepTimers.get(sessionId) ?? 0;
    timer += delta;
    if (timer < interval) {
      this.remoteStepTimers.set(sessionId, timer);
      return;
    }

    timer -= interval;
    this.remoteStepTimers.set(sessionId, timer);
    this.playSpatial(position, sprinting);
  }

  removeRemote(sessionId: string): void {
    this.remoteStepTimers.delete(sessionId);
  }

  reset(): void {
    this.localStepTimer = 0;
  }

  resetRemotes(): void {
    this.remoteStepTimers.clear();
  }

  /** @deprecated Use updateLocal. */
  update(delta: number, active: boolean, sprinting: boolean): void {
    this.updateLocal(delta, active, sprinting);
  }

  private playLocal(sprinting: boolean): void {
    if (!this.config || !this.buffer) return;
    this.ensureContext();
    if (!this.context || !this.masterGain) return;
    if (this.context.state === 'suspended') void this.context.resume();

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = sprinting
      ? this.config.sprintPlaybackRate
      : this.config.walkPlaybackRate;

    const gain = this.context.createGain();
    gain.gain.value = sprinting ? this.config.sprintVolume : this.config.walkVolume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  private playSpatial(position: THREE.Vector3, sprinting: boolean): void {
    if (!this.config || !this.buffer) return;
    this.ensureContext();
    if (!this.context || !this.masterGain) return;
    if (this.context.state === 'suspended') void this.context.resume();

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = sprinting
      ? this.config.sprintPlaybackRate
      : this.config.walkPlaybackRate;

    const gain = this.context.createGain();
    gain.gain.value = sprinting
      ? this.config.remoteSprintVolume
      : this.config.remoteWalkVolume;

    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.config.refDistance;
    panner.maxDistance = this.config.maxHearingDistance;
    panner.rolloffFactor = this.config.rolloffFactor;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);
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
