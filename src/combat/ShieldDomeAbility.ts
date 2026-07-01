import {
  SHIELD_DOME_ACTIVATE_KEY,
} from '../../shared/combat/shieldDomeAbility';

export interface ShieldDomeActivateContext {
  isSprinting: boolean;
  isJumping: boolean;
  grounded: boolean;
  shooting: boolean;
  reloading: boolean;
  ads: boolean;
}

export type ShieldDomeChargeCallback = () => void;

export class ShieldDomeAbility {
  private domeEndAt = 0;
  private domeCooldownEndAt = 0;
  private domeChargeEndAt = 0;
  private onStartCharge: ShieldDomeChargeCallback | null = null;

  setServerState(
    domeEndAt: number,
    cooldownEndAt: number,
    chargeEndAt: number,
  ): void {
    this.domeEndAt = domeEndAt;
    this.domeCooldownEndAt = cooldownEndAt;
    this.domeChargeEndAt = chargeEndAt;
  }

  setStartChargeCallback(callback: ShieldDomeChargeCallback | null): void {
    this.onStartCharge = callback;
  }

  tryActivate(
    keyJustPressed: boolean,
    context: ShieldDomeActivateContext,
    worldTime: number,
  ): boolean {
    if (!keyJustPressed || !this.canActivate(context, worldTime)) return false;
    this.onStartCharge?.();
    return true;
  }

  canActivate(context: ShieldDomeActivateContext, worldTime: number): boolean {
    return (
      worldTime >= this.domeCooldownEndAt &&
      worldTime >= this.domeEndAt &&
      worldTime >= this.domeChargeEndAt &&
      context.grounded &&
      !context.isSprinting &&
      !context.isJumping &&
      !context.shooting &&
      !context.reloading &&
      !context.ads
    );
  }

  static activateKey = SHIELD_DOME_ACTIVATE_KEY;
}
