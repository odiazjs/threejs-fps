import {
  DEFAULT_GAME_MODE,
  GAME_MODE_OPTIONS,
  isValidGameMode,
  type GameMode,
} from '../../shared/combat/match';

const STORAGE_KEY = 'fps_selected_game_mode';

const MODE_INITIALS: Record<GameMode, string> = {
  tdm: 'TMD',
  playground: 'TP',
};

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

export function initLobbyGameModeSelector(): void {
  const track = document.getElementById('lobby-mode-track');
  const prevBtn = document.getElementById('lobby-mode-prev');
  const nextBtn = document.getElementById('lobby-mode-next');
  if (!track) return;

  track.replaceChildren();
  let selectedId = getSelectedGameMode();

  for (const option of GAME_MODE_OPTIONS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lobby-select-card lobby-select-card--mode';
    card.dataset.modeId = option.id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', option.label);

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
    });
    track.appendChild(card);
  }

  syncSelectedCards(track, selectedId);

  prevBtn?.addEventListener('click', () => scrollByCard(track, -1));
  nextBtn?.addEventListener('click', () => scrollByCard(track, 1));
}
