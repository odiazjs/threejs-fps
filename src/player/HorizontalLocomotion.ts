/**
 * Horizontal locomotion with continuous velocity.
 * Ground sticks hard to wish (tight, not icy). Air keeps takeoff speed briefly
 * but bleeds sprint surplus so sprint-jumps don't feel rocket-boosted.
 */

export const MOVE_SPEED = 3;
/** Walk/sprint boost when melee is out or no gun is equipped. */
export const UNEQUIPPED_MOVE_SPEED_MULTIPLIER = 1.15;

/** Ground accelerate toward wish (1/sec) — high = snappy, low = ice. */
const GROUND_ACCEL = 48;
/** Ground brake / direction change (1/sec). */
const GROUND_DECEL = 44;
/** Soft air steer toward wish (1/sec). Keep low so jumps don't skate. */
const AIR_CONTROL = 1.4;
/** How fast air speed above walk bleeds off (1/sec). */
const AIR_SURPLUS_DECAY = 5.5;
/** Mild air drag on all horizontal speed (1/sec). */
const AIR_DRAG = 0.8;
/** How fast sprintBlend 0?1 (1/sec). */
const SPRINT_BLEND_SPEED = 14;

export class HorizontalLocomotion {
  velX = 0;
  velZ = 0;
  /** 0 = walk wish, 1 = full sprint wish. */
  sprintBlend = 0;

  reset(): void {
    this.velX = 0;
    this.velZ = 0;
    this.sprintBlend = 0;
  }

  setVelocity(x: number, z: number): void {
    this.velX = x;
    this.velZ = z;
  }

  getSpeed(): number {
    return Math.hypot(this.velX, this.velZ);
  }

  /**
   * Integrate one frame. `wishX/Z` are unnormalized key axes in world XZ
   * (forward/right contributions). `sprintDesired` drives blended sprint speed.
   */
  tick(
    delta: number,
    grounded: boolean,
    wishX: number,
    wishZ: number,
    baseSpeed: number,
    sprintMultiplier: number,
    sprintDesired: boolean,
  ): { deltaX: number; deltaZ: number } {
    const dt = Math.max(0, delta);
    if (dt <= 0) return { deltaX: 0, deltaZ: 0 };

    // Only blend sprint on ground — freeze blend in air so leave-ground
    // doesn't instantly drop the wish while velocity is still catching up.
    if (grounded) {
      const sprintTarget = sprintDesired ? 1 : 0;
      this.sprintBlend +=
        (sprintTarget - this.sprintBlend) *
        (1 - Math.exp(-SPRINT_BLEND_SPEED * dt));
    }

    const wishLen = Math.hypot(wishX, wishZ);
    let nx = 0;
    let nz = 0;
    if (wishLen > 1e-5) {
      nx = wishX / wishLen;
      nz = wishZ / wishLen;
    }

    const wishSpeed =
      baseSpeed * (1 + (sprintMultiplier - 1) * this.sprintBlend);

    if (grounded) {
      this.integrateGround(dt, nx, nz, wishLen > 1e-5, wishSpeed);
    } else {
      this.integrateAir(dt, nx, nz, wishLen > 1e-5, baseSpeed);
    }

    return {
      deltaX: this.velX * dt,
      deltaZ: this.velZ * dt,
    };
  }

  private integrateGround(
    dt: number,
    nx: number,
    nz: number,
    hasWish: boolean,
    wishSpeed: number,
  ): void {
    if (hasWish) {
      const targetX = nx * wishSpeed;
      const targetZ = nz * wishSpeed;
      const along = this.velX * nx + this.velZ * nz;
      const speedingUp = along < wishSpeed - 0.05;
      const rate = speedingUp ? GROUND_ACCEL : GROUND_DECEL;
      const t = 1 - Math.exp(-rate * dt);
      this.velX += (targetX - this.velX) * t;
      this.velZ += (targetZ - this.velZ) * t;
      return;
    }

    const t = 1 - Math.exp(-GROUND_DECEL * dt);
    this.velX += (0 - this.velX) * t;
    this.velZ += (0 - this.velZ) * t;
    if (Math.hypot(this.velX, this.velZ) < 0.04) {
      this.velX = 0;
      this.velZ = 0;
    }
  }

  private integrateAir(
    dt: number,
    nx: number,
    nz: number,
    hasWish: boolean,
    walkSpeed: number,
  ): void {
    let speed = Math.hypot(this.velX, this.velZ);

    // Bleed anything above walk — sprint jump carries briefly, then settles.
    if (speed > walkSpeed) {
      const surplus = speed - walkSpeed;
      speed = walkSpeed + surplus * Math.exp(-AIR_SURPLUS_DECAY * dt);
      if (speed > 1e-5) {
        const inv = 1 / Math.hypot(this.velX, this.velZ);
        this.velX *= speed * inv;
        this.velZ *= speed * inv;
      }
    }

    if (hasWish && speed > 1e-4) {
      let dx = this.velX / speed;
      let dz = this.velZ / speed;
      const t = 1 - Math.exp(-AIR_CONTROL * dt);
      dx += (nx - dx) * t;
      dz += (nz - dz) * t;
      const dLen = Math.hypot(dx, dz);
      if (dLen > 1e-5) {
        // Never gain speed in air — only redirect what you already have.
        this.velX = (dx / dLen) * speed;
        this.velZ = (dz / dLen) * speed;
      }
    } else if (hasWish && speed <= 1e-4) {
      // Standing jump + air strafe: climb toward walk, not sprint.
      const t = 1 - Math.exp(-AIR_CONTROL * dt);
      this.velX += nx * walkSpeed * t * 0.35;
      this.velZ += nz * walkSpeed * t * 0.35;
    }

    const drag = Math.exp(-AIR_DRAG * dt);
    this.velX *= drag;
    this.velZ *= drag;
  }
}
