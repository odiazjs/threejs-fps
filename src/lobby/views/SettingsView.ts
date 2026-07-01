import { setLobbyMusicVolume } from '../../audio/initMenuAudio';
import {
  getStoredLobbyMusicVolume,
  lobbyMusicVolumePercent,
  storeLobbyMusicVolume,
} from '../../settings/lobbyMusicVolume';

export class SettingsView {
  private slider: HTMLInputElement | null = null;
  private valueLabel: HTMLElement | null = null;
  private onSliderInput: ((event: Event) => void) | null = null;

  mount(): void {
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

  unmount(): void {
    if (this.slider && this.onSliderInput) {
      this.slider.removeEventListener('input', this.onSliderInput);
    }
    this.slider = null;
    this.valueLabel = null;
    this.onSliderInput = null;
  }

  private updateValueLabel(volume: number): void {
    if (!this.valueLabel) return;
    this.valueLabel.textContent = `${lobbyMusicVolumePercent(volume)}%`;
  }
}
