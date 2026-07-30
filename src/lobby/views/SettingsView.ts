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
import {
  getStoredGraphicsQualityPreference,
  invalidateGraphicsQualityCache,
  resolveGraphicsQuality,
  storeGraphicsQualityPreference,
  type GraphicsQualityPreference,
} from '../../render/graphicsQuality';

export class SettingsView {
  private root: HTMLElement | null = null;
  private masterSlider: HTMLInputElement | null = null;
  private masterValueLabel: HTMLElement | null = null;
  private onMasterInput: ((event: Event) => void) | null = null;
  private slider: HTMLInputElement | null = null;
  private valueLabel: HTMLElement | null = null;
  private onSliderInput: ((event: Event) => void) | null = null;
  private sensitivitySlider: HTMLInputElement | null = null;
  private sensitivityValueLabel: HTMLElement | null = null;
  private onSensitivityInput: ((event: Event) => void) | null = null;
  private graphicsSelect: HTMLSelectElement | null = null;
  private graphicsValueLabel: HTMLElement | null = null;
  private graphicsApplyBtn: HTMLButtonElement | null = null;
  private onGraphicsChange: ((event: Event) => void) | null = null;
  private onGraphicsApply: ((event: Event) => void) | null = null;
  private graphicsStoredPreference: GraphicsQualityPreference = 'auto';

  mount(root: HTMLElement = document.getElementById('app-view-settings')!): void {
    this.unmount();
    this.root = root;
    this.mountMasterVolume();
    this.mountMusicVolume();
    this.mountMouseSensitivity();
    this.mountGraphicsQuality();
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

    if (this.graphicsSelect && this.onGraphicsChange) {
      this.graphicsSelect.removeEventListener('change', this.onGraphicsChange);
    }
    if (this.graphicsApplyBtn && this.onGraphicsApply) {
      this.graphicsApplyBtn.removeEventListener('click', this.onGraphicsApply);
    }
    this.graphicsSelect = null;
    this.graphicsValueLabel = null;
    this.graphicsApplyBtn = null;
    this.onGraphicsChange = null;
    this.onGraphicsApply = null;
    this.root = null;
  }

  private query<T extends Element>(selector: string): T | null {
    return (this.root?.querySelector(selector) ?? null) as T | null;
  }

  private mountMasterVolume(): void {
    this.masterSlider = this.query<HTMLInputElement>('[data-setting="master-volume"]');
    this.masterValueLabel = this.query<HTMLElement>('[data-setting-value="master-volume"]');
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
    this.slider = this.query<HTMLInputElement>('[data-setting="lobby-music-volume"]');
    this.valueLabel = this.query<HTMLElement>('[data-setting-value="lobby-music-volume"]');
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
    this.sensitivitySlider = this.query<HTMLInputElement>('[data-setting="mouse-sensitivity"]');
    this.sensitivityValueLabel = this.query<HTMLElement>('[data-setting-value="mouse-sensitivity"]');
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

  private mountGraphicsQuality(): void {
    this.graphicsSelect = this.query<HTMLSelectElement>('[data-setting="graphics-quality"]');
    this.graphicsValueLabel = this.query<HTMLElement>(
      '[data-setting-value="graphics-quality"]',
    );
    this.graphicsApplyBtn = this.query<HTMLButtonElement>(
      '[data-setting-apply="graphics-quality"]',
    );
    if (!this.graphicsSelect) return;

    this.graphicsStoredPreference = getStoredGraphicsQualityPreference();
    this.graphicsSelect.value = this.graphicsStoredPreference;
    this.updateGraphicsLabel(this.graphicsStoredPreference);
    this.syncGraphicsApplyEnabled();

    this.onGraphicsChange = () => {
      const next = this.graphicsSelect!.value as GraphicsQualityPreference;
      this.updateGraphicsLabel(next);
      this.syncGraphicsApplyEnabled();
    };
    this.graphicsSelect.addEventListener('change', this.onGraphicsChange);

    if (this.graphicsApplyBtn) {
      this.onGraphicsApply = () => {
        const next = this.graphicsSelect!.value as GraphicsQualityPreference;
        storeGraphicsQualityPreference(next);
        invalidateGraphicsQualityCache();
        this.graphicsStoredPreference = next;
        this.graphicsApplyBtn!.disabled = true;
        this.graphicsApplyBtn!.textContent = 'RELOADING…';
        window.location.reload();
      };
      this.graphicsApplyBtn.addEventListener('click', this.onGraphicsApply);
    }
  }

  private syncGraphicsApplyEnabled(): void {
    if (!this.graphicsApplyBtn || !this.graphicsSelect) return;
    const pending = this.graphicsSelect.value as GraphicsQualityPreference;
    this.graphicsApplyBtn.disabled = pending === this.graphicsStoredPreference;
  }

  private updateGraphicsLabel(preference: GraphicsQualityPreference): void {
    if (!this.graphicsValueLabel) return;
    if (preference === 'auto') {
      const resolved = resolveGraphicsQuality().tier.toUpperCase();
      this.graphicsValueLabel.textContent = `AUTO → ${resolved}`;
      return;
    }
    this.graphicsValueLabel.textContent = preference.toUpperCase();
  }

  private renderControlsList(): void {
    const list = this.query<HTMLElement>('[data-setting="controls-list"]');
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
