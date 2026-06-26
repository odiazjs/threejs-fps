export const SPRINT_MULTIPLIER = 2;
export const STAMINA_MAX = 1;
export const STAMINA_DRAIN_PER_SEC = 0.3;
export const EXHAUST_COOLDOWN_SEC = 5;
export const STAMINA_REGEN_PER_SEC = 0.35;

export interface SprintState {
  stamina: number;
  exhaustCooldown: number;
  isSprinting: boolean;
}

export class SprintStamina {
  private stamina = STAMINA_MAX;
  private exhaustCooldown = 0;
  private sprinting = false;

  getState(): SprintState {
    return {
      stamina: this.stamina,
      exhaustCooldown: this.exhaustCooldown,
      isSprinting: this.sprinting,
    };
  }

  update(delta: number, wantsSprint: boolean): boolean {
    this.sprinting = false;

    if (this.exhaustCooldown > 0) {
      this.exhaustCooldown = Math.max(0, this.exhaustCooldown - delta);
      return false;
    }

    if (wantsSprint && this.stamina > 0) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN_PER_SEC * delta);
      this.sprinting = true;

      if (this.stamina <= 0) {
        this.exhaustCooldown = EXHAUST_COOLDOWN_SEC;
      }

      return true;
    }

    if (this.stamina < STAMINA_MAX) {
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN_PER_SEC * delta);
    }

    return false;
  }
}
