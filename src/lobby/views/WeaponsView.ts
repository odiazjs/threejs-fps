import { ArmoryLoadoutsController } from '../../armory/ArmoryLoadoutsController';
import { ArmoryWeaponStatsPanel } from '../../armory/ArmoryWeaponStatsPanel';
import type { WeaponId } from '../../../shared/content/weaponIds';
import { isPickableWeaponId } from '../../../shared/content/weaponIds';
import { WeaponsScene } from '../../weapons/WeaponsScene';

function firstPickerWeaponId(picker: HTMLElement): WeaponId {
  const first = picker.querySelector<HTMLButtonElement>('.weapons-picker-btn[data-weapon-id]');
  const id = first?.dataset.weaponId?.trim() ?? '';
  if (isPickableWeaponId(id)) return id;
  return 'pistol';
}

export class WeaponsView {
  private scene: WeaponsScene | null = null;
  private loadouts: ArmoryLoadoutsController | null = null;
  private statsPanel: ArmoryWeaponStatsPanel | null = null;

  async mount(): Promise<void> {
    this.unmount();

    const canvasHost = document.getElementById('weapons-canvas')!;
    const picker = document.getElementById('weapons-picker')!;
    const grid = document.getElementById('armory-loadout-grid')!;
    const createBtn = document.getElementById('armory-create-loadout-btn') as HTMLButtonElement;
    const saveBtn = document.getElementById('armory-save-loadout-btn') as HTMLButtonElement;
    const statusEl = document.getElementById('armory-loadout-status');
    const statsTitle = document.getElementById('armory-weapon-stats-title')!;
    const statsStatus = document.getElementById('armory-weapon-stats-status');
    const statsBody = document.getElementById('armory-weapon-stats-body')!;

    this.statsPanel = new ArmoryWeaponStatsPanel(statsTitle, statsStatus, statsBody);
    this.scene = new WeaponsScene(canvasHost, picker, (weaponId) => {
      this.statsPanel?.showWeapon(weaponId);
    });
    this.loadouts = new ArmoryLoadoutsController(
      grid,
      picker,
      createBtn,
      saveBtn,
      statusEl,
      (weaponId) => {
        void this.scene?.showWeapon(weaponId);
      },
    );

    await Promise.all([this.scene.whenReady(), this.loadouts.mount()]);

    const defaultPrimary = this.loadouts.getDefaultPrimaryWeaponId();
    const initialWeaponId =
      defaultPrimary && isPickableWeaponId(defaultPrimary)
        ? defaultPrimary
        : firstPickerWeaponId(picker);

    await this.scene.showWeapon(initialWeaponId);
    await this.statsPanel.mount(initialWeaponId);

    // Loading veil / stats panel can change stage size after first paint.
    this.scene.refreshViewport();
  }

  refreshViewport(): void {
    this.scene?.refreshViewport();
  }

  unmount(): void {
    this.statsPanel?.dispose();
    this.statsPanel = null;
    this.loadouts?.dispose();
    this.loadouts = null;
    this.scene?.dispose();
    this.scene = null;
  }
}
