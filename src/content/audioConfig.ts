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

export interface WeaponSpatialAudioConfig {
  /** Full-volume radius for spatial weapon shots (meters). */
  readonly refDistance: number;
  /** Weapon shots inaudible beyond this distance (meters). */
  readonly maxHearingDistance: number;
  readonly rolloffFactor: number;
  /** Multiplier applied on top of each weapon clip volume for remote shots. */
  readonly remoteVolumeScale: number;
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
  remoteWalkVolume: 0.90,
  remoteSprintVolume: 1.25,
  walkStepIntervalSec: 0.45,
  sprintStepIntervalSec: 0.3,
  walkPlaybackRate: 0.95,
  sprintPlaybackRate: 1.15,
  refDistance: 2,
  maxHearingDistance: 22,
  rolloffFactor: 1.15,
};

export const GAME_WEAPON_SPATIAL_AUDIO: WeaponSpatialAudioConfig = {
  refDistance: 4,
  maxHearingDistance: 55,
  rolloffFactor: 1.1,
  remoteVolumeScale: 1.25,
};

export const GAME_ENEMY_HIT_IMPACT_AUDIO: GlobalAudioConfig = {
  src: '/sounds/bullet_impact_1.wav',
  volume: 0.10,
};

export const GAME_OUT_OF_AMMO_AUDIO: GlobalAudioConfig = {
  src: '/sounds/out_of_ammo.wav',
  volume: 0.22,
};

/** Tail / room echo when the player releases fire after shooting. */
export const GAME_SHOT_END_ECHO_AUDIO: GlobalAudioConfig = {
  src: '/sounds/shot_end_echo_fadeout.wav',
  volume: 0.55,
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

export const LOBBY_MUSIC_AUDIO: GlobalAudioConfig = {
  src: '/sounds/lobby_music_1.wav',
  volume: 0.14,
};

export const UI_HOVER_AUDIO: GlobalAudioConfig = {
  src: '/sounds/ui_hover.wav',
  volume: 0.16,
};

export const UI_CLICK_AUDIO: GlobalAudioConfig = {
  src: '/sounds/ui_click.wav',
  volume: 0.22,
};

/** One-shot per countdown second in team deathmatch. */
export const MATCH_COUNTDOWN_TICK_AUDIO: GlobalAudioConfig = {
  src: '/sounds/clock_tick.wav',
  volume: 0.45,
};

/** Plasma Harvest: opponent picked up a harvesting box. */
export const HARVEST_OPP_HAS_BOX_AUDIO: GlobalAudioConfig = {
  src: '/sounds/opp_has_harvesting_box_announce.wav',
  volume: 0.7,
};

/** Plasma Harvest: opponent started installing at their base. */
export const HARVEST_OPP_INSTALLING_BOX_AUDIO: GlobalAudioConfig = {
  src: '/sounds/opp_installing_harvesting_box_announce.wav',
  volume: 0.7,
};

/** Plasma Harvest: local player picked up the enemy harvesting box. */
export const HARVEST_YOU_GOT_BOX_AUDIO: GlobalAudioConfig = {
  src: '/sounds/you_got_harvesting_box_install_it_announce.wav',
  volume: 0.7,
};

/** Plays once when the TDM countdown hits zero / match starts. */
export const MATCH_GAME_START_AUDIO: GlobalAudioConfig = {
  src: '/sounds/game_start_1.wav',
  volume: 0.55,
};

/** Plays once when the TDM results overlay is shown. */
export const MATCH_RESULTS_MUSIC_AUDIO: GlobalAudioConfig = {
  src: '/sounds/Bio_Reclamation_Protocol.mp3',
  volume: 0.1,
};

/** Plays once when a TDM match has 30 seconds remaining. */
export const MATCH_END_30_SECS_AUDIO: GlobalAudioConfig = {
  src: '/sounds/match_end_30_secs.wav',
  volume: 0.6,
};

/** Plays once when a TDM match has 10 seconds remaining. */
export const MATCH_END_10_SECS_AUDIO: GlobalAudioConfig = {
  src: '/sounds/match_end_10_secs.wav',
  volume: 0.6,
};

/** Soft cue while stats swipe in (leaderboard / match results). */
export const STATS_INCOMING_AUDIO: GlobalAudioConfig = {
  src: '/sounds/stats_incoming.wav',
  volume: 0.05,
};

export const GAME_GRENADE_EQUIP_AUDIO: GlobalAudioConfig = {
  src: '/sounds/granade_equip.wav',
  volume: 0.38,
};

export const GAME_GRENADE_THROW_AUDIO: GlobalAudioConfig = {
  src: '/sounds/granade_throw_2.wav',
  volume: 0.42,
};

export const GAME_GRENADE_BOUNCE_AUDIO: GlobalAudioConfig = {
  src: '/sounds/granade_bounce.wav',
  volume: 0.48,
};

export const GAME_GRENADE_EXPLOSION_AUDIO: GlobalAudioConfig = {
  src: '/sounds/granade_explosion.wav',
  volume: 0.62,
};
