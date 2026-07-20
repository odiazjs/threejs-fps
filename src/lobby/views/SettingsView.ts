import { setLobbyMusicVolume } from '../../audio/initMenuAudio';
import { applyMasterVolume } from '../../audio/masterVolumeBus';
import {
  getStoredLobbyMusicVolume,
  lobbyMusicVolumePercent,
  storeLobbyMusicVolume,
} from '../../settings/lobbyMusicVolume';
import {
  getStoredMasterVolume,
  masterVolumePercent,
} from '../../settings/masterVolume';
import {
  getStoredMouseSensitivity,
  mouseSensitivityPercent,
  storeMouseSensitivity,
} from '../../settings/mouseSensitivity';
import {
  GAME_CONTROLS_HELP,
  INVENTORY_CONTROLS_HELP,
  type ControlHelpEntry,
} from '../../content/controlsHelp';

export class SettingsView {
  private masterSlider: HTMLInputElement | null = null;
  private masterValueLabel: HTMLElement | null = null;
  private onMasterInput: ((event: Event) => void) | null = null;
  private slider: HTMLInputElement | null = null;
  private valueLabel: HTMLElement | null = null;
  private onSliderInput: ((event: Event) => void) | null = null;
  private sensitivitySlider: HTMLInputElement | null = null;
  private sensitivityValueLabel: HTMLElement | null = null;
  private onSensitivityInput: ((event: Event) => void) | null = null;

  mount(): void {
    this.mountMasterVolume();
    this.mountMusicVolume();
    this.mountMouseSensitivity();
    this.renderControlsList();
  }

  unmount(): void {
    if (this.masterSlider && this.onMasterInput) {
      this.masterSlider.removeEventListener('input', this.onMasterInput);
    }
    this.masterSlider = null;
    this.masterValueLabel = null;
    this.onMasterInput = null;

    if (this.slider && this.onSliderInput) {
      this.slider.removeEventListener('input', this.onSliderInput);
    }
    this.slider = null;
    this.valueLabel = null;
    this.onSliderInput = null;

    if (this.sensitivitySlider && this.onSensitivityInput) {
      this.sensitivitySlider.removeEventListener('input', this.onSensitivityInput);
    }
    this.sensitivitySlider = null;
    this.sensitivityValueLabel = null;
    this.onSensitivityInput = null;
  }

  private mountMasterVolume(): void {
    this.masterSlider = document.getElementById('master-volume') as HTMLInputElement | null;
    this.masterValueLabel = document.getElementById('master-volume-value');
    if (!this.masterSlider || !this.masterValueLabel) return;

    const volume = getStoredMasterVolume();
    this.masterSlider.value = String(masterVolumePercent(volume));
    this.updateMasterValueLabel(volume);

    this.onMasterInput = () => {
      const percent = Number(this.masterSlider!.value);
      const nextVolume = applyMasterVolume(percent / 100);
      this.updateMasterValueLabel(nextVolume);
    };

    this.masterSlider.addEventListener('input', this.onMasterInput);
  }

  private mountMusicVolume(): void {
    this.slider = document.getElementById('lobby-music-volume') as HTMLInputElement | null;
    this.valueLabel = document.getElementById('lobby-music-volume-value');
    if (!this.slider || !this.valueLabel) return;

    const volume = getStoredLobbyMusicVolume();
    this.slider.value = String(lobbyMusicVolumePercent(volume));
    this.updateValueLabel(volume);

    this.onSliderInput = () => {
      const percent = Number(this.slider!.value);
      const nextVolume = storeLobbyMusicVolume(percent / 100);
      setLobbyMusicVolume(nextVolume);
      this.updateValueLabel(nextVolume);
    };

    this.slider.addEventListener('input', this.onSliderInput);
  }

  private mountMouseSensitivity(): void {
    this.sensitivitySlider =
      document.getElementById('mouse-sensitivity') as HTMLInputElement | null;
    this.sensitivityValueLabel = document.getElementById('mouse-sensitivity-value');
    if (!this.sensitivitySlider || !this.sensitivityValueLabel) return;

    const sensitivity = getStoredMouseSensitivity();
    this.sensitivitySlider.value = String(mouseSensitivityPercent(sensitivity));
    this.updateSensitivityLabel(sensitivity);

    this.onSensitivityInput = () => {
      const percent = Number(this.sensitivitySlider!.value);
      const next = storeMouseSensitivity(percent / 100);
      this.updateSensitivityLabel(next);
    };

    this.sensitivitySlider.addEventListener('input', this.onSensitivityInput);
  }

  private renderControlsList(): void {
    const list = document.getElementById('settings-controls-list');
    if (!list) return;

    list.replaceChildren();
    for (const entry of GAME_CONTROLS_HELP) {
      list.appendChild(this.createControlRow(entry));
    }

    const inventoryLabel = document.createElement('div');
    inventoryLabel.className = 'settings-controls-section-label';
    inventoryLabel.textContent = 'INVENTORY';
    list.appendChild(inventoryLabel);

    for (const entry of INVENTORY_CONTROLS_HELP) {
      list.appendChild(this.createControlRow(entry));
    }
  }

  private createControlRow(entry: ControlHelpEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-controls-row';

    const keys = document.createElement('span');
    keys.className = 'settings-controls-keys';
    keys.textContent = entry.keys;

    const description = document.createElement('span');
    description.className = 'settings-controls-desc';
    description.textContent = entry.description;

    row.append(keys, description);
    return row;
  }

  private updateMasterValueLabel(volume: number): void {
    if (!this.masterValueLabel) return;
    this.masterValueLabel.textContent = `${masterVolumePercent(volume)}%`;
  }

  private updateValueLabel(volume: number): void {
    if (!this.valueLabel) return;
    this.valueLabel.textContent = `${lobbyMusicVolumePercent(volume)}%`;
  }

  private updateSensitivityLabel(sensitivity: number): void {
    if (!this.sensitivityValueLabel) return;
    this.sensitivityValueLabel.textContent = `${mouseSensitivityPercent(sensitivity)}%`;
  }
}
