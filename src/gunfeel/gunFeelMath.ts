/**
 * Math core for the gun-feel systems: spring-dampers (Hooke's law with a
 * damping term), recovery easing curves, and cheap layered value noise.
 *
 * All feel systems are built on these three primitives so tuning stays in
 * data (see feelProfiles.ts) rather than in bespoke per-system math.
 */

/** Springs never integrate more than this per sub-step — keeps stiff springs stable at low FPS. */
const MAX_SPRING_STEP_SEC = 1 / 120;

/**
 * Damped harmonic oscillator (Hooke's law: a = -k·x - c·v), integrated with
 * semi-implicit Euler. Shots inject velocity impulses; the spring snaps out
 * and settles back to the target on its own.
 *
 * dampingRatio: 1 = critically damped (fastest non-overshooting return),
 * <1 = springy overshoot, >1 = sluggish. c is derived as 2·ζ·√k.
 */
export class SpringDamper1D {
  value = 0;
  velocity = 0;

  private stiffness: number;
  private damping: number;

  constructor(stiffness: number, dampingRatio: number) {
    this.stiffness = stiffness;
    this.damping = 2 * dampingRatio * Math.sqrt(stiffness);
  }

  configure(stiffness: number, dampingRatio: number): void {
    this.stiffness = stiffness;
    this.damping = 2 * dampingRatio * Math.sqrt(stiffness);
  }

  /** Instant velocity kick — the "hit" of a shot. */
  impulse(velocityDelta: number): void {
    this.velocity += velocityDelta;
  }

  /** Advance toward `target` (defaults to rest at 0). */
  update(delta: number, target = 0): void {
    let remaining = Math.min(delta, 0.1);
    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_SPRING_STEP_SEC);
      remaining -= dt;
      const displacement = this.value - target;
      this.velocity += (-this.stiffness * displacement - this.damping * this.velocity) * dt;
      this.value += this.velocity * dt;
    }

    if (Math.abs(this.value - target) < 1e-6 && Math.abs(this.velocity) < 1e-5) {
      this.value = target;
      this.velocity = 0;
    }
  }

  reset(): void {
    this.value = 0;
    this.velocity = 0;
  }
}

/** Recovery easing shapes — picked per weapon in the feel profile. */
export type RecoveryCurve = 'easeOutCubic' | 'easeOutQuart' | 'easeOutExpo' | 'easeOutBack';

export function sampleRecoveryCurve(curve: RecoveryCurve, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (curve) {
    case 'easeOutCubic':
      return 1 - Math.pow(1 - x, 3);
    case 'easeOutQuart':
      return 1 - Math.pow(1 - x, 4);
    case 'easeOutExpo':
      return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case 'easeOutBack': {
      const c1 = 1.20158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
  }
}

/** Exponential smoothing factor that is framerate independent. */
export function expBlend(speed: number, delta: number): number {
  return 1 - Math.exp(-speed * delta);
}

function hash1D(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Smooth 1D value noise in [-1, 1] — cheap Perlin stand-in for organic sway. */
export function valueNoise1D(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1D(i + seed * 57.31);
  const b = hash1D(i + 1 + seed * 57.31);
  return a + (b - a) * u;
}

/** Two-octave layered noise — the "hand is alive" wobble under the figure-8. */
export function layeredNoise1D(t: number, seed: number): number {
  return valueNoise1D(t, seed) * 0.68 + valueNoise1D(t * 2.7, seed + 13.7) * 0.32;
}
