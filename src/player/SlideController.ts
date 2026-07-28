/** Timed sprint/land-slide with look-steering and friction. */
export const SLIDE_DURATION_SEC = 1.2;
/** Peak horizontal speed at full sprint charge (units/sec). */
export const SLIDE_PEAK_SPEED = 9.2 * 1.15 * 1.15;
/** Minimum peak when sliding with no sprint charge (e.g. jump-only land). */
export const SLIDE_PEAK_SPEED_MIN = 4.0 * 1.15 * 1.15;
/** Floor speed the slide eases toward near the end (scales with start peak). */
export const SLIDE_END_SPEED = 3.2 * 1.15 * 1.15;
export const SLIDE_END_SPEED_MIN = 2.0 * 1.15 * 1.15;
/** Shortest / longest slide duration from charge. */
export const SLIDE_DURATION_MIN_SEC = 0.65;
/** After landing from air, C can start a slide without sprinting. */
export const LAND_SLIDE_GRACE_SEC = 0.28;
/** Continuous sprint time that fills slide charge to 100%. */
export const SPRINT_CHARGE_FULL_SEC = 1.1;

/** Continuous drag while sliding (1/sec) — higher = less icy. */
const BASE_FRICTION = 1.9;
/** Extra drag when look heading disagrees with slide heading (1/sec at full turn). */
const TURN_FRICTION = 4.5;
/** How quickly slide heading tracks look (1/sec). */
const STEER_RATE = 4.2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class SlideController {
  private remainingSec = 0;
  private durationSec = SLIDE_DURATION_SEC;
  private dirX = 0;
  private dirZ = 0;
  private speed = 0;
  private peakSpeed = SLIDE_PEAK_SPEED;
  private endSpeed = SLIDE_END_SPEED;

  isActive(): boolean {
    return this.remainingSec > 0;
  }

  getSpeed(): number {
    return this.speed;
  }

  getVelocity(): { x: number; z: number } {
    return { x: this.dirX * this.speed, z: this.dirZ * this.speed };
  }

  /**
   * Begin a slide along a flat forward vector.
   * `charge01` 0 = minimum (jump-only land), 1 = full current slide force (cap).
   * `entrySpeed` = current horizontal speed — avoids a hard 6→12 snap from sprint.
   */
  tryStart(
    forwardX: number,
    forwardZ: number,
    charge01 = 1,
    entrySpeed = 0,
  ): boolean {
    if (this.remainingSec > 0) return false;
    const len = Math.hypot(forwardX, forwardZ);
    if (len < 1e-4) return false;

    const charge = Math.max(0, Math.min(1, charge01));
    this.dirX = forwardX / len;
    this.dirZ = forwardZ / len;
    this.peakSpeed = lerp(SLIDE_PEAK_SPEED_MIN, SLIDE_PEAK_SPEED, charge);
    this.endSpeed = lerp(SLIDE_END_SPEED_MIN, SLIDE_END_SPEED, charge);
    this.durationSec = lerp(SLIDE_DURATION_MIN_SEC, SLIDE_DURATION_SEC, charge);

    // Ease into the peak from current momentum instead of teleporting to peak.
    const entry = Math.max(0, entrySpeed);
    this.speed = Math.min(this.peakSpeed, Math.max(entry, this.peakSpeed * 0.72));
    this.remainingSec = this.durationSec;
    return true;
  }

  /**
   * End the slide and return residual velocity for locomotion handoff
   * (jump-cancel / timer end / airborne cancel).
   */
  cancel(): { x: number; z: number; speed: number } {
    const out = {
      x: this.dirX * this.speed,
      z: this.dirZ * this.speed,
      speed: this.speed,
    };
    this.remainingSec = 0;
    this.speed = 0;
    return out;
  }

  /**
   * Advance the slide toward `lookX/Z`, applying base + turn friction.
   * Look vector should be normalized on XZ (zero-length keeps current heading).
   */
  tick(delta: number, lookX: number, lookZ: number): { x: number; z: number } {
    if (this.remainingSec <= 0 || delta <= 0) return { x: 0, z: 0 };

    let lx = this.dirX;
    let lz = this.dirZ;
    const lookLen = Math.hypot(lookX, lookZ);
    if (lookLen > 1e-4) {
      lx = lookX / lookLen;
      lz = lookZ / lookLen;
    }

    // Steer slide heading toward look.
    const steer = 1 - Math.exp(-STEER_RATE * delta);
    let nx = this.dirX + (lx - this.dirX) * steer;
    let nz = this.dirZ + (lz - this.dirZ) * steer;
    const nLen = Math.hypot(nx, nz);
    if (nLen > 1e-4) {
      this.dirX = nx / nLen;
      this.dirZ = nz / nLen;
    }

    // Misalignment (0 aligned → 1 opposite) adds grip / kills slip when turning.
    const align = Math.max(-1, Math.min(1, this.dirX * lx + this.dirZ * lz));
    const turnFactor = 1 - (align + 1) * 0.5; // 0 aligned, 1 opposite
    const friction = BASE_FRICTION + TURN_FRICTION * turnFactor;
    this.speed *= Math.exp(-friction * delta);

    // Soft time-based taper toward end speed so the timer still matters.
    const u = 1 - this.remainingSec / this.durationSec;
    const ease = u * u * (3 - 2 * u);
    const timedFloor = this.peakSpeed + (this.endSpeed - this.peakSpeed) * ease;
    // Keep the slower of friction decay and the timed curve.
    this.speed = Math.min(this.speed, timedFloor);
    this.speed = Math.max(this.speed, 0);

    // Ease up toward peak in the first ~15% so entry isn't a hard cliff.
    if (u < 0.15) {
      const rise = u / 0.15;
      const easeIn = rise * rise * (3 - 2 * rise);
      const entryFloor = this.endSpeed + (this.peakSpeed - this.endSpeed) * easeIn;
      this.speed = Math.max(this.speed, Math.min(this.peakSpeed, entryFloor));
    }

    const dist = this.speed * delta;
    this.remainingSec = Math.max(0, this.remainingSec - delta);
    // Keep speed for handoff after the final tick; Player.cancel/capture clears it.

    return { x: this.dirX * dist, z: this.dirZ * dist };
  }
}
