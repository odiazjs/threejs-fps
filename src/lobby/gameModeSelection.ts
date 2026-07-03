import {
  DEFAULT_GAME_MODE,
  GAME_MODE_OPTIONS,
  isValidGameMode,
  type GameMode,
} from '../../shared/combat/match';

const STORAGE_KEY = 'fps_selected_game_mode';

export function getSelectedGameMode(): GameMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidGameMode(stored) ? stored : DEFAULT_GAME_MODE;
  } catch {
    return DEFAULT_GAME_MODE;
  }
}

export function setSelectedGameMode(gameMode: GameMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, gameMode);
  } catch {
    // ignore storage failures
  }
}

export function initLobbyGameModeSelector(): void {
  const select = document.getElementById('lobby-mode-select') as HTMLSelectElement | null;
  if (!select) return;

  select.replaceChildren();
  for (const option of GAME_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = `${option.label} — ${option.description}`;
    select.appendChild(el);
  }

  select.value = getSelectedGameMode();
  select.addEventListener('change', () => {
    if (isValidGameMode(select.value)) {
      setSelectedGameMode(select.value);
    }
  });
}
