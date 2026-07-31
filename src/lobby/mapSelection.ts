import {
  getAllowedMapIdsForGameMode,
  isPlasmaHarvestGameMode,
} from '../../shared/combat/match';
import {
  DEFAULT_MAP_ID,
  isValidMapId,
  MAP_OPTIONS,
  type MapId,
} from '../../shared/level/maps';
import { getSelectedGameMode } from './gameModeSelection';

const STORAGE_KEY = 'fps_selected_map_id';

const MAP_PREVIEW_SRC: Record<MapId, string> = {
  firing_range: '/images/firing_range.png',
  killhouse_small: '/images/chrono_bowl.png',
  harvest: '/images/ui/harvest_map_icon.png',
  showcase: '/images/firing_range.png',
};

export function getSelectedMapId(): MapId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const mode = getSelectedGameMode();
    const allowed = getAllowedMapIdsForGameMode(mode);
    if (isValidMapId(stored) && allowed.includes(stored)) return stored;
    return allowed[0] ?? DEFAULT_MAP_ID;
  } catch {
    return DEFAULT_MAP_ID;
  }
}

export function setSelectedMapId(mapId: MapId): void {
  try {
    localStorage.setItem(STORAGE_KEY, mapId);
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
    const selected = card.dataset.mapId === selectedId;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

function renderMapCards(track: HTMLElement): string {
  const mode = getSelectedGameMode();
  const allowed = new Set(getAllowedMapIdsForGameMode(mode));
  let selectedId = getSelectedMapId();
  if (!allowed.has(selectedId)) {
    selectedId = [...allowed][0] ?? DEFAULT_MAP_ID;
    setSelectedMapId(selectedId);
  }

  track.replaceChildren();
  for (const option of MAP_OPTIONS) {
    if (!allowed.has(option.id)) continue;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lobby-select-card lobby-select-card--map';
    card.dataset.mapId = option.id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', option.label);
    if (isPlasmaHarvestGameMode(mode)) {
      card.disabled = true;
      card.title = 'Required for Plasma Harvest';
    }

    const badge = document.createElement('span');
    badge.className = 'lobby-select-card-badge';
    badge.textContent = 'SELECTED';

    const thumb = document.createElement('div');
    thumb.className = 'lobby-select-card-thumb';
    const img = document.createElement('img');
    img.src = MAP_PREVIEW_SRC[option.id];
    img.alt = '';
    img.draggable = false;
    thumb.appendChild(img);

    const name = document.createElement('span');
    name.className = 'lobby-select-card-name';
    name.textContent = option.label;

    card.append(badge, thumb, name);
    if (!isPlasmaHarvestGameMode(mode)) {
      card.addEventListener('click', () => {
        selectedId = option.id;
        setSelectedMapId(option.id);
        syncSelectedCards(track, selectedId);
      });
    }
    track.appendChild(card);
  }

  syncSelectedCards(track, selectedId);
  return selectedId;
}

export function initLobbyMapSelector(): void {
  const track = document.getElementById('lobby-map-track');
  const prevBtn = document.getElementById('lobby-map-prev');
  const nextBtn = document.getElementById('lobby-map-next');
  if (!track) return;

  renderMapCards(track);

  window.addEventListener('fps-game-mode-changed', () => {
    renderMapCards(track);
  });

  prevBtn?.addEventListener('click', () => scrollByCard(track, -1));
  nextBtn?.addEventListener('click', () => scrollByCard(track, 1));
}
