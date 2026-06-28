import type { LocalCombatState } from '../network/types';
import { SHIELD_MAX_LEVEL } from '../../shared/combat/shield';

export class HealthHud {
  private readonly root: HTMLElement;
  private readonly shieldRoot: HTMLElement;
  private readonly shieldFill: HTMLElement;
  private readonly shieldValue: HTMLElement;
  private readonly shieldLevels: readonly HTMLElement[];
  private readonly healthFill: HTMLElement;
  private readonly healthValue: HTMLElement;

  constructor() {
    this.root = document.getElementById('health-hud')!;
    this.shieldRoot = this.root.querySelector('.shield-hud')!;
    this.shieldFill = this.shieldRoot.querySelector('.shield-fill')!;
    this.shieldValue = this.shieldRoot.querySelector('.shield-value')!;
    this.shieldLevels = [...this.shieldRoot.querySelectorAll<HTMLElement>('.shield-level')];
    this.healthFill = this.root.querySelector('.health-fill')!;
    this.healthValue = this.root.querySelector('.health-value')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(state: LocalCombatState): void {
    const healthPct = (state.hp / state.maxHp) * 100;
    this.healthFill.style.width = `${healthPct}%`;
    this.healthValue.textContent = `${Math.ceil(state.hp)}`;

    const capacity = state.shieldCapacity;
    const shieldPct =
      capacity > 0 ? Math.min(100, (state.shieldPoints / capacity) * 100) : 0;
    const tierWidthPct = (state.shieldLevel / SHIELD_MAX_LEVEL) * 100;

    this.shieldFill.style.width = `${(shieldPct / 100) * tierWidthPct}%`;
    this.shieldValue.textContent = `${Math.ceil(state.shieldPoints)}`;

    for (let i = 0; i < this.shieldLevels.length; i++) {
      const levelEl = this.shieldLevels[i]!;
      const tier = i + 1;
      levelEl.classList.toggle('active', tier <= state.shieldLevel);
      levelEl.classList.toggle('broken', tier <= state.shieldLevel && state.shieldPoints <= 0);
    }

    this.shieldRoot.classList.toggle('depleted', state.shieldPoints <= 0);
    this.root.classList.toggle('dead', !state.alive);
  }
}
