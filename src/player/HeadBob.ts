import * as THREE from 'three';

const WALK_BOB = {
  /** Full up-down cycles per second */
  frequency: 2.2,
  amplitude: 0.04,
};

const SPRINT_BOB = {
  frequency: 3.2,
  amplitude: 0.072,
};

const BLEND_IN_SPEED = 8;
const BLEND_OUT_SPEED = 12;

/**
 * Smooth vertical sine bob on a rig group.
 * The wave is applied directly (no per-frame lerp on the sine) so it stays fluid.
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

  apply(rig: THREE.Group, sprinting: boolean): void {
    const bob = sprinting ? SPRINT_BOB : WALK_BOB;
    const wave = Math.sin(this.phase * Math.PI * 2);
    rig.position.y = wave * bob.amplitude * this.blend;
  }

  reset(): void {
    this.phase = 0;
    this.blend = 0;
  }
}
