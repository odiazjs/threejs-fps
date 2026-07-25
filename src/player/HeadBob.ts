import * as THREE from 'three';

export const WALK_BOB = {
  /** Full up-down cycles per second */
  frequency: 2.2,
  amplitude: 0.045,
  /** Lateral sway (m) — opposite foot. */
  lateralAmplitude: 0.012,
  /** Tiny roll (rad) with lateral. */
  rollAmplitude: 0.012,
};

export const SPRINT_BOB = {
  frequency: 3.2,
  amplitude: 0.078,
  lateralAmplitude: 0.018,
  rollAmplitude: 0.018,
};

const BLEND_IN_SPEED = 8;
const BLEND_OUT_SPEED = 12;

/**
 * Smooth camera bob on a rig group (Y + light lateral/roll).
 * The wave is applied directly (no per-frame lerp on the sine) so it stays fluid.
 * Phase is exposed so weapon walk bob can stay footstep-synced.
 */
export class HeadBob {
  private phase = 0;
  private blend = 0;

  update(delta: number, active: boolean, sprinting: boolean): void {
    const bob = sprinting ? SPRINT_BOB : WALK_BOB;
    const blendSpeed = active ? BLEND_IN_SPEED : BLEND_OUT_SPEED;
    const targetBlend = active ? 1 : 0;

    this.blend += (targetBlend - this.blend) * (1 - Math.exp(-blendSpeed * delta));

    if (active) {
      this.phase += delta * bob.frequency;
    }

    if (this.blend < 0.001 && !active) {
      this.blend = 0;
      this.phase = 0;
    }
  }

  /** Walk/sprint bob phase in cycles (for weapon sway sync). */
  getPhase(): number {
    return this.phase;
  }

  getBlend(): number {
    return this.blend;
  }

  apply(rig: THREE.Group, sprinting: boolean): void {
    const bob = sprinting ? SPRINT_BOB : WALK_BOB;
    const wave = Math.sin(this.phase * Math.PI * 2);
    const side = Math.sin(this.phase * Math.PI * 2 + Math.PI * 0.5);
    const b = this.blend;

    rig.position.y = wave * bob.amplitude * b;
    rig.position.x = side * bob.lateralAmplitude * b;
    // Keep Z clean — HeadBob only owns vertical + lateral camera feel.
    rig.rotation.z = side * bob.rollAmplitude * b;
  }

  reset(): void {
    this.phase = 0;
    this.blend = 0;
  }
}
