import type { ShieldRechargeState } from '../../shared/combat/shieldRecharge';

export class ShieldRechargeHud {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private hudVisible = false;

  constructor() {
    this.root = document.getElementById('shield-recharge-hud')!;
    this.fill = this.root.querySelector('.shield-recharge-fill')!;
  }

  setVisible(visible: boolean): void {
    this.hudVisible = visible;
    if (!visible) {
      this.root.hidden = true;
    }
  }

  update(state: ShieldRechargeState): void {
    if (!state.recharging || !this.hudVisible) {
      this.root.hidden = true;
      this.fill.style.width = '0%';
      return;
    }

    this.root.hidden = false;
    this.fill.style.width = `${state.progress * 100}%`;
  }
}
