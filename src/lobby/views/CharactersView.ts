import type { CharacterState } from '../../../shared/api/characters';
import { apiListCharacters, apiSelectCharacter } from '../../auth/charactersApi';
import { apiListStoreItems } from '../../auth/storeApi';
import {
  getActiveCharacterMeshFile,
  getCharacterMeshFile,
  rememberStoreItemAssets,
  setActiveCharacterId,
} from '../../content/activeCharacterMesh';
import {
  getActiveOperatorId,
  setActiveOperatorId,
} from '../../content/activeOperatorCharacter';
import { StorePreviewScene } from '../../store/StorePreviewScene';

export class CharactersView {
  private characters: CharacterState[] = [];
  private selectedId: string | null = null;
  private searchQuery = '';
  private busy = false;
  private scene: StorePreviewScene | null = null;
  private equippedSkinMesh: string | null = null;

  private grid: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private nameLabel: HTMLElement | null = null;
  private bioTitle: HTMLElement | null = null;
  private bioText: HTMLElement | null = null;
  private perkName: HTMLElement | null = null;
  private perkDesc: HTMLElement | null = null;
  private selectBtn: HTMLButtonElement | null = null;

  private onGridClick: ((event: Event) => void) | null = null;
  private onSearchInput: (() => void) | null = null;
  private onSelectClick: (() => void) | null = null;

  async mount(): Promise<void> {
    this.unmount();

    this.grid = document.getElementById('characters-item-grid');
    this.searchInput = document.getElementById(
      'characters-search-input',
    ) as HTMLInputElement | null;
    this.nameLabel = document.getElementById('characters-name-label');
    this.bioTitle = document.getElementById('characters-bio-title');
    this.bioText = document.getElementById('characters-bio-text');
    this.perkName = document.getElementById('characters-perk-name');
    this.perkDesc = document.getElementById('characters-perk-desc');
    this.selectBtn = document.getElementById(
      'characters-select-btn',
    ) as HTMLButtonElement | null;

    const canvasHost = document.getElementById('characters-canvas');
    if (canvasHost) {
      this.scene = new StorePreviewScene(canvasHost);
    }

    this.onGridClick = (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-character-id]',
      );
      if (!target) return;
      const id = target.dataset.characterId;
      if (!id || id === this.selectedId) return;
      this.selectedId = id;
      this.renderGrid();
      void this.renderDetail();
    };
    this.grid?.addEventListener('click', this.onGridClick);

    this.onSearchInput = () => {
      this.searchQuery = this.searchInput?.value.trim().toLowerCase() ?? '';
      this.renderGrid();
    };
    this.searchInput?.addEventListener('input', this.onSearchInput);

    this.onSelectClick = () => {
      void this.handleSelect();
    };
    this.selectBtn?.addEventListener('click', this.onSelectClick);

    await Promise.all([
      this.scene?.whenReady() ?? Promise.resolve(),
      this.reload(),
    ]);
    this.refreshViewport();
  }

  refreshViewport(): void {
    this.scene?.refreshViewport();
  }

  unmount(): void {
    if (this.grid && this.onGridClick) {
      this.grid.removeEventListener('click', this.onGridClick);
    }
    if (this.searchInput && this.onSearchInput) {
      this.searchInput.removeEventListener('input', this.onSearchInput);
    }
    if (this.selectBtn && this.onSelectClick) {
      this.selectBtn.removeEventListener('click', this.onSelectClick);
    }

    this.scene?.dispose();
    this.scene = null;
    this.grid = null;
    this.searchInput = null;
    this.nameLabel = null;
    this.bioTitle = null;
    this.bioText = null;
    this.perkName = null;
    this.perkDesc = null;
    this.selectBtn = null;
    this.onGridClick = null;
    this.onSearchInput = null;
    this.onSelectClick = null;
    this.characters = [];
    this.selectedId = null;
    this.searchQuery = '';
    this.busy = false;
    this.equippedSkinMesh = null;
  }

  private async reload(): Promise<void> {
    try {
      const [data, store] = await Promise.all([
        apiListCharacters(),
        apiListStoreItems().catch(() => null),
      ]);

      if (store) {
        rememberStoreItemAssets(store.items);
        setActiveCharacterId(store.selectedCharacterId);
        this.equippedSkinMesh = getCharacterMeshFile(store.selectedCharacterId);
      } else {
        this.equippedSkinMesh = getActiveCharacterMeshFile();
      }

      this.characters = data.characters;
      const preferred =
        data.selectedCharacterId ||
        getActiveOperatorId() ||
        this.characters[0]?.id ||
        null;
      this.selectedId =
        this.characters.find((entry) => entry.id === preferred)?.id ??
        this.characters[0]?.id ??
        null;

      if (getActiveOperatorId() !== data.selectedCharacterId) {
        setActiveOperatorId(data.selectedCharacterId);
      }
      this.renderGrid();
      await this.renderDetail();
    } catch (error) {
      console.warn(
        '[CharactersView]',
        error instanceof Error ? error.message : 'Could not load characters',
      );
    }
  }

  private filteredCharacters(): CharacterState[] {
    if (!this.searchQuery) return this.characters;
    return this.characters.filter((entry) => {
      const haystack = `${entry.name} ${entry.description} ${entry.perk.label}`.toLowerCase();
      return haystack.includes(this.searchQuery);
    });
  }

  private renderGrid(): void {
    if (!this.grid) return;
    const rows = this.filteredCharacters();
    if (rows.length === 0) {
      this.grid.innerHTML =
        '<p class="characters-catalog-empty">No operators match your search.</p>';
      return;
    }

    this.grid.innerHTML = rows
      .map((entry) => {
        const selected = entry.id === this.selectedId;
        const equipped = entry.selected;
        const iconSrc = characterIconSrc(entry.iconFile);
        const visual = iconSrc
          ? `<img class="characters-card-icon" src="${escapeHtml(iconSrc)}" alt="" loading="lazy" />`
          : `<span class="characters-card-glyph">${escapeHtml(entry.name.slice(0, 1))}</span>`;
        return `
          <button
            type="button"
            class="characters-card${selected ? ' is-selected' : ''}${equipped ? ' is-equipped' : ''}${iconSrc ? ' has-icon' : ''}"
            data-character-id="${entry.id}"
            role="option"
            aria-selected="${selected ? 'true' : 'false'}"
          >
            <div class="characters-card-visual" aria-hidden="true">
              ${visual}
            </div>
            <div class="characters-card-meta">
              <span class="characters-card-name">${escapeHtml(entry.name)}</span>
              <span class="characters-card-perk">${escapeHtml(entry.perk.label)}</span>
              ${equipped ? '<span class="characters-card-badge">EQUIPPED</span>' : ''}
            </div>
          </button>
        `;
      })
      .join('');
  }

  private currentCharacter(): CharacterState | null {
    return this.characters.find((entry) => entry.id === this.selectedId) ?? null;
  }

  private async renderDetail(): Promise<void> {
    const entry = this.currentCharacter();
    if (!entry) {
      if (this.nameLabel) this.nameLabel.textContent = '—';
      if (this.bioTitle) this.bioTitle.textContent = 'BIOGRAPHY';
      if (this.bioText) this.bioText.textContent = 'Select an operator from the catalog.';
      if (this.perkName) this.perkName.textContent = '—';
      if (this.perkDesc) this.perkDesc.textContent = '';
      if (this.selectBtn) this.selectBtn.disabled = true;
      await this.scene?.showAsset(null);
      return;
    }

    if (this.nameLabel) this.nameLabel.textContent = entry.name.toUpperCase();
    if (this.bioTitle) {
      this.bioTitle.textContent = 'BIOGRAPHY';
    }
    if (this.bioText) {
      this.bioText.textContent =
        entry.biography.trim() || entry.description || 'No biography on file.';
    }
    if (this.perkName) this.perkName.textContent = entry.perk.label.toUpperCase();
    if (this.perkDesc) {
      this.perkDesc.textContent =
        entry.perk.description.trim() || entry.perk.label || 'No perk description.';
    }

    if (this.selectBtn) {
      this.selectBtn.disabled = this.busy || entry.selected || !entry.unlocked;
      this.selectBtn.textContent = entry.selected ? 'EQUIPPED' : 'SELECT OPERATOR';
    }

    const mesh = this.equippedSkinMesh ?? getActiveCharacterMeshFile();
    await this.scene?.showAsset(mesh, {
      playShowcaseIdle: true,
      characterId: entry.id,
      focusFace: true,
    });
  }

  private async handleSelect(): Promise<void> {
    const entry = this.currentCharacter();
    if (!entry || this.busy || entry.selected || !entry.unlocked) return;

    this.busy = true;
    if (this.selectBtn) this.selectBtn.disabled = true;

    try {
      const data = await apiSelectCharacter(entry.id);
      this.characters = data.characters;
      this.selectedId = data.selectedCharacterId;
      setActiveOperatorId(data.selectedCharacterId);
      this.renderGrid();
      await this.renderDetail();
    } catch (error) {
      console.warn(
        '[CharactersView]',
        error instanceof Error ? error.message : 'Could not select character',
      );
      if (this.selectBtn) this.selectBtn.disabled = false;
    } finally {
      this.busy = false;
      await this.renderDetail();
    }
  }
}

function characterIconSrc(iconFile: string | null | undefined): string | null {
  const file = iconFile?.trim();
  if (!file) return null;
  if (file.startsWith('/')) return file;
  if (file.startsWith('images/')) return `/${file}`;
  return `/images/${file}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
