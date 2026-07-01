import * as THREE from 'three';
import { EYE_HEIGHT } from '../../shared/level/levelData';
import { pickSpawnPoint } from '../../shared/level/kiloSectorColliders';
import { KeyboardInput } from '../input/KeyboardInput';
import { PointerInput } from '../input/PointerInput';
import { ProjectileManager } from '../combat/ProjectileManager';
import { ShieldDomeAbility } from '../combat/ShieldDomeAbility';
import { ShieldDomeManager } from '../combat/ShieldDomeManager';
import { ShieldDomeChargeManager } from '../combat/ShieldDomeChargeManager';
import { NetworkManager } from '../network/NetworkManager';
import type { LocalCombatState } from '../network/types';
import type { PlayerDamagedMessage } from '../../shared/network/damage';
import { getShieldCapacity, canUseShieldCharge } from '../../shared/combat/shield';
import { getShieldRechargeState } from '../../shared/combat/shieldRecharge';
import { getShieldDomeHudState } from '../../shared/combat/shieldDomeAbility';
import { DEFAULT_SHIELD_CHARGES, MAX_SHIELD_CHARGES } from '../../shared/inventory/inventoryLimits';
import { Player } from '../player/Player';
import { PlayerControls } from '../player/PlayerControls';
import { RenderContext } from '../render/RenderContext';
import { resolveGrassQuality } from '../render/grassQuality';
import { updateEdgeLinesForCamera } from '../visuals/edgeLines';
import type { LightBeams } from '../world/LightBeams';
import { StaminaHud } from '../ui/StaminaHud';
import { AmmoHud } from '../ui/AmmoHud';
import { MessageHud } from '../ui/MessageHud';
import { HealthHud } from '../ui/HealthHud';
import { TeamHud } from '../ui/TeamHud';
import { KillFeedHud } from '../ui/KillFeedHud';
import { CrosshairHud } from '../ui/CrosshairHud';
import { DamageIndicatorHud } from '../ui/DamageIndicatorHud';
import { InventoryHud } from '../ui/InventoryHud';
import { ShieldRechargeHud } from '../ui/ShieldRechargeHud';
import { ShieldDomeHud } from '../ui/ShieldDomeHud';
import { ShieldPickupHud } from '../ui/ShieldPickupHud';
import { WeaponPickupHud } from '../ui/WeaponPickupHud';
import { PerformanceHud } from '../ui/PerformanceHud';
import { getWeaponConfig } from '../content/weaponConfig';
import { isWeaponId } from '../../shared/content/weaponIds';
import type { GameJoinIntent } from '../auth/gameJoin';
import type { FpsJoinCredentials } from '../auth/joinCredentials';
import { getSession } from '../auth/playerSession';
import { WorldBuilder } from '../world/WorldBuilder';
import { AmmoPickups } from '../world/AmmoPickups';
import { ShieldChargePickups } from '../world/ShieldChargePickups';
import { WeaponDrops } from '../world/WeaponDrops';
import { isValidDropSlot } from '../../shared/loadout/loadoutSlots';
import { preloadWeaponMeshes } from '../content/weaponMeshes';
import { collectWeaponSoundUrls, WeaponSoundService } from '../audio/WeaponSoundService';
import { FootstepSoundService } from '../audio/FootstepSoundService';
import { ImpactSoundService } from '../audio/ImpactSoundService';
import { EnvironmentSoundService } from '../audio/EnvironmentSoundService';
import { LoopingSoundService } from '../audio/LoopingSoundService';
import {
  GAME_DRONE_PROXIMITY_AUDIO,
  GAME_ENEMY_HIT_IMPACT_AUDIO,
  GAME_ENVIRONMENT_AUDIO,
  GAME_FOOTSTEP_AUDIO,
  GAME_KILL_CONFIRM_AUDIO,
  GAME_OUT_OF_AMMO_AUDIO,
  GAME_SHIELD_BREAK_AUDIO,
  GAME_SHIELD_BREAK_LOCAL_AUDIO,
  GAME_SHIELD_CHARGE_AUDIO,
  GAME_SHIELD_CHARGE_END_AUDIO,
} from '../content/audioConfig';
import { DEFAULT_LOADOUT_CONFIGS, KATANA_CONFIG } from '../content/weaponConfig';
import type { TerrainBuilder } from '../world/TerrainBuilder';
import type { DroneField } from '../world/DroneField';
import { LoadingOverlay } from '../ui/LoadingOverlay';

export class Game {
  private scene!: THREE.Scene;
  private player!: Player;
  private playerControls!: PlayerControls;
  private network!: NetworkManager;
  private staminaHud = new StaminaHud();
  private ammoHud = new AmmoHud();
  private healthHud = new HealthHud();
  private teamHud = new TeamHud();
  private killFeedHud = new KillFeedHud();
  private crosshairHud = new CrosshairHud();
  private damageIndicatorHud = new DamageIndicatorHud();
  private inventoryHud = new InventoryHud(
    DEFAULT_LOADOUT_CONFIGS.map((config) => ({
      id: config.id,
      name: config.name,
    })),
  );
  private shieldRechargeHud = new ShieldRechargeHud();
  private shieldDomeHud = new ShieldDomeHud();
  private weaponPickupHud = new WeaponPickupHud();
  private shieldPickupHud = new ShieldPickupHud();
  private performanceHud = new PerformanceHud();
  private messageHud = new MessageHud();
  private ammoPickups!: AmmoPickups;
  private shieldChargePickups!: ShieldChargePickups;
  private weaponDrops!: WeaponDrops;
  private input = new KeyboardInput();
  private pointer = new PointerInput();
  private projectiles!: ProjectileManager;
  private shieldDomeManager!: ShieldDomeManager;
  private shieldDomeChargeManager!: ShieldDomeChargeManager;
  private shieldDomeAbility: ShieldDomeAbility | null = null;
  private renderContext = new RenderContext();
  private terrain: TerrainBuilder | null = null;
  private droneField: DroneField | null = null;
  private lightBeams: LightBeams | null = null;
  private clock = new THREE.Clock();
  private wasAlive = true;
  private running = false;
  private leaving = false;
  private readonly weaponSounds = new WeaponSoundService();
  private readonly environmentSounds = new EnvironmentSoundService();
  private readonly droneProximitySounds = new LoopingSoundService();
  private readonly shieldChargeSounds = new LoopingSoundService();
  private readonly footstepSounds = new FootstepSoundService();
  private readonly impactSounds = new ImpactSoundService();
  private audioUnlocked = false;
  private inventoryOpen = false;
  private localCombat: LocalCombatState = {
    hp: 100,
    maxHp: 100,
    shieldLevel: 1,
    shieldPoints: getShieldCapacity(1),
    shieldCapacity: getShieldCapacity(1),
    shieldCharges: DEFAULT_SHIELD_CHARGES,
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
  ): Promise<void> {
    this.initWorld();
    this.environmentSounds.configure(GAME_ENVIRONMENT_AUDIO);
    this.droneProximitySounds.setVolume(GAME_DRONE_PROXIMITY_AUDIO.volume);
    this.shieldChargeSounds.setVolume(GAME_SHIELD_CHARGE_AUDIO.volume);
    await Promise.all([
      preloadWeaponMeshes(),
      Player.preloadGameCharacterModels(),
      this.weaponSounds.preload([
        ...collectWeaponSoundUrls(DEFAULT_LOADOUT_CONFIGS),
        ...collectWeaponSoundUrls([KATANA_CONFIG]),
      ]),
      this.weaponSounds.preloadOutOfAmmo(GAME_OUT_OF_AMMO_AUDIO),
      this.environmentSounds.preload(GAME_ENVIRONMENT_AUDIO.src),
      this.droneProximitySounds.preload(GAME_DRONE_PROXIMITY_AUDIO.src),
      this.shieldChargeSounds.preload(GAME_SHIELD_CHARGE_AUDIO.src),
      this.footstepSounds.preload(GAME_FOOTSTEP_AUDIO),
      this.impactSounds.preload(GAME_ENEMY_HIT_IMPACT_AUDIO),
      this.impactSounds.preloadKillConfirm(GAME_KILL_CONFIRM_AUDIO),
      this.impactSounds.preloadShieldBreak(GAME_SHIELD_BREAK_AUDIO),
      this.impactSounds.preloadShieldBreakLocal(GAME_SHIELD_BREAK_LOCAL_AUDIO),
      this.impactSounds.preloadShieldChargeEnd(GAME_SHIELD_CHARGE_END_AUDIO),
    ]);
    this.initPlayer();
    this.initResize();
    await this.initNetwork(credentials, joinIntent);
    onConnected?.();
    document.getElementById('blocker')!.hidden = false;
    this.running = true;
    this.loop();
  }

  private async leaveGame(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.running = false;
    LoadingOverlay.shared().show('Leaving game...');
    this.environmentSounds.stop();
    this.droneProximitySounds.stop();
    this.shieldChargeSounds.stop();
    this.playerControls.setLeaveEnabled(false);
    this.playerControls.controls.unlock();

    try {
      await this.network.disconnect();
    } catch (error) {
      console.warn('[Game] disconnect failed', error);
    } finally {
      window.location.replace('/lobby.html');
    }
  }

  private initWorld(): void {
    const grassQuality = resolveGrassQuality(this.renderContext.renderer);
    const world = new WorldBuilder()
      .build()
      .withLighting()
      .withTerrain(grassQuality)
      .withLevel()
      .withDrones()
      .withLightBeams();
    this.terrain = world.getTerrain();
    this.droneField = world.getDroneField();
    this.lightBeams = world.getLightBeams();
    this.scene = world.getScene();
    this.projectiles = new ProjectileManager(this.scene);
    this.shieldDomeManager = new ShieldDomeManager(this.scene);
    this.shieldDomeChargeManager = new ShieldDomeChargeManager(this.scene);
    this.projectiles.setShieldDomeManager(this.shieldDomeManager);
    this.ammoPickups = new AmmoPickups(this.scene);
    this.shieldChargePickups = new ShieldChargePickups(this.scene);
    this.weaponDrops = new WeaponDrops(this.scene);
  }

  private initPlayer(): void {
    this.player = Player.createLocal();
    const spawn = pickSpawnPoint(0);
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
    this.playerControls.setDamageIndicatorHud(this.damageIndicatorHud);
    this.playerControls.setShieldRechargeHud(this.shieldRechargeHud);
    this.playerControls.setShieldDomeHud(this.shieldDomeHud);
    this.playerControls.setWeaponPickupHud(this.weaponPickupHud);
    this.playerControls.setShieldPickupHud(this.shieldPickupHud);
    this.playerControls.setLeaveHandler(() => {
      void this.leaveGame();
    });
    this.player.setWeaponSoundService(this.weaponSounds);
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
      () => {
        this.player.addReserveClip();
        this.messageHud.push('Picked up some ammo');
      },
      () => {
        this.shieldPickupHud.cancelHold();
        this.messageHud.push('Picked up shield charge');
        if (this.inventoryOpen) {
          this.refreshInventoryHud();
        }
      },
      (state) => this.handleLocalCombatChange(state),
      (killerName, victimName) => {
        this.killFeedHud.addKill(killerName, victimName);
        const session = getSession();
        if (!session) return;
        if (killerName === session.username) {
          this.messageHud.pushKill(victimName);
          this.impactSounds.playKillConfirm();
        }
      },
    );
    this.network.onLocalDamaged((damage) => this.handleLocalDamaged(damage));
    this.network.onLocalLoadoutChange((snapshot) => {
      const prevWeapons = this.player.getInventoryWeapons();
      this.player.applyLoadoutFromSnapshot(snapshot);
      if (
        prevWeapons.some(
          (weapon, index) => weapon.occupied && !this.player.getInventoryWeapons()[index]?.occupied,
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
      this.crosshairHud.onHit(this.player.getActiveWeaponId());
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
    this.network.setImpactSoundService(this.impactSounds);
    this.network.applyLocalSpawn(this.player);

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
      this.playerControls.controls.unlock();
    }

    if (state.alive && !this.wasAlive) {
      this.network.applyLocalSpawn(this.player);
    }

    this.wasAlive = state.alive;
    this.localCombat = state;
    this.shieldDomeAbility?.setServerState(
      state.shieldDomeEndAt,
      state.shieldDomeCooldownEndAt,
      state.shieldDomeChargeEndAt,
    );
    this.player.getInventory().setShieldCharges(state.shieldCharges);
    this.player.setProjectileSpawnOptions(state.teamId, this.network?.getSessionId() ?? '');
    this.healthHud.update(state);
  }

  private handleLocalDamaged(damage: PlayerDamagedMessage): void {
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

  private refreshInventoryHud(): void {
    this.inventoryHud.update({
      weapons: this.player.getInventoryWeapons(),
      melee: this.player.getInventoryMelee(),
      shieldCharges: this.player.getInventory().getShieldCharges(),
    });
  }

  private closeInventory(): void {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    this.inventoryHud.setOpen(false);
    this.playerControls.setInventoryOpen(false);
    if (this.playerControls.isPlaying && this.localCombat.alive) {
      this.playerControls.controls.lock();
      this.crosshairHud.setVisible(true);
    }
  }

  private toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    this.inventoryHud.setOpen(this.inventoryOpen);
    this.playerControls.setInventoryOpen(this.inventoryOpen);

    if (this.inventoryOpen) {
      this.playerControls.controls.unlockSoft();
      this.crosshairHud.setVisible(false);
      this.refreshInventoryHud();
      return;
    }

    if (this.playerControls.isPlaying && this.localCombat.alive) {
      this.playerControls.controls.lock();
      this.crosshairHud.setVisible(true);
    }
  }

  private initResize(): void {
    window.addEventListener('resize', () => {
      this.player.resize();
      this.renderContext.resize();
    });
  }

  private loop = (): void => {
    if (!this.running) return;

    requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.inventoryOpen && !this.playerControls.isPlaying) {
      this.closeInventory();
    }

    if (
      this.input.isJustPressed('Tab') &&
      this.playerControls.isPlaying &&
      this.localCombat.alive
    ) {
      this.toggleInventory();
    }

    const canAct =
      this.playerControls.isLocked && this.localCombat.alive && !this.inventoryOpen;

    if (this.playerControls.isPlaying && !this.audioUnlocked) {
      this.weaponSounds.unlock();
      this.footstepSounds.unlock();
      this.impactSounds.unlock();
      this.environmentSounds.unlock();
      this.droneProximitySounds.unlock();
      this.shieldChargeSounds.unlock();
      this.environmentSounds.setActive(true);
      this.audioUnlocked = true;
    }

    this.player.update(
      delta,
      this.input,
      this.pointer,
      canAct,
      this.projectiles,
    );
    this.player.object.updateMatrixWorld(true);
    const worldTime = this.network?.getWorldTime() ?? 0;
    this.network?.syncShieldDomeCharges(
      this.shieldDomeChargeManager,
      delta,
      this.player.camera ?? null,
    );
    this.network?.syncShieldDomes(this.shieldDomeManager);
    this.network?.interpolateRemotes(delta, this.player.camera!);
    this.shieldDomeManager.update(delta, this.player.camera ?? null, worldTime);
    this.projectiles.update(delta, worldTime);
    this.network?.update(delta, this.player, this.playerControls);
    const camera = this.player.camera;
    this.player.object.updateMatrixWorld(true);
    this.messageHud.update(delta);
    this.killFeedHud.update(delta);
    this.damageIndicatorHud.update(delta, camera ?? null);
    this.terrain?.update(this.clock.getElapsedTime(), {
      playerPos: this.player.object.position,
      cameraPos: camera?.position,
    });
    this.droneField?.update(this.network?.getWorldTime() ?? 0, camera ?? undefined, delta);
    this.lightBeams?.update(this.clock.getElapsedTime());

    if (this.audioUnlocked && this.droneField && camera) {
      const droneInView = this.droneField.hasDroneInView(
        camera,
        this.network?.getWorldTime() ?? 0,
        GAME_DRONE_PROXIMITY_AUDIO.maxDistance,
        GAME_DRONE_PROXIMITY_AUDIO.lookAngleDeg,
      );
      this.droneProximitySounds.setActive(droneInView);
    }

    if (this.playerControls.isPlaying && this.network) {
      this.ammoPickups.tryPickup(
        this.player.object.position.x,
        this.player.object.position.z,
        delta,
      );

      this.staminaHud.update(this.player.getSprintState());
      const ammo = this.player.getAmmoState();
      if (ammo) this.ammoHud.update(ammo);

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
        const weaponPickupHit = this.weaponDrops.raycastFromCamera(camera);
        if (weaponPickupHit) {
          this.shieldPickupHud.update(null, false, () => {});
          this.weaponPickupHud.update(
            { index: weaponPickupHit.index, weaponId: weaponPickupHit.weaponId },
            this.input.isPressed('KeyF'),
            (target) => this.network.sendPickupWeaponDrop(target.index),
          );
        } else {
          this.weaponPickupHud.update(null, false, () => {});
          const shieldPickupHit =
            this.localCombat.shieldCharges < MAX_SHIELD_CHARGES
              ? this.shieldChargePickups.raycastFromCamera(camera)
              : null;
          this.shieldPickupHud.update(
            shieldPickupHit ? { index: shieldPickupHit.index } : null,
            this.input.isPressed('KeyF'),
            (target) => this.network.sendPickupShieldCharge(target.index),
          );
        }
      } else {
        this.weaponPickupHud.update(null, false, () => {});
        this.shieldPickupHud.update(null, false, () => {});
      }

      if (this.inventoryOpen) {
        this.inventoryHud.update({
          weapons: this.player.getInventoryWeapons(),
          melee: this.player.getInventoryMelee(),
          shieldCharges: this.player.getInventory().getShieldCharges(),
        });
      }
    }

    updateEdgeLinesForCamera(this.player.camera!);
    this.renderContext.render(this.scene, this.player.camera!);
    this.performanceHud.update(delta, this.renderContext.renderer);
    this.input.endFrame();
    this.pointer.endFrame();
  };
}
