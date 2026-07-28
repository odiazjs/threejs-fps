import {
  DEFAULT_GAME_MODE,
  DEFAULT_KILL_RACE_TARGET,
  DEFAULT_TDM_DURATION_SEC,
  formatDurationOptionLabel,
  formatKillTargetOptionLabel,
  GAME_MODE_OPTIONS,
  isCompetitiveGameMode,
  isKillRaceGameMode,
  isTimedGameMode,
  isValidGameMode,
  isValidKillRaceTarget,
  isValidTdmDurationSec,
  KILL_RACE_TARGET_OPTIONS,
  normalizeKillRaceTarget,
  normalizeTdmDurationSec,
  resolveMatchRules,
  TDM_DURATION_OPTIONS_SEC,
  type GameMode,
  type KillRaceTarget,
  type TdmDurationSec,
} from '../../shared/combat/match';

const MODE_STORAGE_KEY = 'fps_selected_game_mode';
const DURATION_STORAGE_KEY = 'fps_selected_match_duration_sec';
const KILL_TARGET_STORAGE_KEY = 'fps_selected_kill_race_target';

const MODE_INITIALS: Record<GameMode, string> = {
  tdm: 'TDM',
  tdm_kills: 'FTK',
  playground: 'TP',
};

export function getSelectedGameMode(): GameMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return isValidGameMode(stored) ? stored : DEFAULT_GAME_MODE;
  } catch {
    return DEFAULT_GAME_MODE;
  }
}

export function setSelectedGameMode(gameMode: GameMode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, gameMode);
  } catch {
    // ignore storage failures
  }
}

export function getSelectedMatchDurationSec(): TdmDurationSec {
  try {
    const raw = Number(localStorage.getItem(DURATION_STORAGE_KEY));
    return isValidTdmDurationSec(raw) ? raw : DEFAULT_TDM_DURATION_SEC;
  } catch {
    return DEFAULT_TDM_DURATION_SEC;
  }
}

export function setSelectedMatchDurationSec(durationSec: TdmDurationSec): void {
  try {
    localStorage.setItem(DURATION_STORAGE_KEY, String(durationSec));
  } catch {
    // ignore
  }
}

export function getSelectedKillRaceTarget(): KillRaceTarget {
  try {
    const raw = Number(localStorage.getItem(KILL_TARGET_STORAGE_KEY));
    return isValidKillRaceTarget(raw) ? raw : DEFAULT_KILL_RACE_TARGET;
  } catch {
    return DEFAULT_KILL_RACE_TARGET;
  }
}

export function setSelectedKillRaceTarget(target: KillRaceTarget): void {
  try {
    localStorage.setItem(KILL_TARGET_STORAGE_KEY, String(target));
  } catch {
    // ignore
  }
}

/** Lobby → room create options for the currently selected mode. */
export function getSelectedMatchRules(): {
  gameMode: GameMode;
  matchDurationSec: number;
  killLimit: number;
} {
  const gameMode = getSelectedGameMode();
  return {
    gameMode,
    ...resolveMatchRules(
      gameMode,
      getSelectedMatchDurationSec(),
      getSelectedKillRaceTarget(),
    ),
  };
}

function scrollByCard(track: HTMLElement, direction: -1 | 1): void {
  const card = track.querySelector<HTMLElement>('.lobby-select-card');
  const step = card ? card.offsetWidth + 10 : 120;
  track.scrollBy({ left: direction * step, behavior: 'smooth' });
}

function syncSelectedCards(track: HTMLElement, selectedId: string): void {
  for (const card of track.querySelectorAll<HTMLElement>('.lobby-select-card')) {
    const selected = card.dataset.modeId === selectedId;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

function syncOptionButtons(track: HTMLElement, selectedValue: string): void {
  for (const btn of track.querySelectorAll<HTMLButtonElement>('.lobby-mode-option-btn')) {
    const selected = btn.dataset.value === selectedValue;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function renderDurationOptions(track: HTMLElement, selected: TdmDurationSec): void {
  track.replaceChildren();
  for (const duration of TDM_DURATION_OPTIONS_SEC) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lobby-mode-option-btn';
    btn.dataset.value = String(duration);
    btn.textContent = formatDurationOptionLabel(duration);
    btn.addEventListener('click', () => {
      setSelectedMatchDurationSec(duration);
      syncOptionButtons(track, String(duration));
    });
    track.appendChild(btn);
  }
  syncOptionButtons(track, String(selected));
}

function renderKillTargetOptions(track: HTMLElement, selected: KillRaceTarget): void {
  track.replaceChildren();
  for (const target of KILL_RACE_TARGET_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lobby-mode-option-btn';
    btn.dataset.value = String(target);
    btn.textContent = formatKillTargetOptionLabel(target);
    btn.addEventListener('click', () => {
      setSelectedKillRaceTarget(target);
      syncOptionButtons(track, String(target));
    });
    track.appendChild(btn);
  }
  syncOptionButtons(track, String(selected));
}

function syncModeOptionsUi(mode: GameMode): void {
  const root = document.getElementById('lobby-mode-options');
  const durationGroup = document.getElementById('lobby-mode-duration');
  const killsGroup = document.getElementById('lobby-mode-kills');
  if (!root || !durationGroup || !killsGroup) return;

  const showOptions = isCompetitiveGameMode(mode);
  root.hidden = !showOptions;
  durationGroup.hidden = !isTimedGameMode(mode);
  killsGroup.hidden = !isKillRaceGameMode(mode);
}

export function initLobbyGameModeSelector(): void {
  const track = document.getElementById('lobby-mode-track');
  const prevBtn = document.getElementById('lobby-mode-prev');
  const nextBtn = document.getElementById('lobby-mode-next');
  const durationTrack = document.getElementById('lobby-mode-duration-track');
  const killsTrack = document.getElementById('lobby-mode-kills-track');
  if (!track) return;

  track.replaceChildren();
  let selectedId = getSelectedGameMode();

  for (const option of GAME_MODE_OPTIONS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lobby-select-card lobby-select-card--mode';
    card.dataset.modeId = option.id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', `${option.label}. ${option.description}`);
    card.title = option.description;

    const badge = document.createElement('span');
    badge.className = 'lobby-select-card-badge';
    badge.textContent = 'SELECTED';

    const initials = document.createElement('span');
    initials.className = 'lobby-select-card-initials';
    initials.textContent = MODE_INITIALS[option.id];

    const name = document.createElement('span');
    name.className = 'lobby-select-card-name';
    name.textContent = option.label;

    card.append(badge, initials, name);
    card.addEventListener('click', () => {
      selectedId = option.id;
      setSelectedGameMode(option.id);
      syncSelectedCards(track, selectedId);
      syncModeOptionsUi(selectedId);
    });
    track.appendChild(card);
  }

  syncSelectedCards(track, selectedId);

  if (durationTrack) {
    renderDurationOptions(durationTrack, normalizeTdmDurationSec(getSelectedMatchDurationSec()));
  }
  if (killsTrack) {
    renderKillTargetOptions(killsTrack, normalizeKillRaceTarget(getSelectedKillRaceTarget()));
  }
  syncModeOptionsUi(selectedId);

  prevBtn?.addEventListener('click', () => scrollByCard(track, -1));
  nextBtn?.addEventListener('click', () => scrollByCard(track, 1));
}
