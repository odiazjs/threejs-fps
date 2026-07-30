import { playLeaderboardEntrance } from './leaderboardUi';
import { SettingsView } from './views/SettingsView';

/**
 * Centered lobby settings panel shown after the camera flies to `3d_printer`.
 * Matches the leaderboard landmark modal shell / typography / entrance.
 */
export class LobbySettingsOverlay {
  private root: HTMLElement | null = null;
  private readonly settingsView = new SettingsView();
  private onCloseRequest: (() => void) | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  setCloseHandler(handler: (() => void) | null): void {
    this.onCloseRequest = handler;
  }

  open(): void {
    this.dispose();

    const root = document.createElement('div');
    root.className = 'lobby-landmark-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Settings');

    const panel = document.createElement('aside');
    panel.className = 'lobby-landmark-panel leaderboard-shell hud-panel hud-panel--lg';

    const subtitle = document.createElement('p');
    subtitle.className = 'leaderboard-subtitle hud-subtitle hud-subtitle--center leaderboard-swipe';
    subtitle.textContent = 'SYSTEM / SETTINGS';

    const title = document.createElement('h1');
    title.className = 'leaderboard-title hud-title hud-title--hero leaderboard-swipe';
    title.textContent = 'SETTINGS';

    const status = document.createElement('p');
    status.className = 'leaderboard-status leaderboard-swipe';
    status.textContent = 'Audio, graphics, sensitivity & controls';

    const body = document.createElement('div');
    body.className = 'lobby-landmark-body';
    body.append(
      this.createSliderOption({
        setting: 'master-volume',
        label: 'Master volume',
        min: 0,
        max: 100,
        step: 1,
        value: 100,
        delayIndex: 3,
      }),
      this.createSliderOption({
        setting: 'lobby-music-volume',
        label: 'Lobby music volume',
        min: 0,
        max: 100,
        step: 1,
        value: 14,
        delayIndex: 4,
      }),
      this.createSliderOption({
        setting: 'mouse-sensitivity',
        label: 'Mouse sensitivity',
        min: 20,
        max: 300,
        step: 5,
        value: 100,
        delayIndex: 5,
      }),
      this.createGraphicsQualityOption(6),
      this.createControlsOption(7),
    );

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lobby-landmark-close lobby-top-back-btn leaderboard-swipe';
    closeBtn.style.setProperty('--swipe-delay', '630ms');
    closeBtn.textContent = 'BACK TO LOBBY';
    closeBtn.addEventListener('click', () => {
      this.onCloseRequest?.();
    });

    panel.append(subtitle, title, status, body, closeBtn);
    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;

    this.settingsView.mount(panel);

    const swipeEls = [
      subtitle,
      title,
      status,
      ...Array.from(body.querySelectorAll<HTMLElement>('.settings-option')),
      closeBtn,
    ];
    playLeaderboardEntrance(root, swipeEls);
  }

  dispose(): void {
    this.settingsView.unmount();
    if (!this.root) return;
    this.root.remove();
    this.root = null;
  }

  private createSliderOption(opts: {
    setting: string;
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    delayIndex: number;
  }): HTMLElement {
    const option = document.createElement('div');
    option.className = 'settings-option leaderboard-swipe';
    option.style.setProperty('--swipe-delay', `${opts.delayIndex * 90}ms`);

    const header = document.createElement('div');
    header.className = 'settings-option-header';

    const id = `lobby-overlay-${opts.setting}`;
    const label = document.createElement('label');
    label.className = 'settings-label';
    label.htmlFor = id;
    label.textContent = opts.label;

    const value = document.createElement('span');
    value.className = 'settings-value';
    value.dataset.settingValue = opts.setting;
    value.textContent = `${opts.value}%`;

    header.append(label, value);

    const input = document.createElement('input');
    input.id = id;
    input.className = 'settings-slider';
    input.type = 'range';
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    input.value = String(opts.value);
    input.dataset.setting = opts.setting;

    option.append(header, input);
    return option;
  }

  private createGraphicsQualityOption(delayIndex: number): HTMLElement {
    const option = document.createElement('div');
    option.className = 'settings-option leaderboard-swipe';
    option.style.setProperty('--swipe-delay', `${delayIndex * 90}ms`);

    const header = document.createElement('div');
    header.className = 'settings-option-header';

    const id = 'lobby-overlay-graphics-quality';
    const label = document.createElement('label');
    label.className = 'settings-label';
    label.htmlFor = id;
    label.textContent = 'Graphics quality';

    const value = document.createElement('span');
    value.className = 'settings-value';
    value.dataset.settingValue = 'graphics-quality';
    value.textContent = 'AUTO';

    header.append(label, value);

    const select = document.createElement('select');
    select.id = id;
    select.className = 'settings-select';
    select.dataset.setting = 'graphics-quality';
    for (const [optValue, optLabel] of [
      ['auto', 'Auto (detect GPU)'],
      ['low', 'Low (integrated GPU)'],
      ['medium', 'Medium'],
      ['high', 'High'],
      ['ultra', 'Ultra (high-end GPU)'],
    ] as const) {
      const opt = document.createElement('option');
      opt.value = optValue;
      opt.textContent = optLabel;
      select.appendChild(opt);
    }

    const applyRow = document.createElement('div');
    applyRow.className = 'settings-apply-row';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'hud-btn settings-apply-btn';
    applyBtn.dataset.settingApply = 'graphics-quality';
    applyBtn.disabled = true;
    applyBtn.textContent = 'APPLY & RELOAD';

    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = 'Change quality, then apply to reload with the new settings.';

    applyRow.append(applyBtn, hint);
    option.append(header, select, applyRow);
    return option;
  }

  private createControlsOption(delayIndex: number): HTMLElement {
    const option = document.createElement('div');
    option.className = 'settings-option leaderboard-swipe';
    option.style.setProperty('--swipe-delay', `${delayIndex * 90}ms`);

    const header = document.createElement('div');
    header.className = 'settings-option-header';

    const label = document.createElement('span');
    label.className = 'settings-label';
    label.textContent = 'Controls';
    header.appendChild(label);

    const list = document.createElement('div');
    list.className = 'settings-controls-list';
    list.dataset.setting = 'controls-list';

    option.append(header, list);
    return option;
  }
}
