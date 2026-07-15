import * as THREE from 'three';
import { getWeaponFeelProfile, type JuiceFeel } from './feelProfiles';

/** Single-frame screen flash decay (fast fall so it reads as one impact frame). */
const SCREEN_FLASH_DECAY_PER_SEC = 14;

const SMOKE_MAX_PARTICLES = 48;
const SMOKE_EMIT_INTERVAL_SEC = 0.045;
const SMOKE_LIFE_SEC = 1.15;
const SMOKE_RISE_SPEED = 0.55;
const SMOKE_BASE_SIZE = 0.05;
/** Counts as "continuous fire" while shots land inside this window. */
const BURST_WINDOW_SEC = 0.45;

interface SmokeParticle {
  age: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Post-shot "juice" that is not part of the muzzle flash itself:
 *
 * - SCREEN FLASH: a nearly transparent full-screen overlay that pops for a
 *   single frame on heavy weapons (profile `juice.screenFlash` > 0).
 * - BARREL SMOKE: a low-opacity lingering trail from the muzzle tip after
 *   continuous fire stops (primed by `juice.smokeShotsToPrime`).
 *
 * The crisp particle flash + momentary point light live in MuzzleFlash and
 * are already spawned per shot by ProjectileManager — this class only adds
 * the layers on top.
 *
 * HOOKUP: Player calls `onShot(weaponId)` per trigger pull and
 * `update(delta, muzzleWorldPos, firing)` per frame. `group` must be added
 * to the scene (world space — smoke must not follow the viewmodel).
 */
export class GunJuice {
  readonly group = new THREE.Group();

  private overlay: HTMLDivElement | null = null;
  private overlayOpacity = 0;

  private feel: JuiceFeel = getWeaponFeelProfile('plasma_rifle').juice;
  private shotsInBurst = 0;
  private lastShotAt = -Infinity;
  private clock = 0;
  private smokeEmitTimeLeft = 0;
  private smokeEmitCooldown = 0;

  private readonly particles: SmokeParticle[] = [];
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;

  constructor() {
    this.group.name = 'gun-juice';

    this.positions = new Float32Array(SMOKE_MAX_PARTICLES * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      color: 0x9fb4c0,
      size: SMOKE_BASE_SIZE,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  /** Lazy DOM hookup — overlay div lives outside the WebGL canvas. */
  private ensureOverlay(): HTMLDivElement {
    if (this.overlay) return this.overlay;
    let el = document.getElementById('gunfire-screen-flash') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'gunfire-screen-flash';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    this.overlay = el;
    return el;
  }

  /** Per trigger pull (once per shell, not per pellet). */
  onShot(weaponId: string): void {
    this.feel = getWeaponFeelProfile(weaponId).juice;

    // Continuous-fire bookkeeping for barrel smoke.
    if (this.clock - this.lastShotAt <= BURST_WINDOW_SEC) {
      this.shotsInBurst += 1;
    } else {
      this.shotsInBurst = 1;
    }
    this.lastShotAt = this.clock;

    // Heavy-weapon screen flash — one bright frame, decays immediately.
    if (this.feel.screenFlash > 0) {
      this.overlayOpacity = Math.max(this.overlayOpacity, this.feel.screenFlash);
      this.ensureOverlay().style.opacity = String(this.overlayOpacity);
    }
  }

  update(delta: number, muzzleWorldPos: THREE.Vector3 | null, firing: boolean): void {
    this.clock += delta;

    /* ---- screen flash decay ---- */
    if (this.overlayOpacity > 0) {
      this.overlayOpacity = Math.max(
        0,
        this.overlayOpacity - this.overlayOpacity * SCREEN_FLASH_DECAY_PER_SEC * delta - 0.002,
      );
      if (this.overlay) this.overlay.style.opacity = String(this.overlayOpacity);
    }

    /* ---- barrel smoke priming ---- */
    const burstEnded = !firing && this.clock - this.lastShotAt > 0.12;
    if (burstEnded && this.shotsInBurst >= this.feel.smokeShotsToPrime) {
      this.smokeEmitTimeLeft = this.feel.smokeDurationSec;
      this.shotsInBurst = 0;
    }
    if (firing) {
      // No smoke while still shooting — the trail starts when fire stops.
      this.smokeEmitTimeLeft = 0;
    }

    /* ---- emit ---- */
    if (this.smokeEmitTimeLeft > 0 && muzzleWorldPos) {
      this.smokeEmitTimeLeft -= delta;
      this.smokeEmitCooldown -= delta;
      while (this.smokeEmitCooldown <= 0 && this.particles.length < SMOKE_MAX_PARTICLES) {
        this.smokeEmitCooldown += SMOKE_EMIT_INTERVAL_SEC;
        this.particles.push({
          age: 0,
          x: muzzleWorldPos.x + (Math.random() - 0.5) * 0.015,
          y: muzzleWorldPos.y + (Math.random() - 0.5) * 0.015,
          z: muzzleWorldPos.z + (Math.random() - 0.5) * 0.015,
          vx: (Math.random() - 0.5) * 0.12,
          vy: SMOKE_RISE_SPEED * (0.7 + Math.random() * 0.6),
          vz: (Math.random() - 0.5) * 0.12,
        });
      }
    } else {
      this.smokeEmitCooldown = 0;
    }

    /* ---- simulate ---- */
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]!;
      particle.age += delta;
      if (particle.age >= SMOKE_LIFE_SEC) {
        this.particles.splice(i, 1);
        continue;
      }
      const drag = 1 - delta * 1.4;
      particle.vx *= drag;
      particle.vy *= drag;
      particle.vz *= drag;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.z += particle.vz * delta;
    }

    for (const particle of this.particles) {
      const i3 = alive * 3;
      this.positions[i3] = particle.x;
      this.positions[i3 + 1] = particle.y;
      this.positions[i3 + 2] = particle.z;
      alive += 1;
    }

    this.geometry.setDrawRange(0, alive);
    if (alive > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      // Oldest particles dominate look — fade the whole trail with mean age.
      const meanAge =
        this.particles.reduce((sum, particle) => sum + particle.age, 0) / this.particles.length;
      const life = 1 - meanAge / SMOKE_LIFE_SEC;
      this.material.opacity = 0.16 * Math.max(0.15, life);
      this.material.size = SMOKE_BASE_SIZE * (1 + meanAge * 1.6);
    }
    this.points.visible = alive > 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
    this.overlay?.remove();
    this.overlay = null;
  }
}
