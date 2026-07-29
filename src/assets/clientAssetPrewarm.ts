import * as THREE from 'three';
import { FootstepSoundService } from '../audio/FootstepSoundService';
import { ImpactSoundService } from '../audio/ImpactSoundService';
import { GrenadeSoundService } from '../audio/GrenadeSoundService';
import { LoopingSoundService } from '../audio/LoopingSoundService';
import { MatchSoundService } from '../audio/MatchSoundService';
import { HarvestObjectiveSoundService } from '../audio/HarvestObjectiveSoundService';
import { WeaponSoundService, collectWeaponSoundUrls } from '../audio/WeaponSoundService';
import {
  GAME_DRONE_PROXIMITY_AUDIO,
  GAME_ENEMY_HIT_IMPACT_AUDIO,
  GAME_ENVIRONMENT_AUDIO,
  GAME_FOOTSTEP_AUDIO,
  GAME_GRENADE_EQUIP_AUDIO,
  GAME_GRENADE_THROW_AUDIO,
  GAME_GRENADE_BOUNCE_AUDIO,
  GAME_GRENADE_EXPLOSION_AUDIO,
  GAME_KILL_CONFIRM_AUDIO,
  GAME_OUT_OF_AMMO_AUDIO,
  GAME_SHOT_END_ECHO_AUDIO,
  GAME_SHIELD_BREAK_AUDIO,
  GAME_SHIELD_BREAK_LOCAL_AUDIO,
  GAME_SHIELD_CHARGE_AUDIO,
  GAME_SHIELD_CHARGE_END_AUDIO,
  GAME_WEAPON_SPATIAL_AUDIO,
  LOBBY_MUSIC_AUDIO,
  HARVEST_OPP_HAS_BOX_AUDIO,
  HARVEST_OPP_INSTALLING_BOX_AUDIO,
  HARVEST_YOU_GOT_BOX_AUDIO,
  MATCH_COUNTDOWN_TICK_AUDIO,
  MATCH_END_10_SECS_AUDIO,
  MATCH_END_30_SECS_AUDIO,
  MATCH_GAME_START_AUDIO,
  MATCH_RESULTS_MUSIC_AUDIO,
  UI_CLICK_AUDIO,
  UI_HOVER_AUDIO,
  STATS_INCOMING_AUDIO,
} from '../content/audioConfig';
import { PICKABLE_WEAPON_CONFIGS, KATANA_CONFIG } from '../content/weaponConfig';
import { preloadWeaponMeshes } from '../content/weaponMeshes';
import { preloadGrenadeModel } from '../content/grenadeModel';
import { runShaderPrewarm } from '../combat/prewarmCombatFx';
import { warmHitSplashPool } from '../combat/hitSplashPool';
import { initUiSounds } from '../audio/initMenuAudio';
import {
  loadLobbyCharacterTemplate,
  preloadGameCharacterModels,
} from '../player/characterModel';
import { getPrewarmRenderContext } from './prewarmRenderer';
import {
  isClientAssetPrewarmComplete,
  markClientAssetPrewarmComplete,
} from './clientAssetPrewarmState';

export type ClientAssetPrewarmProgress = (message: string) => void;

async function preloadAllGameAudio(): Promise<void> {
  const weaponSounds = new WeaponSoundService();
  weaponSounds.configureSpatial(GAME_WEAPON_SPATIAL_AUDIO);
  const grenadeSounds = new GrenadeSoundService();
  grenadeSounds.configureSpatial(GAME_WEAPON_SPATIAL_AUDIO);
  const environmentSounds = new LoopingSoundService();
  const droneProximitySounds = new LoopingSoundService();
  const shieldChargeSounds = new LoopingSoundService();
  const footstepSounds = new FootstepSoundService();
  const impactSounds = new ImpactSoundService();
  const matchSounds = new MatchSoundService();
  const harvestObjectiveSounds = new HarvestObjectiveSoundService();

  await Promise.all([
    weaponSounds.preload([
      ...collectWeaponSoundUrls(PICKABLE_WEAPON_CONFIGS),
      ...collectWeaponSoundUrls([KATANA_CONFIG]),
    ]),
    weaponSounds.preloadOutOfAmmo(GAME_OUT_OF_AMMO_AUDIO),
    weaponSounds.preloadShotEndEcho(GAME_SHOT_END_ECHO_AUDIO),
    environmentSounds.preload(GAME_ENVIRONMENT_AUDIO.src),
    droneProximitySounds.preload(GAME_DRONE_PROXIMITY_AUDIO.src),
    shieldChargeSounds.preload(GAME_SHIELD_CHARGE_AUDIO.src),
    footstepSounds.preload(GAME_FOOTSTEP_AUDIO),
    impactSounds.preload(GAME_ENEMY_HIT_IMPACT_AUDIO),
    impactSounds.preloadKillConfirm(GAME_KILL_CONFIRM_AUDIO),
    impactSounds.preloadShieldBreak(GAME_SHIELD_BREAK_AUDIO),
    impactSounds.preloadShieldBreakLocal(GAME_SHIELD_BREAK_LOCAL_AUDIO),
    impactSounds.preloadShieldChargeEnd(GAME_SHIELD_CHARGE_END_AUDIO),
    grenadeSounds.preloadEquip(GAME_GRENADE_EQUIP_AUDIO),
    grenadeSounds.preloadThrow(GAME_GRENADE_THROW_AUDIO),
    grenadeSounds.preloadBounce(GAME_GRENADE_BOUNCE_AUDIO),
    grenadeSounds.preloadExplosion(GAME_GRENADE_EXPLOSION_AUDIO),
    matchSounds.preloadTick(MATCH_COUNTDOWN_TICK_AUDIO),
    matchSounds.preloadGameStart(MATCH_GAME_START_AUDIO),
    matchSounds.preloadEnd30(MATCH_END_30_SECS_AUDIO),
    matchSounds.preloadEnd10(MATCH_END_10_SECS_AUDIO),
    matchSounds.preloadResultsMusic(MATCH_RESULTS_MUSIC_AUDIO),
    harvestObjectiveSounds.preloadHasBox(HARVEST_OPP_HAS_BOX_AUDIO),
    harvestObjectiveSounds.preloadInstalling(HARVEST_OPP_INSTALLING_BOX_AUDIO),
    harvestObjectiveSounds.preloadYouGotBox(HARVEST_YOU_GOT_BOX_AUDIO),
    harvestObjectiveSounds.preloadTick(MATCH_COUNTDOWN_TICK_AUDIO),
    initUiSounds(),
    fetchAudioBuffer(LOBBY_MUSIC_AUDIO.src),
    fetchAudioBuffer(UI_HOVER_AUDIO.src),
    fetchAudioBuffer(UI_CLICK_AUDIO.src),
    fetchAudioBuffer(STATS_INCOMING_AUDIO.src),
  ]);
}

async function fetchAudioBuffer(src: string): Promise<void> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to preload audio: ${src}`);
  }
  await response.arrayBuffer();
}

/**
 * One-time first lobby load: fetch models/audio into the browser cache and
 * compile combat shaders on an offscreen renderer.
 */
export async function runClientAssetPrewarm(
  onProgress: ClientAssetPrewarmProgress = () => {},
): Promise<void> {
  if (isClientAssetPrewarmComplete()) return;

  onProgress('Loading weapon models...');
  await preloadWeaponMeshes();
  await preloadGrenadeModel();

  onProgress('Loading drone model...');
  const { preloadDroneModel } = await import('../content/droneModel');
  await preloadDroneModel();

  onProgress('Loading character models...');
  await Promise.all([
    preloadGameCharacterModels(),
    loadLobbyCharacterTemplate(),
  ]);

  onProgress('Loading audio...');
  await preloadAllGameAudio();

  onProgress('Preparing combat effects...');
  warmHitSplashPool();

  onProgress('Compiling shaders...');
  const { renderer, scene, camera } = getPrewarmRenderContext();
  await runShaderPrewarm(renderer, scene, camera);

  markClientAssetPrewarmComplete();
  onProgress('Assets ready');
}
