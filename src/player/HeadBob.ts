import * as THREE from 'three';

export const WALK_BOB = {
  /** Full up-down cycles per second */
  frequency: 2.2,
  amplitude: 0.045,
  /** Lateral sway (m) — keep subtle; strong side-to-side reads as motion sickness. */
  lateralAmplitude: 0.0035,
  /** Tiny roll (rad) with lateral. */
  rollAmplitude: 0.0035,
};

export const SPRINT_BOB = {
  frequency: 3.2,
  amplitude: 0.078,
  lateralAmplitude: 0.0055,
  rollAmplitude: 0.0055,
};

const BLEND_IN_SPEED = 8;
const BLEND_OUT_SPEED = 12;
/** Smooth walk↔sprint bob params so cadence doesn't hard-swap. */
const SPRINT_PARAM_BLEND_SPEED = 9;

/**
 * Smooth camera bob on a rig group (Y + light lateral/roll).
 * The wave is applied directly (no per-frame lerp on the sine) so it stays fluid.
 * Phase is exposed so weapon walk bob can stay footstep-synced.
 */
export class HeadBob {
  private phase = 0;
  private blend = 0;
  private sprintMix = 0;

  update(delta: number, active: boolean, sprinting: boolean): void {
    const blendSpeed = active ? BLEND_IN_SPEED : BLEND_OUT_SPEED;
    const targetBlend = active ? 1 : 0;

    this.blend += (targetBlend - this.blend) * (1 - Math.exp(-blendSpeed * delta));
    this.sprintMix +=
      ((sprinting ? 1 : 0) - this.sprintMix) *
      (1 - Math.exp(-SPRINT_PARAM_BLEND_SPEED * delta));

    const frequency = THREE.MathUtils.lerp(
      WALK_BOB.frequency,
      SPRINT_BOB.frequency,
      this.sprintMix,
    );

    if (active) {
      this.phase += delta * frequency;
    }

    if (this.blend < 0.001 && !active) {
      this.blend = 0;
      this.phase = 0;
      this.sprintMix = 0;
    }
  }

  /** Walk/sprint bob phase in cycles (for weapon sway sync). */
  getPhase(): number {
    return this.phase;
  }

  getBlend(): number {
    return this.blend;
  }

  apply(rig: THREE.Group, _sprinting: boolean): void {
    const m = this.sprintMix;
    const amplitude = THREE.MathUtils.lerp(WALK_BOB.amplitude, SPRINT_BOB.amplitude, m);
    const lateral = THREE.MathUtils.lerp(
      WALK_BOB.lateralAmplitude,
      SPRINT_BOB.lateralAmplitude,
      m,
    );
    const roll = THREE.MathUtils.lerp(WALK_BOB.rollAmplitude, SPRINT_BOB.rollAmplitude, m);

    const wave = Math.sin(this.phase * Math.PI * 2);
    const side = Math.sin(this.phase * Math.PI * 2 + Math.PI * 0.5);
    const b = this.blend;

    rig.position.y = wave * amplitude * b;
    rig.position.x = side * lateral * b;
    // Keep Z clean — HeadBob only owns vertical + lateral camera feel.
    rig.rotation.z = side * roll * b;
  }

  reset(): void {
    this.phase = 0;
    this.blend = 0;
    this.sprintMix = 0;
  }
}
