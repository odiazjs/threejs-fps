import * as THREE from 'three';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { feetYFromNetworkEyeY } from '../../shared/combat/crouch';
import { DEFAULT_MAP_ID, getMapDef, mapHasMinimap, normalizeMapId, setClientMapDef, type MapId } from '../../shared/level/maps';
import {
  getCountdownDisplayValue,
  getMatchTimeRemaining,
  isCompetitiveGameMode,
  isTimedGameMode,
  normalizeGameMode,
  type GameMode,
  type MatchPhase,
} from '../../shared/combat/match';
import { getSelectedMapId } from '../lobby/mapSelection';
import { KeyboardInput } from '../input/KeyboardInput';
import { POINTER_PING, PointerInput } from '../input/PointerInput';
import { TeamPingIndicators } from '../ui/TeamPingIndicators';
import { PingDirectionIndicatorHud } from '../ui/PingDirectionIndicatorHud';
import { readCrosshairWorldRay } from '../combat/aiming';
import { raycastLevelBullets } from '../combat/levelBulletRaycast';
import { TEAM_PING_MAX_DISTANCE } from '../../shared/network/ping';
import { ProjectileManager } from '../combat/ProjectileManager';
import { MatchPerfTracker } from '../combat/MatchPerfTracker';
import { GrenadeManager } from '../combat/GrenadeManager';
import { GrenadeArcPreview } from '../combat/GrenadeArcPreview';
import { computeGrenadeThrowVelocity } from '../../shared/combat/grenadePhysics';
import { GRENADE_FUSE_SEC } from '../../shared/throwables/grenadeConfig';
import { ShieldDomeAbility } from '../combat/ShieldDomeAbility';
import { ShieldDomeManager } from '../combat/ShieldDomeManager';
import { ShieldDomeChargeManager } from '../combat/ShieldDomeChargeManager';
import { NetworkManager } from '../network/NetworkManager';
import type { LocalCombatState } from '../network/types';
import type { PlayerDamagedMessage } from '../../shared/network/damage';
import { getShieldCapacity, canUseShieldCharge } from '../../shared/combat/shield';
import { getShieldRechargeState } from '../../shared/combat/shieldRecharge';
import { getShieldDomeHudState } from '../../shared/combat/shieldDomeAbility';
import { DEFAULT_SHIELD_CHARGES, DEFAULT_GRENADES, MAX_GRENADES, MAX_SHIELD_CHARGES } from '../../shared/inventory/inventoryLimits';
import { Player } from '../player/Player';
import { PlayerControls } from '../player/PlayerControls';
import { RenderContext } from '../render/RenderContext';
import { KillCam } from '../render/KillCam';
import { updateEdgeLinesForCamera } from '../visuals/edgeLines';
import type { LightBeams } from '../world/LightBeams';
import { StaminaHud } from '../ui/StaminaHud';
import { AmmoHud } from '../ui/AmmoHud';
import { MessageHud } from '../ui/MessageHud';
import { HealthHud } from '../ui/HealthHud';
import { TeamHud } from '../ui/TeamHud';
import { KillFeedHud } from '../ui/KillFeedHud';
import { MinimapHud } from '../ui/MinimapHud';
import { TacticalMapOverlay } from '../ui/TacticalMapOverlay';
import { CrosshairHud } from '../ui/CrosshairHud';
import { DamageIndicatorHud } from '../ui/DamageIndicatorHud';
import { GrenadeThreatIndicatorHud } from '../ui/GrenadeThreatIndicatorHud';
import {
  collectNearbyEnemyGrenades,
  type NearbyGrenadeThreat,
} from '../combat/grenadeThreatIndicator';
import type { ActiveGrenadeSnapshot } from '../combat/GrenadeManager';
import { PLAYER_HIT_CAPSULE_HEIGHT } from '../../shared/combat/playerHitbox';
import { InventoryHud } from '../ui/InventoryHud';
import { LoadoutSwitcherHud } from '../ui/LoadoutSwitcherHud';
import { apiListLoadouts } from '../auth/loadoutsApi';
import { apiListWeaponUnlockables } from '../auth/weaponUnlockablesApi';
import { applyLoadoutSightAssignments } from '../content/equippedWeaponSights';
import { ShieldRechargeHud } from '../ui/ShieldRechargeHud';
import { ShieldDomeHud } from '../ui/ShieldDomeHud';
import { ShieldPickupHud } from '../ui/ShieldPickupHud';
import { WeaponPickupHud } from '../ui/WeaponPickupHud';
import { PerformanceHud } from '../ui/PerformanceHud';
import { MatchPerfStats } from '../debug/MatchPerfStats';
import { MatchPlaytestLog } from '../debug/MatchPlaytestLog';
import { loadFiringRangeMinimapLayout } from '../content/firingRangeMinimap';
import { loadTdmMapMinimapLayout } from '../content/tdmMapMinimap';
import { MatchHud, resolveMatchSnapshot } from '../ui/MatchHud';
import { MatchCountdownOverlay } from '../ui/MatchCountdownOverlay';
import { MatchResultsOverlay } from '../ui/MatchResultsOverlay';
import { PreMatchOverlay } from '../ui/PreMatchOverlay';
import { SpeedLinesHud } from '../ui/SpeedLinesHud';
import { getWeaponConfig } from '../content/weaponConfig';
import { apiListMyWeapons } from '../auth/weaponsApi';
import type { WeaponEffectiveStats } from '../../shared/content/weaponUpgrades';
import { shippedEffectiveStats } from '../../shared/content/applyWeaponEffectiveStats';
import { isWeaponId } from '../../shared/content/weaponIds';
import type { GameJoinIntent } from '../auth/gameJoin';
import type { MinimapUpdateState } from '../ui/minimapTypes';
import type { FpsJoinCredentials } from '../auth/joinCredentials';
import { getSession } from '../auth/playerSession';
import { apiSubmitMatchResult } from '../auth/rankApi';
import { buildMatchId } from '../../shared/content/matchRewards';
import { isTrainingBotSessionId } from '../../shared/combat/trainingBots';
import { savePendingMatchXp } from '../lobby/pendingMatchRewards';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { WorldBuilder } from '../world/WorldBuilder';
import { buildClientMapPhysics, disposeClientMapPhysics } from '../physics/buildMapPhysics';
import { AmmoPickups } from '../world/AmmoPickups';
import { GrenadePickups } from '../world/GrenadePickups';
import { ShieldChargePickups } from '../world/ShieldChargePickups';
import { WeaponDrops } from '../world/WeaponDrops';
import { isValidDropSlot, canPickupWeaponDrop } from '../../shared/loadout/loadoutSlots';
import { runShaderPrewarm } from '../combat/prewarmCombatFx';
import { buildCharacterShaderPrewarm } from '../combat/prewarmCharacterFx';
import { initFxLightPool } from '../effects/FxLightPool';
import { preloadGrenadeModel } from '../content/grenadeModel';
import { preloadDroneModel } from '../content/droneModel';
import { preloadWeaponMeshes } from '../content/weaponMeshes';
import { collectWeaponSoundUrls, WeaponSoundService } from '../audio/WeaponSoundService';
import { FootstepSoundService } from '../audio/FootstepSoundService';
import { ImpactSoundService } from '../audio/ImpactSoundService';
import { GrenadeSoundService } from '../audio/GrenadeSoundService';
import { EnvironmentSoundService } from '../audio/EnvironmentSoundService';
import { LoopingSoundService } from '../audio/LoopingSoundService';
import { MatchSoundService } from '../audio/MatchSoundService';
import { subscribeMasterVolume } from '../audio/masterVolumeBus';
import {
  FPS_COUNTDOWN_TICK_MESSAGE,
  FPS_GAME_START_MESSAGE,
  FPS_LEAVE_GAME_MESSAGE,
} from '../audio/CountdownTickPlayer';
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
  MATCH_COUNTDOWN_TICK_AUDIO,
  MATCH_END_10_SECS_AUDIO,
  MATCH_END_30_SECS_AUDIO,
  MATCH_GAME_START_AUDIO,
  MATCH_RESULTS_MUSIC_AUDIO,
} from '../content/audioConfig';
import { DEFAULT_LOADOUT_CONFIGS, PICKABLE_WEAPON_CONFIGS, KATANA_CONFIG } from '../content/weaponConfig';
import type { DroneField } from '../world/DroneField';
import { LoadingOverlay } from '../ui/LoadingOverlay';

const MAX_FRAME_DELTA_SEC = 0.1;
const EMPTY_ROSTER: never[] = [];
const NOOP_PICKUP = (): void => {};
const _grenadeThreatPlayerCenter = new THREE.Vector3();

export class Game {
  private scene!: THREE.Scene;
  private player!: Player;
  private playerControls!: PlayerControls;
  private network!: NetworkManager;
  // Stable pickup-complete handlers — allocating closures per frame in the
  // render loop adds steady GC pressure.
  private readonly onWeaponPickupComplete = (target: { index: number }): void => {
    this.network.sendPickupWeaponDrop(target.index);
  };
  private readonly onShieldPickupComplete = (target: { index: number }): void => {
    this.network.sendPickupShieldCharge(target.index);
  };
  private staminaHud = new StaminaHud();
  private ammoHud = new AmmoHud();
  private healthHud = new HealthHud();
  private teamHud = new TeamHud();
  private killFeedHud = new KillFeedHud();
  private crosshairHud = new CrosshairHud();
  private minimapHud = new MinimapHud();
  private tacticalMapOverlay = new TacticalMapOverlay();
  private damageIndicatorHud = new DamageIndicatorHud();
  private speedLinesHud = new SpeedLinesHud();
  private grenadeThreatHud = new GrenadeThreatIndicatorHud();
  private inventoryHud = new InventoryHud(
    DEFAULT_LOADOUT_CONFIGS.map((config) => ({
      id: config.id,
      name: config.name,
    })),
  );
  private loadoutSwitcherHud = new LoadoutSwitcherHud();
  private loadoutsFetchSeq = 0;
  private shieldRechargeHud = new ShieldRechargeHud();
  private shieldDomeHud = new ShieldDomeHud();
  private weaponPickupHud = new WeaponPickupHud();
  private shieldPickupHud = new ShieldPickupHud();
  private performanceHud = new PerformanceHud();
  private matchHud = new MatchHud();
  private matchCountdownOverlay = new MatchCountdownOverlay();
  private matchResultsOverlay = new MatchResultsOverlay();
  private preMatchOverlay = new PreMatchOverlay();
  private messageHud = new MessageHud();
  private ammoPickups!: AmmoPickups;
  private grenadePickups!: GrenadePickups;
  private shieldChargePickups!: ShieldChargePickups;
  private weaponDrops!: WeaponDrops;
  private grenadeManager!: GrenadeManager;
  private grenadeArcPreview!: GrenadeArcPreview;
  private input = new KeyboardInput();
  private pointer = new PointerInput();
  private teamPings = new TeamPingIndicators();
  private pingDirectionHud = new PingDirectionIndicatorHud();
  private readonly pingRayOrigin = new THREE.Vector3();
  private readonly pingRayDirection = new THREE.Vector3();
  private projectiles!: ProjectileManager;
  private worldBuilder: WorldBuilder | null = null;
  private shieldDomeManager!: ShieldDomeManager;
  private shieldDomeChargeManager!: ShieldDomeChargeManager;
  private shieldDomeAbility: ShieldDomeAbility | null = null;
  private renderContext = new RenderContext();
  private readonly killCam = new KillCam();
  private droneField: DroneField | null = null;
  private lightBeams: LightBeams | null = null;
  private lastFrameMs = 0;
  private simElapsedSec = 0;
  private wasAlive = true;
  private running = false;
  private leaving = false;
  private readonly weaponSounds = new WeaponSoundService();
  private readonly environmentSounds = new EnvironmentSoundService();
  private readonly droneProximitySounds = new LoopingSoundService();
  private readonly shieldChargeSounds = new LoopingSoundService();
  private readonly footstepSounds = new FootstepSoundService();
  private readonly impactSounds = new ImpactSoundService();
  private readonly grenadeSounds = new GrenadeSoundService();
  private readonly matchSounds = new MatchSoundService();
  private masterVolumeUnsub: (() => void) | null = null;
  private audioUnlocked = false;
  private inventoryOpen = false;
  /** While set, ignore stale server loadout snapshots that would undo a Tab switch. */
  private pendingLoadoutApply: {
    loadoutId: string;
    primaryWeaponId: string;
    secondaryWeaponId: string;
  } | null = null;
  private matchEndHandled = false;
  private matchPerf = new MatchPerfTracker();
  private matchResultSubmittedFor: string | null = null;
  /** Latest post-match awards from API (for future results UI). */
  private lastMatchRewards: Awaited<ReturnType<typeof apiSubmitMatchResult>> | null =
    null;

  /** Exposed for upcoming match-results UI; unused until then. */
  getLastMatchRewards(): Awaited<ReturnType<typeof apiSubmitMatchResult>> | null {
    return this.lastMatchRewards;
  }
  private readonly connectionStallEl =
    document.getElementById('connection-stall');
  /** Soft-lock guard: no authoritative patches for this long → pause combat. */
  private static readonly CONNECTION_STALL_MS = 2500;
  private connectionStallLogged = false;
  private matchEnd30Played = false;
  private matchEnd10Played = false;
  private prevMatchPhase: MatchPhase | null = null;
  private lastCountdownTickSec: number | null = null;
  private gameStartSoundPlayed = false;
  private pendingKillerId: string | null = null;
  private lastCombatShooterId: string | null = null;
  private readonly activeGrenadesScratch: ActiveGrenadeSnapshot[] = [];
  private readonly nearbyGrenadeThreatsScratch: NearbyGrenadeThreat[] = [];
  /** Collision + visuals map; never overwritten by server schema defaults after load. */
  private worldMapId: MapId = DEFAULT_MAP_ID;
  private localCombat: LocalCombatState = {
    hp: 100,
    maxHp: 100,
    shieldLevel: 1,
    shieldPoints: getShieldCapacity(1),
    shieldCapacity: getShieldCapacity(1),
    shieldCharges: DEFAULT_SHIELD_CHARGES,
    grenadeCount: DEFAULT_GRENADES,
    shieldRecharging: false,
    shieldRechargeEndAt: 0,
    shieldDomeChargeEndAt: 0,
    shieldDomeEndAt: 0,
    shieldDomeCooldownEndAt: 0,
    alive: true,
    teamId: 0,
    username: 'Player',
  };

  async start(
    credentials: FpsJoinCredentials,
    joinIntent?: GameJoinIntent | null,
    onConnected?: () => void,
    onLoadingMessage?: (message: string) => void,
  ): Promise<void> {
    const initialMapId = normalizeMapId(joinIntent?.mapId ?? getSelectedMapId());
    const competitive = isCompetitiveGameMode(joinIntent?.gameMode);
    this.worldMapId = initialMapId;
    this.prevMatchPhase = null;
    this.matchEnd30Played = false;
    this.matchEnd10Played = false;
    this.matchPerf.endMatch();
    this.matchResultSubmittedFor = null;
    this.lastMatchRewards = null;
    this.bindMasterVolume();

    const reportLoad = (
      message: string,
      step?: 'assets' | 'shaders' | 'sync' | 'finalize',
      progress = 0,
    ): void => {
      if (competitive) {
        if (step) this.preMatchOverlay.setLoadStep(step, progress);
        this.preMatchOverlay.setFooterStatus(message);
      }
      onLoadingMessage?.(message);
    };

    if (competitive) {
      // main.ts may already have painted the roster; keep/refresh it here.
      this.preMatchOverlay.show(
        'Preparing match…',
        joinIntent?.participants ?? [],
      );
    }

    // DroneField clones the FBX at world build — must be ready first.
    reportLoad('Loading drone model…', 'assets', 10);
    await preloadDroneModel();
    this.initWorld(initialMapId);
    this.environmentSounds.configure(GAME_ENVIRONMENT_AUDIO);
    this.droneProximitySounds.setVolume(GAME_DRONE_PROXIMITY_AUDIO.volume);
    this.shieldChargeSounds.setVolume(GAME_SHIELD_CHARGE_AUDIO.volume);
    this.weaponSounds.configureSpatial(GAME_WEAPON_SPATIAL_AUDIO);
    this.grenadeSounds.configureSpatial(GAME_WEAPON_SPATIAL_AUDIO);

    // Weapon/character meshes must exist before Player.createLocal / remotes.
    reportLoad('Loading weapon models…', 'assets', 35);
    await Promise.all([
      preloadWeaponMeshes(),
      Player.preloadGameCharacterModels(),
      preloadGrenadeModel(),
    ]);

    // Stand up player + network next so the pre-match roster can fill while
    // audio / remaining assets finish.
    reportLoad('Loading loadouts…', 'assets', 55);
    await this.refreshLoadoutSwitcher();
    this.initPlayer(initialMapId, joinIntent?.gameMode);
    this.refreshInventoryHud();
    this.applyActiveMap();
    this.initResize();

    reportLoad('Joining match lobby…', 'assets', 80);
    await this.initNetwork(credentials, joinIntent);
    this.applyActiveMap();
    if (competitive) {
      this.preMatchOverlay.update(this.network.getAllPlayers());
    }

    reportLoad('Loading game assets…', 'assets', 70);
    const rosterPumpId = competitive
      ? window.setInterval(() => {
          this.preMatchOverlay.update(this.network.getAllPlayers());
        }, 120)
      : 0;
    try {
      await Promise.all([
        initialMapId === 'firing_range'
          ? this.worldBuilder!.whenMeshCollisionReady()
          : Promise.resolve(),
        this.weaponSounds.preload([
          ...collectWeaponSoundUrls(PICKABLE_WEAPON_CONFIGS),
          ...collectWeaponSoundUrls([KATANA_CONFIG]),
        ]),
        this.weaponSounds.preloadOutOfAmmo(GAME_OUT_OF_AMMO_AUDIO),
        this.weaponSounds.preloadShotEndEcho(GAME_SHOT_END_ECHO_AUDIO),
        this.environmentSounds.preload(GAME_ENVIRONMENT_AUDIO.src),
        this.droneProximitySounds.preload(GAME_DRONE_PROXIMITY_AUDIO.src),
        this.shieldChargeSounds.preload(GAME_SHIELD_CHARGE_AUDIO.src),
        this.footstepSounds.preload(GAME_FOOTSTEP_AUDIO),
        this.impactSounds.preload(GAME_ENEMY_HIT_IMPACT_AUDIO),
        this.impactSounds.preloadKillConfirm(GAME_KILL_CONFIRM_AUDIO),
        this.impactSounds.preloadShieldBreak(GAME_SHIELD_BREAK_AUDIO),
        this.impactSounds.preloadShieldBreakLocal(GAME_SHIELD_BREAK_LOCAL_AUDIO),
        this.impactSounds.preloadShieldChargeEnd(GAME_SHIELD_CHARGE_END_AUDIO),
        this.grenadeSounds.preloadEquip(GAME_GRENADE_EQUIP_AUDIO),
        this.grenadeSounds.preloadThrow(GAME_GRENADE_THROW_AUDIO),
        this.grenadeSounds.preloadBounce(GAME_GRENADE_BOUNCE_AUDIO),
        this.grenadeSounds.preloadExplosion(GAME_GRENADE_EXPLOSION_AUDIO),
        this.matchSounds.preloadTick(MATCH_COUNTDOWN_TICK_AUDIO),
        this.matchSounds.preloadGameStart(MATCH_GAME_START_AUDIO),
        this.matchSounds.preloadEnd30(MATCH_END_30_SECS_AUDIO),
        this.matchSounds.preloadEnd10(MATCH_END_10_SECS_AUDIO),
        this.matchSounds.preloadResultsMusic(MATCH_RESULTS_MUSIC_AUDIO),
        this.shieldChargePickups.whenReady,
        this.grenadePickups.whenReady,
        this.grenadeManager.whenReady,
      ]);
    } finally {
      if (rosterPumpId) window.clearInterval(rosterPumpId);
    }
    if (competitive) this.preMatchOverlay.completeLoadStep('assets');

    if (initialMapId === 'firing_range') {
      const mapDef = getMapDef('firing_range');
      try {
        const minimapLayout = await loadFiringRangeMinimapLayout();
        this.minimapHud.setLayout(minimapLayout);
        this.tacticalMapOverlay.setLayout(minimapLayout);
        this.minimapHud.setMapActive(true);
        this.tacticalMapOverlay.setMapActive(true);
      } catch (error) {
        console.warn('[Game] Failed to load firing range minimap', error);
        this.minimapHud.setMapActive(false);
        this.tacticalMapOverlay.setMapActive(false);
      }
      await this.ammoPickups.repopulate(mapDef.getAmmoPositions?.() ?? []);
      await this.grenadePickups.repopulate(mapDef.getGrenadePositions?.() ?? []);
      mapDef.getShieldPositions?.().forEach((pos, index) => {
        this.shieldChargePickups.applySnapshot(index, {
          x: pos.x,
          y: 0,
          z: pos.z,
          collected: false,
        });
      });
      mapDef.getInitialWeaponSpawns?.().forEach((spawn, index) => {
        this.weaponDrops.applySnapshot(index, {
          x: spawn.x,
          y: 0,
          z: spawn.z,
          yaw: spawn.yaw,
          weaponId: spawn.weaponId,
          collected: false,
        });
      });
    } else if (initialMapId === 'killhouse_small') {
      try {
        const minimapLayout = await loadTdmMapMinimapLayout();
        this.minimapHud.setLayout(minimapLayout);
        this.tacticalMapOverlay.setLayout(minimapLayout);
        this.minimapHud.setMapActive(true);
        this.tacticalMapOverlay.setMapActive(true);
      } catch (error) {
        console.warn('[Game] Failed to load Chrono-Bowl minimap', error);
        this.minimapHud.setMapActive(false);
        this.tacticalMapOverlay.setMapActive(false);
      }
    } else {
      this.minimapHud.setMapActive(false);
      this.tacticalMapOverlay.setMapActive(false);
    }

    reportLoad('Compiling shaders…', 'shaders', 20);
    // Park pooled combat resources + a character clone in the scene so the
    // compile pass below builds every program combat will need. Without this
    // the first shot / first hit / first enemy sighting compiles shaders
    // mid-fight (the light pool keeps the scene light count constant, which
    // otherwise forces a whole-scene lit-shader recompile per new light).
    initFxLightPool(this.scene);
    this.projectiles.prewarmGpuResources();
    const characterPrewarm = await buildCharacterShaderPrewarm(this.scene);
    reportLoad('Compiling shaders…', 'shaders', 60);
    await runShaderPrewarm(
      this.renderContext.renderer,
      this.scene,
      this.getActiveCamera(),
    );
    this.projectiles.finishGpuPrewarm();
    characterPrewarm?.dispose();
    this.impactSounds.primeEnemyHit();
    if (competitive) {
      this.preMatchOverlay.completeLoadStep('shaders');
      this.preMatchOverlay.completeLoadStep('sync');
      this.preMatchOverlay.setLoadStep('finalize', 0);
      this.network.sendMatchClientReady();
      this.preMatchOverlay.setFooterStatus('WAITING FOR PLAYERS…');
      this.preMatchOverlay.update(this.network.getAllPlayers());
      // Never surface click-to-play under / during the pre-match screen.
      const blocker = document.getElementById('blocker');
      if (blocker) {
        blocker.hidden = true;
        blocker.style.display = 'none';
      }
    }

    onConnected?.();
    if (!competitive) {
      this.playerControls.revealEntryOverlay();
    }
    this.running = true;
    this.loop();
  }

  private bindMasterVolume(): void {
    if (this.masterVolumeUnsub) return;
    this.masterVolumeUnsub = subscribeMasterVolume((volume) => {
      this.weaponSounds.setMasterVolume(volume);
      this.environmentSounds.setMasterVolume(volume);
      this.droneProximitySounds.setMasterVolume(volume);
      this.shieldChargeSounds.setMasterVolume(volume);
      this.footstepSounds.setMasterVolume(volume);
      this.impactSounds.setMasterVolume(volume);
      this.grenadeSounds.setMasterVolume(volume);
      this.matchSounds.setMasterVolume(volume);
    });
  }

  private async leaveGame(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.running = false;
    const embeddedInLobby = window.parent !== window;
    if (!embeddedInLobby) {
      LoadingOverlay.shared().show('Leaving game...');
    }
    this.masterVolumeUnsub?.();
    this.masterVolumeUnsub = null;
    this.environmentSounds.stop();
    this.droneProximitySounds.stop();
    this.shieldChargeSounds.stop();
    this.matchSounds.stopResultsMusic();
    this.playerControls.setLeaveEnabled(false);
    this.playerControls.controls.unlock();

    try {
      await this.network.disconnect();
    } catch (error) {
      console.warn('[Game] disconnect failed', error);
    } finally {
      if (embeddedInLobby) {
        window.parent.postMessage(
          { type: FPS_LEAVE_GAME_MESSAGE },
          window.location.origin,
        );
      } else {
        window.location.replace('/lobby.html');
      }
    }
  }

  private applyActiveMap(): void {
    const mapDef = getMapDef(this.worldMapId);
    setClientMapDef(this.worldMapId);
    this.player?.setMapCollisionDef(mapDef);
    this.killCam.configureForMap(mapDef);
    this.renderContext.setMapLook(
      this.worldMapId === 'killhouse_small' ? 'chrono_bowl' : 'default',
    );
  }

  private updateMatchCountdownTicks(
    match: ReturnType<typeof resolveMatchSnapshot>,
    worldTime: number,
  ): void {
    if (!match || match.phase !== 'countdown') {
      this.lastCountdownTickSec = null;
      if (match?.phase !== 'playing') {
        this.gameStartSoundPlayed = false;
      }
      return;
    }

    const display = getCountdownDisplayValue(worldTime, match.matchCountdownEndAt);
    if (!display) return;

    if (display === 'GO!') {
      if (!this.gameStartSoundPlayed) {
        this.gameStartSoundPlayed = true;
        this.playMatchCue(FPS_GAME_START_MESSAGE, () => this.matchSounds.playGameStart());
      }
      return;
    }

    const second = Number(display);
    if (!Number.isFinite(second) || second === this.lastCountdownTickSec) return;

    this.lastCountdownTickSec = second;
    this.playMatchCue(FPS_COUNTDOWN_TICK_MESSAGE, () => this.matchSounds.playTick());
  }

  private playMatchCue(messageType: string, localPlay: () => void): void {
    // Lobby primes audio on Join and hosts playback so cues work without a
    // second click on the game page (browser autoplay policy).
    if (window.parent !== window) {
      window.parent.postMessage({ type: messageType }, window.location.origin);
      return;
    }

    localPlay();
  }

  private unlockGameAudio(): void {
    if (this.audioUnlocked) return;
    this.weaponSounds.unlock();
    this.footstepSounds.unlock();
    this.impactSounds.unlock();
    this.grenadeSounds.unlock();
    this.matchSounds.unlock();
    this.environmentSounds.unlock();
    this.droneProximitySounds.unlock();
    this.shieldChargeSounds.unlock();
    this.environmentSounds.setActive(true);
    this.audioUnlocked = true;
  }

  private getActiveCamera(): THREE.PerspectiveCamera {
    return this.killCam.isActive() ? this.killCam.camera : this.player.camera!;
  }

  private initWorld(mapId: MapId): void {
    const world = new WorldBuilder(mapId)
      .build()
      .withLighting()
      .withTerrain()
      .withLevel()
      .withDrones()
      .withLightBeams();
    this.droneField = world.getDroneField();
    this.lightBeams = world.getLightBeams();
    this.scene = world.getScene();
    this.worldBuilder = world;
    this.projectiles = new ProjectileManager(this.scene);
    this.grenadeManager = new GrenadeManager(this.scene);
    this.grenadeArcPreview = new GrenadeArcPreview(this.scene);
    this.shieldDomeManager = new ShieldDomeManager(this.scene);
    this.shieldDomeChargeManager = new ShieldDomeChargeManager(this.scene);
    this.projectiles.setShieldDomeManager(this.shieldDomeManager);
    const mapDef = getMapDef(mapId);
    this.ammoPickups = new AmmoPickups(
      this.scene,
      mapId === 'firing_range' ? [] : mapDef.ammoPositions,
    );
    this.grenadePickups = new GrenadePickups(
      this.scene,
      mapId === 'firing_range' ? [] : (mapDef.getGrenadePositions?.() ?? []),
      mapDef.grenadePickupGrant,
    );
    this.shieldChargePickups = new ShieldChargePickups(this.scene);
    this.weaponDrops = new WeaponDrops(this.scene);
    this.scene.add(this.teamPings.group);

    void this.initMapPhysics(mapId);
  }

  private async initMapPhysics(mapId: MapId): Promise<void> {
    const world = this.worldBuilder;
    if (!world) return;

    const mapDef = getMapDef(mapId);

    try {
      if (mapDef.usesMeshCollision) {
        await world.whenMeshCollisionReady();
        await buildClientMapPhysics(mapDef, world.getMeshCollisionRoots(), this.scene);
      } else {
        await buildClientMapPhysics(mapDef, undefined, this.scene);
      }
    } catch (error) {
      console.warn('[Game] Failed to build map physics', error);
      disposeClientMapPhysics();
    }
  }

  private initPlayer(mapId: MapId, gameMode?: GameMode): void {
    this.player = Player.createLocal();
    // World-space barrel smoke for the local player's weapon.
    const gunJuiceGroup = this.player.getGunJuiceGroup();
    if (gunJuiceGroup) this.scene.add(gunJuiceGroup);
    const mapDef = getMapDef(mapId);
    if (mapDef.emptyStartingLoadout) {
      this.player.applyEmptyLoadout();
    }
    const mode = normalizeGameMode(gameMode);
    const spawn =
      isCompetitiveGameMode(mode) && mapDef.pickTeamSpawnPoint
        ? mapDef.pickTeamSpawnPoint(0, 0)
        : mapDef.pickSpawnPoint(0);
    this.player.setEyePosition(spawn.x, EYE_HEIGHT, spawn.z);
    this.player.attachToScene(this.scene);
    this.playerControls = new PlayerControls(this.player.aimRig!, this.player.pitchRig!);
    this.player.bindAimControls(this.playerControls.controls);
    this.playerControls.setStaminaHud(this.staminaHud);
    this.playerControls.setAmmoHud(this.ammoHud);
    this.playerControls.setHealthHud(this.healthHud);
    this.playerControls.setTeamHud(this.teamHud);
    this.playerControls.setKillFeedHud(this.killFeedHud);
    this.playerControls.setCrosshairHud(this.crosshairHud);
    this.playerControls.setMinimapHud(this.minimapHud);
    this.playerControls.setDamageIndicatorHud(this.damageIndicatorHud);
    this.playerControls.setGrenadeThreatIndicatorHud(this.grenadeThreatHud);
    this.playerControls.setPingDirectionIndicatorHud(this.pingDirectionHud);
    this.playerControls.setShieldRechargeHud(this.shieldRechargeHud);
    this.playerControls.setShieldDomeHud(this.shieldDomeHud);
    this.playerControls.setWeaponPickupHud(this.weaponPickupHud);
    this.playerControls.setShieldPickupHud(this.shieldPickupHud);
    this.playerControls.setLeaveHandler(() => {
      void this.leaveGame();
    });
    this.playerControls.setEngageHandler(() => {
      this.unlockGameAudio();
    });
    this.grenadeManager.setExplosionListener((x, y, z) => {
      this.player.triggerExplosionShake(x, y, z);
    });
    this.grenadeManager.setGrenadeSoundService(this.grenadeSounds);
    this.grenadeManager.setShieldDomeManager(this.shieldDomeManager);
    this.grenadeManager.setPlayerColliderProvider(() =>
      this.network?.getGrenadePlayerColliders(this.player) ?? [],
    );
    this.matchResultsOverlay.setLeaveHandler(() => {
      void this.leaveGame();
    });
    this.player.setWeaponSoundService(this.weaponSounds);
    this.player.setGrenadeSoundService(this.grenadeSounds);
    this.player.setFootstepSoundService(this.footstepSounds);

    this.inventoryHud.setOnWeaponDropRequest((slotIndex) => {
      if (!this.network) return;
      const snapshot = this.network.getLocalSnapshot();
      if (!snapshot) return;
      if (!isValidDropSlot(snapshot, slotIndex)) {
        this.messageHud.push('Cannot drop your last weapon');
        return;
      }
      this.network.sendDropWeapon(slotIndex);
    });

    this.inventoryHud.setOnShieldDropRequest(() => {
      if (!this.network) return;
      const snapshot = this.network.getLocalSnapshot();
      if (!snapshot || snapshot.shieldCharges <= 0) {
        this.messageHud.push('No shield charges to drop');
        return;
      }
      this.network.sendDropShieldCharge();
    });

    this.inventoryHud.setOnWeaponEquipRequest((slotIndex) => {
      this.player.requestInventoryWeaponSwitch(slotIndex);
      this.refreshInventoryHud();
    });

    this.inventoryHud.setOnMeleeEquipRequest(() => {
      this.player.requestInventoryMeleeEquip();
      this.refreshInventoryHud();
    });

    this.inventoryHud.setOnCloseRequest(() => {
      this.closeInventory();
    });

    this.loadoutSwitcherHud.setOnApplyRequest((request) => {
      this.pendingLoadoutApply = {
        loadoutId: request.loadoutId,
        primaryWeaponId: request.primaryWeaponId,
        secondaryWeaponId: request.secondaryWeaponId,
      };
      applyLoadoutSightAssignments({
        primaryWeaponId: request.primaryWeaponId,
        secondaryWeaponId: request.secondaryWeaponId,
        primarySightId: request.primarySightId,
        secondarySightId: request.secondarySightId,
      });
      const equipped = this.player.applyArmoryLoadout(
        request.primaryWeaponId,
        request.secondaryWeaponId,
      );
      this.refreshInventoryHud();
      if (!equipped) {
        this.pendingLoadoutApply = null;
        this.loadoutSwitcherHud.clearPending(request.loadoutId);
        this.messageHud.push('Could not equip that loadout');
        return;
      }
      this.messageHud.push('Loadout equipped');
      if (!this.network?.sendApplyLoadout(
        request.loadoutId,
        request.primaryWeaponId,
        request.secondaryWeaponId,
      )) {
        // Local equip already applied; server sync will retry next open if needed.
        console.warn('[Game] applyLoadout not sent — room not connected');
      }
    });
    this.loadoutSwitcherHud.setOnPendingTimeout((loadoutId) => {
      // Keep the local equip — server may still catch up. Only clear pending gate.
      if (this.pendingLoadoutApply?.loadoutId === loadoutId) {
        this.pendingLoadoutApply = null;
      }
    });

    document.addEventListener('keydown', this.onTabKeyDown);
  }

  private onTabKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Tab' || !this.running) return;
    if (!this.playerControls.isPlaying || !this.localCombat.alive) return;
    event.preventDefault();
  };

  private async initNetwork(
    credentials: FpsJoinCredentials,
    joinIntent?: GameJoinIntent | null,
  ): Promise<void> {
    this.network = new NetworkManager(
      this.scene,
      this.projectiles,
      this.ammoPickups,
      this.shieldChargePickups,
      this.weaponDrops,
      this.grenadePickups,
      this.grenadeManager,
      () => {
        this.player.addReserveClip();
        this.messageHud.push('Picked up some ammo');
      },
      () => {
        this.messageHud.push('Picked up grenades');
        if (this.inventoryOpen) {
          this.refreshInventoryHud();
        }
      },
      () => {
        this.shieldPickupHud.cancelHold();
        this.messageHud.push('Picked up shield charge');
        if (this.inventoryOpen) {
          this.refreshInventoryHud();
        }
      },
      (state) => this.handleLocalCombatChange(state),
      (killerId, killerName, victimName) => {
        this.killFeedHud.addKill(killerName, victimName);
        const session = getSession();
        if (!session) return;
        const isSuicide = killerName === victimName;
        if (victimName === session.username && !isSuicide) {
          this.pendingKillerId = killerId;
          this.matchPerf.recordDeath();
        }
        if (killerName === session.username && !isSuicide) {
          this.messageHud.pushKill(victimName);
          this.impactSounds.playKillConfirm();
          this.matchPerf.recordKill();
        }
      },
    );
    this.network.onLocalDamaged((damage) => this.handleLocalDamaged(damage));
    this.network.setMatchPerfHandlers(
      () => this.matchPerf.recordShotFired(),
      (dealt, bodyPart) => {
        this.matchPerf.recordShotHit();
        this.matchPerf.recordDamageDealt(dealt, bodyPart === 'head');
      },
    );
    this.network.onTeamPing((data) => {
      this.teamPings.spawn(data.x, data.y, data.z, data.pingerId);
    });
    this.network.onApplyLoadoutResult((result) => {
      this.loadoutSwitcherHud.clearPending(result.loadoutId || undefined);
      if (!result.ok) {
        this.pendingLoadoutApply = null;
        const snapshot = this.network.getLocalSnapshot();
        if (snapshot) {
          this.player.applyLoadoutFromSnapshot(snapshot);
          if (this.inventoryOpen) this.refreshInventoryHud();
        }
        this.messageHud.push(result.error ?? 'Could not equip loadout');
        return;
      }
      if (result.primaryWeaponId && result.secondaryWeaponId) {
        this.pendingLoadoutApply = null;
        this.applyLocalLoadoutPreset(
          result.primaryWeaponId,
          result.secondaryWeaponId,
        );
      }
    });
    this.network.onLocalLoadoutChange((snapshot) => {
      const pending = this.pendingLoadoutApply;
      if (pending) {
        const serverMatchesPending =
          snapshot.weaponSlot0 === pending.primaryWeaponId &&
          snapshot.weaponSlot1 === pending.secondaryWeaponId;
        if (!serverMatchesPending) {
          // Stale move/patch still has the old guns — keep the optimistic loadout.
          return;
        }
        this.pendingLoadoutApply = null;
        this.loadoutSwitcherHud.clearPending(pending.loadoutId);
      }

      const prevWeapons = this.player.getInventoryWeapons();
      const nextSlotIds = [
        snapshot.weaponSlot0 || null,
        snapshot.weaponSlot1 || null,
        snapshot.weaponSlot2 || null,
      ];
      const loadoutChanged = prevWeapons.some(
        (weapon, index) => weapon.weaponId !== nextSlotIds[index],
      );
      if (loadoutChanged) {
        this.player.unequipThrowable({ discardCook: true });
      }
      this.player.applyLoadoutFromSnapshot(snapshot);
      const nextWeapons = this.player.getInventoryWeapons();
      if (
        prevWeapons.some(
          (weapon, index) => weapon.occupied && !nextWeapons[index]?.occupied,
        )
      ) {
        this.messageHud.push('Weapon dropped');
      }
      if (this.inventoryOpen) {
        this.refreshInventoryHud();
      }
    });
    this.network.onWeaponPickupGranted((data) => {
      this.weaponPickupHud.cancelHold();
      this.player.unequipThrowable({ discardCook: true });
      const snapshot = this.network.getLocalSnapshot();
      if (snapshot) {
        // Re-apply after unequipping throwable — a schema sync that arrived while
        // the grenade was out only updated slots and skipped equipping the gun.
        this.player.applyLoadoutFromSnapshot(snapshot);
      }
      if (isWeaponId(data.weaponId)) {
        const name = getWeaponConfig(data.weaponId)?.name ?? data.weaponId;
        this.messageHud.push(`Picked up ${name}`);
      }
      if (this.inventoryOpen) {
        this.refreshInventoryHud();
      }
    });
    this.network.onShieldChargeDropGranted(() => {
      this.messageHud.push('Shield charge dropped');
      if (this.inventoryOpen) {
        this.refreshInventoryHud();
      }
    });
    this.network.bindShoot(this.player, () => {
      const weaponId = this.player.getActiveWeaponId();
      if (weaponId) this.crosshairHud.onHit(weaponId);
    });
    this.player.setShieldRechargeNetworkCallback(() => {
      const snapshot = this.network.getLocalSnapshot();
      if (!snapshot) return;
      if (snapshot.shieldRecharging) return;
      if (!canUseShieldCharge(snapshot.shieldLevel, snapshot.shieldPoints)) {
        this.messageHud.push('Shield is already full');
        return;
      }
      if (snapshot.shieldCharges <= 0) {
        this.messageHud.push('No shield charges');
        return;
      }
      this.network.sendStartShieldRecharge();
    });
    await this.network.connect(credentials, joinIntent);
    this.network.setFootstepSoundService(this.footstepSounds);
    this.network.setWeaponSoundService(this.weaponSounds);
    this.network.setImpactSoundService(this.impactSounds);
    this.network.applyLocalSpawn(this.player);

    try {
      const { weapons } = await apiListMyWeapons();
      const statsById = new Map<string, WeaponEffectiveStats>();
      for (const weapon of weapons) {
        statsById.set(weapon.id, weapon.effectiveStats);
      }
      // Fill any missing pickables with catalog stock so recoil camera scale is always set.
      for (const config of PICKABLE_WEAPON_CONFIGS) {
        if (!statsById.has(config.id)) {
          statsById.set(config.id, shippedEffectiveStats(config.id));
        }
      }
      if (!statsById.has(KATANA_CONFIG.id)) {
        statsById.set(KATANA_CONFIG.id, shippedEffectiveStats(KATANA_CONFIG.id));
      }
      this.player.applyWeaponEffectiveStats(statsById);
      this.projectiles.setWeaponMaxHitDistanceResolver((weaponId) => {
        return statsById.get(weaponId)?.range;
      });
    } catch (error) {
      console.warn('[Game] failed to apply weapon upgrades for match', error);
      const fallback = new Map<string, WeaponEffectiveStats>();
      for (const config of PICKABLE_WEAPON_CONFIGS) {
        fallback.set(config.id, shippedEffectiveStats(config.id));
      }
      fallback.set(KATANA_CONFIG.id, shippedEffectiveStats(KATANA_CONFIG.id));
      this.player.applyWeaponEffectiveStats(fallback);
    }

    this.shieldDomeAbility = new ShieldDomeAbility();
    this.shieldDomeAbility.setStartChargeCallback(() =>
      this.network.sendStartShieldDomeCharge(),
    );
    this.player.setShieldDomeAbility(this.shieldDomeAbility);
    this.player.setShieldDomeWorldTimeProvider(() => this.network.getWorldTime());
    this.projectiles.setWorldTimeProvider(() => this.network.getWorldTime());
  }

  private handleLocalCombatChange(state: LocalCombatState): void {
    const prev = this.localCombat;
    // Update early so closeInventory/closeTacticalMap see the current alive
    // state and don't re-lock the pointer for a dead player.
    this.localCombat = state;

    if (
      prev.shieldRecharging &&
      !state.shieldRecharging &&
      (state.shieldLevel > prev.shieldLevel || state.shieldPoints > prev.shieldPoints)
    ) {
      this.impactSounds.playShieldChargeEnd();
    }

    if (state.alive) {
      const shieldBroken = prev.shieldPoints > 0 && state.shieldPoints <= 0;
      if (shieldBroken) {
        this.network.playLocalShieldBreak();
      }
    }

    if (!state.alive && this.wasAlive) {
      this.messageHud.push('You died');
      this.closeInventory();
      this.closeTacticalMap();
      // Block input without the pause overlay — release the pointer softly
      // and refuse re-locks until respawn.
      this.playerControls.setDeadBlocked(true);
      this.playerControls.controls.unlockSoft();
      this.crosshairHud.setVisible(false);
      const killerId = this.pendingKillerId ?? this.lastCombatShooterId;
      this.killCam.activate(killerId);
      this.pendingKillerId = null;
    }

    if (state.alive && !this.wasAlive) {
      this.killCam.deactivate();
      this.lastCombatShooterId = null;
      this.network.applyLocalSpawn(this.player);
      this.playerControls.setDeadBlocked(false);
      if (
        this.playerControls.isPlaying &&
        !this.matchEndHandled &&
        !this.inventoryOpen &&
        !this.tacticalMapOverlay.isOpen()
      ) {
        this.playerControls.controls.lock();
        this.crosshairHud.setVisible(true);
      }
    }

    this.wasAlive = state.alive;
    this.shieldDomeAbility?.setServerState(
      state.shieldDomeEndAt,
      state.shieldDomeCooldownEndAt,
      state.shieldDomeChargeEndAt,
    );
    this.player.getInventory().setShieldCharges(state.shieldCharges);
    this.player.getInventory().setGrenadeCount(state.grenadeCount);
    this.player.setProjectileSpawnOptions(state.teamId, this.network?.getSessionId() ?? '');
    this.healthHud.update(state);
  }

  private updateKillCam(delta: number): void {
    if (!this.killCam.isActive()) return;

    const killerId = this.killCam.getTargetId();
    if (!killerId || !this.network) {
      this.killCam.useMapFallback();
      this.killCam.configureForMap(getMapDef(this.worldMapId));
      return;
    }

    const killer = this.network.getRemotePlayer(killerId);
    if (killer) {
      const feet = killer.getFeetPosition();
      this.killCam.updateFollow(feet.x, feet.y, feet.z, killer.getAimYaw(), delta);
      return;
    }

    const snapshot = this.network.getPlayerSnapshot(killerId);
    if (snapshot) {
      this.killCam.updateFollow(
        snapshot.x,
        feetYFromNetworkEyeY(snapshot.y, snapshot.crouching),
        snapshot.z,
        snapshot.yaw,
        delta,
      );
      return;
    }

    this.killCam.useMapFallback();
    this.killCam.configureForMap(getMapDef(this.worldMapId));
  }

  private handleLocalDamaged(damage: PlayerDamagedMessage): void {
    if (damage.shooterId) {
      this.lastCombatShooterId = damage.shooterId;
    }
    const taken = (damage.absorbedByShield ?? 0) + (damage.dealtToHealth ?? 0);
    if (taken > 0) {
      this.matchPerf.recordDamageTaken(taken);
    }
    this.player.object.updateMatrixWorld(true);
    const shooterWorldPos = new THREE.Vector3(
      damage.shooterWorldX,
      damage.shooterWorldY,
      damage.shooterWorldZ,
    );
    const camera = this.player.camera;

    if (damage.absorbedByShield > 0) {
      this.damageIndicatorHud.onDamage(
        damage.absorbedByShield,
        shooterWorldPos,
        camera,
        'shield',
      );
    }

    if (damage.shieldBroken) {
      this.damageIndicatorHud.onShieldBroken(shooterWorldPos, camera);
    }

    if (damage.dealtToHealth > 0) {
      this.damageIndicatorHud.onDamage(
        damage.dealtToHealth,
        shooterWorldPos,
        camera,
        'health',
      );
    }
  }

  /** Upload in-memory match perf after TDM ends; server returns XP/RP awards (no UI yet). */
  private async submitRankedMatchResult(
    match: NonNullable<ReturnType<typeof resolveMatchSnapshot>>,
  ): Promise<void> {
    const network = this.network;
    if (!network) return;
    const roomId = network.getRoomId();
    if (!roomId) return;

    const local = network.getLocalSnapshot();
    if (local) {
      this.matchPerf.syncKills(local.matchKills ?? 0);
    }

    const matchId = buildMatchId(roomId, match.matchStartAt);
    if (this.matchResultSubmittedFor === matchId) return;
    this.matchResultSubmittedFor = matchId;

    const localSessionId = network.getSessionId();
    const roster = network.getAllPlayers();
    const localKills = local?.matchKills ?? this.matchPerf.snapshot().kills;
    let topKills = localKills;
    for (const player of roster) {
      if (isTrainingBotSessionId(player.sessionId)) continue;
      topKills = Math.max(topKills, player.matchKills ?? 0);
    }
    const wasMvp =
      localKills > 0 &&
      localKills >= topKills &&
      Boolean(localSessionId) &&
      roster.some(
        (player) =>
          player.sessionId === localSessionId && (player.matchKills ?? 0) === topKills,
      );

    try {
      const result = await apiSubmitMatchResult({
        matchId,
        roomId,
        mapId: network.getMapId(),
        mode: match.gameMode,
        teamId: this.localCombat.teamId,
        winningTeamId: match.winningTeamId,
        matchStartAt: match.matchStartAt,
        matchDurationSec: match.matchDurationSec,
        performance: this.matchPerf.snapshot(),
        wasMvp,
      });
      this.lastMatchRewards = result;
      savePendingMatchXp(result);
      setPlasmaMineralsDisplay(result.plasmaMinerals);
      console.info('[rank] match rewards', {
        matchId: result.matchId,
        newlyAwarded: result.newlyAwarded,
        xp: result.rewards.totalXp,
        seasonXp: result.rewards.seasonXp,
        rpDelta: result.rewards.rpDelta,
        minerals: result.rewards.mineralsGained,
        performance: result.performance,
      });
    } catch (error) {
      this.matchResultSubmittedFor = null;
      console.error('[rank] failed to submit match result', error);
    }
  }

  private updateGrenadeThreatIndicators(camera: THREE.Camera | null): void {
    if (!this.playerControls.isPlaying || !this.localCombat.alive || !this.network) {
      this.grenadeThreatHud.sync(camera, []);
      return;
    }

    this.activeGrenadesScratch.length = 0;
    this.grenadeManager.forEachActiveGrenade((grenade) => {
      let throwerTeamId = grenade.throwerTeamId;
      if (throwerTeamId === null) {
        throwerTeamId =
          this.network.getRemotePlayer(grenade.throwerId)?.getTeamId()
          ?? this.network.getPlayerSnapshot(grenade.throwerId)?.teamId
          ?? null;
      }
      this.activeGrenadesScratch.push({ ...grenade, throwerTeamId });
    });

    const feet = this.player.getFeetPosition();
    _grenadeThreatPlayerCenter.set(
      feet.x,
      feet.y + PLAYER_HIT_CAPSULE_HEIGHT * 0.5,
      feet.z,
    );

    collectNearbyEnemyGrenades(
      _grenadeThreatPlayerCenter,
      this.activeGrenadesScratch,
      {
        localSessionId: this.network.getSessionId(),
        localTeamId: this.localCombat.teamId,
        friendlyFire: this.network.getFriendlyFire(),
      },
      this.nearbyGrenadeThreatsScratch,
    );

    this.grenadeThreatHud.sync(camera, this.nearbyGrenadeThreatsScratch);
  }

  private refreshInventoryHud(): void {
    if (!this.player) return;

    const snapshot = this.network?.getLocalSnapshot();
    const players = this.network?.getAllPlayers() ?? [];
    const unitsInField = players.filter((player) => player.alive).length;
    const kills = snapshot?.matchKills ?? 0;
    const weapons = this.player.getInventoryWeapons();

    this.inventoryHud.update({
      weapons,
      melee: this.player.getInventoryMelee(),
      shieldCharges: this.player.getInventory().getShieldCharges(),
      grenadeCount: this.player.getInventory().getGrenadeCount(),
      grenadeEquipped: this.player.isThrowableEquipped(),
      operatorName: this.localCombat.username,
      killDeath: `${kills}/0`,
      unitsInField,
    });

    this.loadoutSwitcherHud.setActiveSlots({
      primaryWeaponId: weapons[0]?.weaponId ?? null,
      secondaryWeaponId: weapons[1]?.weaponId ?? null,
    });
  }

  private async refreshLoadoutSwitcher(): Promise<void> {
    const seq = ++this.loadoutsFetchSeq;
    try {
      // Unlockables hydrate is the source of truth for per-weapon equipped sights.
      // Keep it independent so loadout list failures still restore optic gating.
      const [loadoutsResult] = await Promise.all([
        apiListLoadouts().catch((error) => {
          console.warn('[Game] failed to load Armory loadouts', error);
          return null;
        }),
        apiListWeaponUnlockables().catch((error) => {
          console.warn('[Game] failed to load equipped weapon sights', error);
          return null;
        }),
      ]);
      if (seq !== this.loadoutsFetchSeq) return;

      const loadouts = loadoutsResult?.loadouts ?? [];
      this.loadoutSwitcherHud.setLoadouts(loadouts);
      const preferred =
        loadouts.find((entry) => entry.isDefault) ?? loadouts[0] ?? null;
      if (preferred) {
        applyLoadoutSightAssignments({
          primaryWeaponId: preferred.primaryWeaponId,
          secondaryWeaponId: preferred.secondaryWeaponId,
          primarySightId: preferred.primarySightId,
          secondarySightId: preferred.secondarySightId,
        });
      }
      this.refreshInventoryHud();
    } catch (error) {
      console.warn('[Game] failed to refresh loadout switcher', error);
      if (seq !== this.loadoutsFetchSeq) return;
      this.loadoutSwitcherHud.setLoadouts([]);
    }
  }

  /** Apply a primary/secondary pair locally (inventory + view) before/after server ack. */
  private applyLocalLoadoutPreset(
    primaryWeaponId: string,
    secondaryWeaponId: string,
  ): void {
    if (!this.player.applyArmoryLoadout(primaryWeaponId, secondaryWeaponId)) {
      console.warn('[Game] loadout weapons not recognized', {
        primaryWeaponId,
        secondaryWeaponId,
      });
      return;
    }
    this.refreshInventoryHud();
  }

  private closeTacticalMap(options?: { deferRelock?: boolean }): void {
    if (!this.tacticalMapOverlay.isOpen()) return;
    this.tacticalMapOverlay.setOpen(false);
    this.playerControls.setTacticalMapOpen(false);
    this.relockAfterPanelClose(options?.deferRelock === true);
  }

  private toggleTacticalMap(): void {
    if (!mapHasMinimap(this.worldMapId)) return;

    const willOpen = !this.tacticalMapOverlay.isOpen();
    this.tacticalMapOverlay.setOpen(willOpen);
    this.playerControls.setTacticalMapOpen(willOpen);

    if (willOpen) {
      this.playerControls.controls.unlockSoft();
      this.crosshairHud.setVisible(false);
      const mapState = this.getMinimapState();
      if (mapState) {
        this.tacticalMapOverlay.update(mapState);
      }
      return;
    }

    if (this.playerControls.isPlaying && this.localCombat.alive) {
      this.playerControls.controls.lock();
      this.crosshairHud.setVisible(true);
    }
  }

  private getMinimapState(): MinimapUpdateState | null {
    if (!mapHasMinimap(this.worldMapId) || !this.network) return null;

    const playerPos = this.player.object.position;
    const { yaw } = this.player.getNetworkAim();
    const blips = this.network.getMinimapBlips();
    for (const ping of this.teamPings.getMinimapPings()) {
      blips.push({ x: ping.x, z: ping.z, kind: 'ping' });
    }
    return {
      x: playerPos.x,
      z: playerPos.z,
      yaw,
      blips,
    };
  }

  /** Middle mouse — mark the aimed spot for same-team members. */
  private triggerTeamPing(camera: THREE.Camera): void {
    if (!this.network) return;

    readCrosshairWorldRay(
      camera,
      window.innerWidth,
      window.innerHeight,
      0,
      0,
      this.pingRayOrigin,
      this.pingRayDirection,
    );

    const hit = raycastLevelBullets(
      this.pingRayOrigin.x,
      this.pingRayOrigin.y,
      this.pingRayOrigin.z,
      this.pingRayDirection.x,
      this.pingRayDirection.y,
      this.pingRayDirection.z,
      TEAM_PING_MAX_DISTANCE,
    );
    // Pull the marker slightly toward the camera so it sits off the surface.
    const distance = Math.max(0, (hit?.distance ?? TEAM_PING_MAX_DISTANCE) - 0.2);

    this.network.sendTeamPing(
      this.pingRayOrigin.x + this.pingRayDirection.x * distance,
      this.pingRayOrigin.y + this.pingRayDirection.y * distance,
      this.pingRayOrigin.z + this.pingRayDirection.z * distance,
    );
  }

  private closeInventory(options?: { deferRelock?: boolean }): void {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    this.inventoryHud.setOpen(false);
    this.playerControls.setInventoryOpen(false);
    this.relockAfterPanelClose(options?.deferRelock === true);
  }

  /**
   * Re-capture the pointer after a panel closes. Closing with ESC must defer
   * the lock until the browser finishes processing the key — locking during
   * it gets kicked back out and shows the pause overlay.
   */
  private relockAfterPanelClose(defer: boolean): void {
    const tryLock = () => {
      if (!this.playerControls.isPlaying || !this.localCombat.alive) return;
      if (this.inventoryOpen || this.tacticalMapOverlay.isOpen()) return;
      if (this.playerControls.controls.isLocked) return;
      this.playerControls.controls.lock();
      this.crosshairHud.setVisible(true);
    };

    if (defer) {
      window.setTimeout(tryLock, 250);
    } else {
      tryLock();
    }
  }

  private toggleInventory(): void {
    if (!this.inventoryOpen) {
      this.closeTacticalMap();
    }

    this.inventoryOpen = !this.inventoryOpen;
    // Mark panel mode before releasing the pointer so accidental unlock
    // events never show the pause overlay.
    this.playerControls.setInventoryOpen(this.inventoryOpen);
    this.inventoryHud.setOpen(this.inventoryOpen);

    if (this.inventoryOpen) {
      this.playerControls.controls.unlockSoft();
      this.crosshairHud.setVisible(false);
      this.refreshInventoryHud();
      void this.refreshLoadoutSwitcher();
      return;
    }

    this.pendingLoadoutApply = null;
    if (this.playerControls.isPlaying && this.localCombat.alive) {
      this.playerControls.controls.lock();
      this.crosshairHud.setVisible(true);
    }
  }

  private initResize(): void {
    window.addEventListener('resize', () => {
      this.player.resize();
      this.killCam.resize();
      this.renderContext.resize();
    });
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const rawDeltaSec =
      this.lastFrameMs > 0 ? (now - this.lastFrameMs) / 1000 : 0;
    this.lastFrameMs = now;
    // Clamp hitches so one long frame doesn't simulate a quarter-second teleport.
    // Still high enough that ~15 FPS doesn't feel like permanent slow-mo.
    const delta = Math.min(rawDeltaSec, MAX_FRAME_DELTA_SEC);
    this.simElapsedSec += delta;

    // Only dismiss panels when ESC pause overlay is up — soft-unlock (Tab) must
    // keep inventory open while the match keeps simulating.
    if (this.inventoryOpen && this.playerControls.isPauseOverlayVisible) {
      this.closeInventory();
    }

    if (
      this.tacticalMapOverlay.isOpen() &&
      this.playerControls.isPauseOverlayVisible
    ) {
      this.closeTacticalMap();
    }

    // ESC dismisses open panels without pausing, and dismisses the pause
    // overlay itself. While the pointer is locked the browser swallows ESC
    // to exit pointer lock (that's the pause path), so this only fires when
    // the pointer is already free.
    if (this.input.isJustPressed('Escape')) {
      if (this.inventoryOpen) {
        this.closeInventory({ deferRelock: true });
      } else if (this.tacticalMapOverlay.isOpen()) {
        this.closeTacticalMap({ deferRelock: true });
      } else if (this.playerControls.isPauseOverlayVisible) {
        this.playerControls.resumeFromPause();
      }
    }

    if (
      this.input.isJustPressed('Tab') &&
      this.playerControls.isPlaying &&
      this.localCombat.alive
    ) {
      this.toggleInventory();
    }

    if (
      this.input.isJustPressed('KeyM') &&
      this.playerControls.isPlaying &&
      this.localCombat.alive &&
      !this.inventoryOpen &&
      mapHasMinimap(this.worldMapId)
    ) {
      this.toggleTacticalMap();
    }

    const match = resolveMatchSnapshot(this.network?.getMatchState() ?? null);
    const worldTime = this.network?.getWorldTime() ?? 0;

    if (this.preMatchOverlay.isActive()) {
      this.preMatchOverlay.update(this.network?.getAllPlayers() ?? EMPTY_ROSTER);
      if (
        match &&
        (match.phase === 'countdown' || match.phase === 'playing' || match.phase === 'ended')
      ) {
        this.preMatchOverlay.hide();
        // Countdown uses pointer-events:none so click-to-play can unlock audio.
        if (!this.playerControls.isPlaying) {
          this.playerControls.revealEntryOverlay();
        }
      }
    } else {
      // Keep click-to-play buried while competitive matches are still waiting.
      if (match && match.phase === 'waiting') {
        const blocker = document.getElementById('blocker');
        if (blocker && !blocker.hidden) {
          blocker.hidden = true;
          blocker.style.display = 'none';
        }
      }
    }

    this.matchCountdownOverlay.update(match, worldTime);
    // Only build the (allocating) full roster snapshot once the match has
    // actually ended — the overlay ignores it otherwise.
    const resultsRoster =
      match?.phase === 'ended' ? (this.network?.getAllPlayers() ?? EMPTY_ROSTER) : EMPTY_ROSTER;
    this.matchResultsOverlay.update(match, this.localCombat.teamId, resultsRoster);
    // Keep match timer visible during Tab inventory (soft-unlock), not only when locked.
    this.matchHud.update(
      match,
      worldTime,
      this.playerControls.isPlaying || this.inventoryOpen,
    );

    const matchPhase = match?.phase ?? null;
    const competitive = isCompetitiveGameMode(match?.gameMode);
    if (
      competitive &&
      matchPhase === 'playing' &&
      this.prevMatchPhase !== 'playing'
    ) {
      this.matchPerf.beginMatch();
      this.matchResultSubmittedFor = null;
      this.lastMatchRewards = null;
    }
    if (
      competitive &&
      matchPhase === 'ended' &&
      this.prevMatchPhase !== 'ended' &&
      match
    ) {
      this.matchPerf.endMatch();
      void this.submitRankedMatchResult(match);
    }
    if (
      matchPhase &&
      this.prevMatchPhase !== matchPhase &&
      (matchPhase === 'countdown' || matchPhase === 'playing')
    ) {
      this.network?.applyLocalSpawn(this.player, { resetLook: false });
    }
    if (matchPhase === 'countdown' || matchPhase === 'waiting') {
      this.matchEnd30Played = false;
      this.matchEnd10Played = false;
    }
    this.prevMatchPhase = matchPhase;

    // End-of-match 30s/10s stingers only apply to timed win-condition modes.
    if (
      isTimedGameMode(match?.gameMode) &&
      match?.phase === 'playing' &&
      (!this.matchEnd30Played || !this.matchEnd10Played)
    ) {
      const remaining = getMatchTimeRemaining(
        match.phase as MatchPhase,
        worldTime,
        match.matchStartAt,
        match.matchEndAt,
        match.matchDurationSec,
      );
      if (remaining > 0 && remaining <= 10 && !this.matchEnd10Played) {
        this.matchEnd10Played = true;
        this.matchEnd30Played = true;
        this.matchSounds.playEnd10();
      } else if (remaining > 10 && remaining <= 30 && !this.matchEnd30Played) {
        this.matchEnd30Played = true;
        this.matchSounds.playEnd30();
      }
    }

    if (competitive && match?.phase === 'ended' && !this.matchEndHandled) {
      this.matchEndHandled = true;
      this.closeInventory();
      this.closeTacticalMap();
      this.playerControls.controls.unlockSoft();
      this.environmentSounds.stop();
      this.droneProximitySounds.stop();
      this.matchSounds.unlock();
      this.matchSounds.playResultsMusic();
    }

    const tdmBlocksInput = competitive && match?.phase !== 'playing';

    const patchAgeMs = this.network?.getLastPatchAgeMs() ?? -1;
    const connectionStalled =
      Boolean(this.network?.isConnected)
      && this.playerControls.isPlaying
      && (
        !MatchPerfStats.snapshot().connectionOpen
        || (patchAgeMs >= 0 && patchAgeMs > Game.CONNECTION_STALL_MS)
      );
    if (this.connectionStallEl) {
      this.connectionStallEl.hidden = !connectionStalled;
    }
    if (connectionStalled && !this.connectionStallLogged) {
      this.connectionStallLogged = true;
      MatchPlaytestLog.connectionStall(patchAgeMs);
    } else if (!connectionStalled && this.connectionStallLogged) {
      this.connectionStallLogged = false;
      MatchPlaytestLog.connectionResume(patchAgeMs);
    }

    // Panels unlock the pointer but must NOT pause the match. Combat input
    // is gated; physics/world/network keep running while isPlaying.
    const panelOpen =
      this.inventoryOpen || this.tacticalMapOverlay.isOpen();
    const canAct =
      !tdmBlocksInput &&
      !connectionStalled &&
      this.playerControls.isPlaying &&
      this.playerControls.isLocked &&
      this.localCombat.alive &&
      !panelOpen;

    if (this.playerControls.isPlaying) {
      this.unlockGameAudio();
    }

    this.updateMatchCountdownTicks(match, worldTime);

    this.player.update(
      delta,
      this.input,
      this.pointer,
      canAct,
      this.projectiles,
    );
    let camera = this.getActiveCamera();
    if (canAct && this.pointer.isJustPressed(POINTER_PING)) {
      this.triggerTeamPing(camera);
    }
    this.network?.syncShieldDomeCharges(
      this.shieldDomeChargeManager,
      delta,
      camera,
    );
    this.network?.syncShieldDomes(this.shieldDomeManager);
    this.network?.interpolateRemotes(delta, camera);
    this.updateKillCam(delta);
    if (this.killCam.isActive()) {
      camera = this.getActiveCamera();
    }
    this.shieldDomeManager.update(delta, camera, worldTime);
    this.projectiles.update(delta, worldTime);
    this.grenadeManager.update(delta, worldTime);
    if (camera) {
      this.grenadeSounds.updateListener(camera);
    }
    this.grenadeArcPreview.update(
      this.player.isThrowableEquipped(),
      this.player.getThrowableArcPreview(),
      camera?.position ?? null,
      delta,
    );
    this.network?.update(delta, this.player, this.playerControls);
    this.messageHud.update(delta);
    this.killFeedHud.update(delta);
    this.damageIndicatorHud.update(delta, camera ?? null);
    {
      const live =
        this.playerControls.isPlaying &&
        this.localCombat.alive &&
        !this.killCam.isActive();
      const loco = this.player.getLocomotionState();
      this.speedLinesHud.setVisible(live);
      this.speedLinesHud.setActive(live && loco.isSprinting, live && loco.isSliding);
      this.speedLinesHud.update(delta);
    }
    this.teamPings.update(delta, this.player.object.position);
    this.pingDirectionHud.sync(
      camera ?? null,
      this.teamPings.getActivePings(),
      this.network?.getSessionId() ?? '',
      this.player.object.position,
    );
    this.updateGrenadeThreatIndicators(camera ?? null);
    this.droneField?.update(this.network?.getWorldTime() ?? 0, camera ?? undefined, delta);
    this.lightBeams?.update(this.simElapsedSec);

    if (this.audioUnlocked && this.droneField) {
      this.droneProximitySounds.setActive(this.droneField.hasAnyInAudioView());
    }

    if (this.playerControls.isPlaying && this.network) {
      this.ammoPickups.tryPickup(
        this.player.object.position.x,
        this.player.object.position.z,
        delta,
      );
      this.grenadePickups.tryPickup(
        this.player.object.position.x,
        this.player.object.position.z,
        delta,
      );

      this.staminaHud.update(this.player.getSprintState());
      const ammo = this.player.getAmmoState();
      if (ammo) this.ammoHud.update(ammo);

      if (mapHasMinimap(this.worldMapId)) {
        const mapState = this.getMinimapState();
        if (mapState) {
          this.minimapHud.update(mapState);
          if (this.tacticalMapOverlay.isOpen()) {
            this.tacticalMapOverlay.update(mapState);
          }
        }
      }

      this.player.updateCrosshairAim(
        this.crosshairHud,
        window.innerWidth,
        window.innerHeight,
      );
      this.crosshairHud.update(delta);
      this.healthHud.update(this.localCombat);
      this.teamHud.update(this.network.getTeammateHudEntries());
      this.shieldRechargeHud.update(
        getShieldRechargeState(
          this.localCombat.shieldRecharging,
          this.localCombat.shieldRechargeEndAt,
          this.network.getWorldTime(),
        ),
      );
      if (this.shieldDomeAbility) {
        this.shieldDomeHud.update(
          getShieldDomeHudState(
            this.network.getWorldTime(),
            this.localCombat.shieldDomeEndAt,
            this.localCombat.shieldDomeCooldownEndAt,
            this.localCombat.shieldDomeChargeEndAt,
          ),
        );
      }
      this.shieldChargeSounds.setActive(
        this.audioUnlocked && this.localCombat.alive && this.localCombat.shieldRecharging,
      );

      if (canAct && camera) {
        const feet = this.player.getFeetPosition();
        const weaponPickupHit = this.weaponDrops.raycastFromCamera(
          camera,
          feet.x,
          feet.z,
        );
        // Only build the (allocating) local snapshot when actually aiming at a drop.
        const snapshot = weaponPickupHit ? this.network.getLocalSnapshot() : null;
        const pickupTarget =
          weaponPickupHit &&
          snapshot &&
          canPickupWeaponDrop(
            snapshot,
            snapshot.activeWeaponId,
            weaponPickupHit.weaponId,
          )
            ? { index: weaponPickupHit.index, weaponId: weaponPickupHit.weaponId }
            : null;

        if (pickupTarget) {
          this.shieldPickupHud.update(null, false, NOOP_PICKUP);
          this.weaponPickupHud.update(
            pickupTarget,
            this.input.isPressed('KeyF'),
            this.onWeaponPickupComplete,
          );
        } else {
          this.weaponPickupHud.update(null, false, NOOP_PICKUP);
          const shieldPickupHit =
            this.localCombat.shieldCharges < MAX_SHIELD_CHARGES
              ? this.shieldChargePickups.raycastFromCamera(camera)
              : null;
          this.shieldPickupHud.update(
            shieldPickupHit ? { index: shieldPickupHit.index } : null,
            this.input.isPressed('KeyF'),
            this.onShieldPickupComplete,
          );
        }
      } else {
        this.weaponPickupHud.update(null, false, NOOP_PICKUP);
        this.shieldPickupHud.update(null, false, NOOP_PICKUP);
      }

      if (this.inventoryOpen) {
        this.refreshInventoryHud();
      }
    }

    updateEdgeLinesForCamera(camera);
    this.player.object.updateMatrixWorld(true);
    // Sniper optic glass RT must bake before the main view samples it.
    if (camera) {
      this.player.renderScopeLens(this.renderContext.renderer, this.scene);
      this.renderContext.setScopeWorldBlur(this.player.getScopeWorldBlur());
    } else {
      this.renderContext.setScopeWorldBlur(0);
    }
    this.renderContext.setTeammateOutlineTeamId(this.localCombat.teamId);
    this.renderContext.render(this.scene, camera);
    this.performanceHud.update(delta, this.renderContext.renderer);
    this.input.endFrame();
    this.pointer.endFrame();
    requestAnimationFrame(this.loop);
  };
}
