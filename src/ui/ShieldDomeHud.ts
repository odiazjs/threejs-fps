import type { ShieldDomeHudState } from '../../shared/combat/shieldDomeAbility';

export class ShieldDomeHud {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly label: HTMLElement;
  private hudVisible = false;

  constructor() {
    this.root = document.getElementById('shield-dome-hud')!;
    this.fill = this.root.querySelector('.shield-dome-fill')!;
    this.label = this.root.querySelector('.shield-dome-label')!;
  }

  setVisible(visible: boolean): void {
    this.hudVisible = visible;
    if (!visible) {
      this.root.hidden = true;
    }
  }

  update(state: ShieldDomeHudState): void {
    if (!this.hudVisible) {
      this.root.hidden = true;
      return;
    }

    this.root.hidden = false;

    if (state.mode === 'ready') {
      this.root.classList.add('ready');
      this.root.classList.remove('active', 'cooldown', 'charging');
      this.fill.style.width = '100%';
      this.label.textContent = 'SHIELD DOME [Q]';
      return;
    }

    if (state.mode === 'charging') {
      this.root.classList.add('charging');
      this.root.classList.remove('ready', 'active', 'cooldown');
      const pct = ((state.duration - state.remaining) / state.duration) * 100;
      this.fill.style.width = `${pct}%`;
      this.label.textContent = `DEPLOYING ${Math.ceil(state.remaining)}s`;
      return;
    }

    if (state.mode === 'active') {
      this.root.classList.add('active');
      this.root.classList.remove('ready', 'cooldown', 'charging');
      const pct = ((state.duration - state.remaining) / state.duration) * 100;
      this.fill.style.width = `${pct}%`;
      this.label.textContent = `COOLDOWN ${Math.ceil(state.remaining)}s`;
      return;
    }

    this.root.classList.add('cooldown');
    this.root.classList.remove('ready', 'active', 'charging');
    const pct = ((state.duration - state.remaining) / state.duration) * 100;
    this.fill.style.width = `${pct}%`;
    this.label.textContent = `COOLDOWN ${Math.ceil(state.remaining)}s`;
  }
}
