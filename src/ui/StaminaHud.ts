import { EXHAUST_COOLDOWN_SEC, STAMINA_MAX, type SprintState } from '../player/SprintStamina';

export class StaminaHud {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly cooldown: HTMLElement;
  private readonly label: HTMLElement;

  constructor() {
    this.root = document.getElementById('stamina-hud')!;
    this.fill = this.root.querySelector('.stamina-fill')!;
    this.cooldown = this.root.querySelector('.stamina-cooldown')!;
    this.label = this.root.querySelector('.stamina-label')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(state: SprintState): void {
    const staminaPct = (state.stamina / STAMINA_MAX) * 100;

    if (state.exhaustCooldown > 0) {
      const cooldownPct =
        ((EXHAUST_COOLDOWN_SEC - state.exhaustCooldown) / EXHAUST_COOLDOWN_SEC) * 100;

      this.root.classList.add('exhausted');
      this.root.classList.remove('sprinting');
      this.fill.style.width = '0%';
      this.cooldown.style.width = `${cooldownPct}%`;
      this.label.textContent = `RECOVERY ${Math.ceil(state.exhaustCooldown)}s`;
      return;
    }

    this.root.classList.remove('exhausted');
    this.root.classList.toggle('sprinting', state.isSprinting);
    this.cooldown.style.width = '0%';
    this.fill.style.width = `${staminaPct}%`;
    this.label.textContent = state.isSprinting ? 'SPRINT' : 'STAMINA';
  }
}
