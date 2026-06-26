import type { LoadoutAmmoState } from '../combat/WeaponLoadout';

export class AmmoHud {
  private readonly root: HTMLElement;
  private readonly weaponEl: HTMLElement;
  private readonly clipEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly reloadRoot: HTMLElement;
  private readonly reloadFill: HTMLElement;
  private hudVisible = false;

  constructor() {
    this.root = document.getElementById('ammo-hud')!;
    this.weaponEl = this.root.querySelector('.ammo-weapon-name')!;
    this.clipEl = this.root.querySelector('.ammo-clip')!;
    this.statusEl = this.root.querySelector('.ammo-status')!;
    this.reloadRoot = document.getElementById('reload-hud')!;
    this.reloadFill = this.reloadRoot.querySelector('.reload-fill')!;
  }

  setVisible(visible: boolean): void {
    this.hudVisible = visible;
    this.root.hidden = !visible;
    if (!visible) {
      this.reloadRoot.hidden = true;
    }
  }

  update(state: LoadoutAmmoState): void {
    this.weaponEl.textContent = `${state.weaponName} [${state.slotIndex + 1}]`;
    this.clipEl.textContent = `${state.clip} / ${state.reserveRounds}`;

    this.root.classList.toggle('reloading', state.reloading);
    this.root.classList.toggle('empty', state.outOfAmmo);

    if (state.reloading) {
      this.statusEl.hidden = true;
      this.reloadRoot.hidden = !this.hudVisible;
      this.reloadFill.style.width = `${state.reloadProgress * 100}%`;
      return;
    }

    this.reloadRoot.hidden = true;
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
