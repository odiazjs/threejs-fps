import {
  DEFAULT_MAP_ID,
  isValidMapId,
  MAP_OPTIONS,
  type MapId,
} from '../../shared/level/maps';

const STORAGE_KEY = 'fps_selected_map_id';

const MAP_PREVIEW_SRC: Record<MapId, string> = {
  kilo_sector: '/images/kilo_sector.png',
  firing_range: '/images/firing_range.png',
  killhouse_small: '/images/chrono_bowl.png',
};

export function getSelectedMapId(): MapId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidMapId(stored) ? stored : DEFAULT_MAP_ID;
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

export function initLobbyMapSelector(): void {
  const track = document.getElementById('lobby-map-track');
  const prevBtn = document.getElementById('lobby-map-prev');
  const nextBtn = document.getElementById('lobby-map-next');
  if (!track) return;

  track.replaceChildren();
  let selectedId = getSelectedMapId();

  for (const option of MAP_OPTIONS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lobby-select-card lobby-select-card--map';
    card.dataset.mapId = option.id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', option.label);

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
    card.addEventListener('click', () => {
      selectedId = option.id;
      setSelectedMapId(option.id);
      syncSelectedCards(track, selectedId);
    });
    track.appendChild(card);
  }

  syncSelectedCards(track, selectedId);

  prevBtn?.addEventListener('click', () => scrollByCard(track, -1));
  nextBtn?.addEventListener('click', () => scrollByCard(track, 1));
}
