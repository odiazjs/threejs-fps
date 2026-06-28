import { DEFAULT_DRONE_LOOK_RESPONSE } from '../../shared/world/droneSimulation';

export interface EnvironmentAudioConfig {
  readonly src: string;
  /** Loop gain (0–1, default 0.35). */
  readonly volume: number;
}

export interface DroneProximityAudioConfig {
  readonly src: string;
  /** Loop gain while a drone is in view (0–1). */
  readonly volume: number;
  /** Max distance from the camera to hear a drone (meters). */
  readonly maxDistance: number;
  /** Half-angle cone in front of the camera that counts as "looking at" (degrees). */
  readonly lookAngleDeg: number;
}

export interface FootstepAudioConfig {
  readonly src: string;
  readonly walkVolume: number;
  readonly sprintVolume: number;
  readonly remoteWalkVolume: number;
  readonly remoteSprintVolume: number;
  /** Seconds between steps while walking. */
  readonly walkStepIntervalSec: number;
  /** Seconds between steps while sprinting. */
  readonly sprintStepIntervalSec: number;
  /** Sound playback rate while walking. */
  readonly walkPlaybackRate: number;
  /** Sound playback rate while sprinting. */
  readonly sprintPlaybackRate: number;
  /** Full-volume radius for spatial footsteps (meters). */
  readonly refDistance: number;
  /** Footsteps inaudible beyond this distance (meters). */
  readonly maxHearingDistance: number;
  readonly rolloffFactor: number;
}

export interface GlobalAudioConfig {
  readonly src: string;
  readonly volume: number;
}

export const GAME_ENVIRONMENT_AUDIO: EnvironmentAudioConfig = {
  src: '/sounds/environment2.wav',
  volume: 0.20,
};

export const GAME_DRONE_PROXIMITY_AUDIO: DroneProximityAudioConfig = {
  src: '/sounds/drone2.wav',
  volume: 0.10,
  maxDistance: DEFAULT_DRONE_LOOK_RESPONSE.maxDistance,
  lookAngleDeg: DEFAULT_DRONE_LOOK_RESPONSE.lookAngleDeg,
};

export const GAME_FOOTSTEP_AUDIO: FootstepAudioConfig = {
  src: '/sounds/footstep_grass3.wav',
  walkVolume: 0.45,
  sprintVolume: 0.55,
  remoteWalkVolume: 0.42,
  remoteSprintVolume: 0.5,
  walkStepIntervalSec: 0.45,
  sprintStepIntervalSec: 0.3,
  walkPlaybackRate: 0.95,
  sprintPlaybackRate: 1.15,
  refDistance: 2,
  maxHearingDistance: 22,
  rolloffFactor: 1.15,
};

export const GAME_ENEMY_HIT_IMPACT_AUDIO: GlobalAudioConfig = {
  src: '/sounds/bullet_impact_1.wav',
  volume: 0.10,
};

export const GAME_OUT_OF_AMMO_AUDIO: GlobalAudioConfig = {
  src: '/sounds/out_of_ammo.wav',
  volume: 0.22,
};

export const GAME_KILL_CONFIRM_AUDIO: GlobalAudioConfig = {
  src: '/sounds/kill_confirm_2.wav',
  volume: 0.25,
};

export const GAME_SHIELD_BREAK_AUDIO: GlobalAudioConfig = {
  src: '/sounds/shield_brake_1.wav',
  volume: 0.15,
};

/** Played when the local player breaks an opponent's shield. */
export const GAME_SHIELD_BREAK_LOCAL_AUDIO: GlobalAudioConfig = {
  src: '/sounds/shield_brake_local_1.wav',
  volume: 0.15,
};

/** Looped while the local player is recharging shield with a charge. */
export const GAME_SHIELD_CHARGE_AUDIO: GlobalAudioConfig = {
  src: '/sounds/shield_charge_1.wav',
  volume: 0.22,
};

/** One-shot when a shield charge finishes recharging. */
export const GAME_SHIELD_CHARGE_END_AUDIO: GlobalAudioConfig = {
  src: '/sounds/shield_charge_end_1.wav',
  volume: 0.28,
};
