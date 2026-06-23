import type { LocalCombatState } from '../network/types';

export class HealthHud {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly value: HTMLElement;

  constructor() {
    this.root = document.getElementById('health-hud')!;
    this.fill = this.root.querySelector('.health-fill')!;
    this.value = this.root.querySelector('.health-value')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(state: LocalCombatState): void {
    const pct = (state.hp / state.maxHp) * 100;
    this.fill.style.width = `${pct}%`;
    this.value.textContent = `${Math.ceil(state.hp)}`;
    this.root.classList.toggle('dead', !state.alive);
  }
}
