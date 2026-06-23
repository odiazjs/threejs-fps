import type { AmmoState } from '../combat/WeaponAmmo';

export class AmmoHud {
  private readonly root: HTMLElement;
  private readonly clipEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly reloadTrack: HTMLElement;
  private readonly reloadFill: HTMLElement;

  constructor() {
    this.root = document.getElementById('ammo-hud')!;
    this.clipEl = this.root.querySelector('.ammo-clip')!;
    this.statusEl = this.root.querySelector('.ammo-status')!;
    this.reloadTrack = this.root.querySelector('.ammo-reload-track')!;
    this.reloadFill = this.root.querySelector('.ammo-reload-fill')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(state: AmmoState): void {
    this.clipEl.textContent = `${state.clip} / ${state.reserveRounds}`;

    this.root.classList.toggle('reloading', state.reloading);
    this.root.classList.toggle('empty', state.outOfAmmo);

    if (state.reloading) {
      this.statusEl.hidden = false;
      this.statusEl.textContent = 'RELOADING';
      this.reloadTrack.hidden = false;
      this.reloadFill.style.width = `${state.reloadProgress * 100}%`;
      return;
    }

    this.reloadTrack.hidden = true;
    this.reloadFill.style.width = '0%';

    if (state.outOfAmmo) {
      this.statusEl.hidden = false;
      this.statusEl.textContent = 'OUT OF AMMO';
      return;
    }

    if (state.canReload) {
      this.statusEl.hidden = false;
      this.statusEl.textContent = 'PRESS R TO RELOAD';
      return;
    }

    this.statusEl.hidden = true;
  }
}
