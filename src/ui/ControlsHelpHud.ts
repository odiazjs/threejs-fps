import {
  GAME_CONTROLS_HELP,
  INVENTORY_CONTROLS_HELP,
  type ControlHelpEntry,
} from '../content/controlsHelp';

export class ControlsHelpHud {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.root = document.getElementById('controls-help-hud')!;
    this.list = this.root.querySelector('.controls-help-list')!;
    this.renderEntries(GAME_CONTROLS_HELP);

    const inventorySection = document.createElement('div');
    inventorySection.className = 'controls-help-section';
    inventorySection.innerHTML = '<div class="controls-help-section-label">INVENTORY</div>';
    const inventoryList = document.createElement('div');
    inventoryList.className = 'controls-help-list controls-help-list--nested';
    for (const entry of INVENTORY_CONTROLS_HELP) {
      inventoryList.appendChild(this.createRow(entry));
    }
    inventorySection.appendChild(inventoryList);
    this.root.appendChild(inventorySection);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  private renderEntries(entries: readonly ControlHelpEntry[]): void {
    this.list.replaceChildren();
    for (const entry of entries) {
      this.list.appendChild(this.createRow(entry));
    }
  }

  private createRow(entry: ControlHelpEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'controls-help-row';

    const keys = document.createElement('span');
    keys.className = 'controls-help-keys';
    keys.textContent = entry.keys;

    const description = document.createElement('span');
    description.className = 'controls-help-desc';
    description.textContent = entry.description;

    row.append(keys, description);
    return row;
  }
}
