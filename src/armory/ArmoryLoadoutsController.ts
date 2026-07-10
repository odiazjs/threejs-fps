import type { WeaponLoadoutSummary } from '../../shared/api/loadouts';
import { isPickableWeaponId, type WeaponId } from '../../shared/content/weaponIds';
import {
  WEAPON_LOADOUT_MAX_PER_USER,
  WEAPON_LOADOUT_NAME_MAX_LENGTH,
  validateWeaponLoadoutName,
} from '../../shared/loadout/weaponLoadoutPreset';
import {
  apiCreateLoadout,
  apiListLoadouts,
  apiSetDefaultLoadout,
  apiUpdateLoadout,
} from '../auth/loadoutsApi';
import { WEAPON_ICON_SRC } from '../content/inventoryConfig';
import { getWeaponConfig } from '../content/weaponConfig';
import { showErrorSnackbar, showSuccessSnackbar } from '../ui/snackbar';

type LoadoutSlot = 'primary' | 'secondary';

interface DraftLoadout {
  id: string | null;
  name: string;
  primaryWeaponId: string;
  secondaryWeaponId: string;
}

const DEFAULT_PRIMARY = 'plasma_rifle';
const DEFAULT_SECONDARY = 'pistol';

function weaponLabel(weaponId: string): string {
  return getWeaponConfig(weaponId)?.name ?? weaponId;
}

function weaponIcon(weaponId: string): string | null {
  if (weaponId in WEAPON_ICON_SRC) {
    return WEAPON_ICON_SRC[weaponId as WeaponId];
  }
  return null;
}

function nextLoadoutName(existing: readonly WeaponLoadoutSummary[]): string {
  const used = new Set(existing.map((entry) => entry.name.toLowerCase()));
  for (let i = 1; i <= WEAPON_LOADOUT_MAX_PER_USER + 2; i++) {
    const name = `Loadout ${i}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return `Loadout ${Date.now() % 1000}`;
}

export class ArmoryLoadoutsController {
  private loadouts: WeaponLoadoutSummary[] = [];
  private selectedId: string | null = null;
  private editingSlot: LoadoutSlot = 'primary';
  private draft: DraftLoadout | null = null;
  private busy = false;
  private readonly onPickerClick: (event: Event) => void;
  private readonly onGridClick: (event: Event) => void;
  private readonly onGridInput: (event: Event) => void;
  private readonly onCreateClick: () => void;
  private readonly onSaveClick: () => void;

  constructor(
    private readonly grid: HTMLElement,
    private readonly picker: HTMLElement,
    private readonly createBtn: HTMLButtonElement,
    private readonly saveBtn: HTMLButtonElement,
    private readonly statusEl: HTMLElement | null,
    private readonly onPreviewWeapon: (weaponId: string) => void = () => undefined,
  ) {
    this.onPickerClick = (event) => this.handlePickerClick(event);
    this.onGridClick = (event) => this.handleGridClick(event);
    this.onGridInput = (event) => this.handleGridInput(event);
    this.onCreateClick = () => {
      void this.createLoadout();
    };
    this.onSaveClick = () => {
      void this.saveSelected();
    };
  }

  async mount(): Promise<void> {
    this.picker.addEventListener('click', this.onPickerClick);
    this.grid.addEventListener('click', this.onGridClick);
    this.grid.addEventListener('input', this.onGridInput);
    this.createBtn.addEventListener('click', this.onCreateClick);
    this.saveBtn.addEventListener('click', this.onSaveClick);
    await this.reload();
  }

  dispose(): void {
    this.picker.removeEventListener('click', this.onPickerClick);
    this.grid.removeEventListener('click', this.onGridClick);
    this.grid.removeEventListener('input', this.onGridInput);
    this.createBtn.removeEventListener('click', this.onCreateClick);
    this.saveBtn.removeEventListener('click', this.onSaveClick);
  }

  private async reload(): Promise<void> {
    this.setStatus('Loading loadouts...');
    try {
      const { loadouts } = await apiListLoadouts();
      this.loadouts = loadouts;
      const preferred =
        loadouts.find((entry) => entry.id === this.selectedId) ??
        loadouts.find((entry) => entry.isDefault) ??
        loadouts[0] ??
        null;
      this.selectedId = preferred?.id ?? null;
      this.draft = preferred
        ? {
            id: preferred.id,
            name: preferred.name,
            primaryWeaponId: preferred.primaryWeaponId,
            secondaryWeaponId: preferred.secondaryWeaponId,
          }
        : null;
      this.editingSlot = 'primary';
      this.render();
      this.setStatus(
        loadouts.length === 0
          ? 'No saved loadouts yet — create one to get started.'
          : '',
      );
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Could not load loadouts');
      this.render();
    }
  }

  /** Primary of the DEFAULT loadout, if the user has any custom loadouts. */
  getDefaultPrimaryWeaponId(): string | null {
    const preferred =
      this.loadouts.find((entry) => entry.isDefault) ?? this.loadouts[0] ?? null;
    const primary = preferred?.primaryWeaponId?.trim() ?? '';
    return primary || null;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.createBtn.disabled = busy;
    this.saveBtn.disabled = busy;
  }

  private setStatus(message: string): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.hidden = !message;
  }

  private handleGridInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('armory-loadout-name')) return;
    if (!this.draft) return;

    const card = target.closest<HTMLElement>('.armory-loadout-card');
    if (!card || card.dataset.loadoutId !== this.draft.id) return;

    this.draft.name = target.value;
  }

  private handlePickerClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('.weapons-picker-btn');
    if (!button || !this.picker.contains(button)) return;

    const weaponId = button.dataset.weaponId?.trim() ?? '';
    if (!weaponId || !isPickableWeaponId(weaponId)) {
      if (weaponId && !isPickableWeaponId(weaponId)) {
        this.setStatus('Melee cannot be assigned to primary/secondary slots.');
      }
      return;
    }

    if (!this.draft) {
      this.setStatus('Select or create a loadout first.');
      return;
    }

    this.assignWeapon(weaponId);
  }

  private handleGridClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Never treat name-field interaction as a card select / re-render.
    if (target.closest('.armory-loadout-name')) return;

    const defaultBtn = target.closest<HTMLButtonElement>('.armory-loadout-default-btn');
    if (defaultBtn && this.grid.contains(defaultBtn)) {
      event.preventDefault();
      event.stopPropagation();
      const card = defaultBtn.closest<HTMLElement>('.armory-loadout-card');
      const loadoutId = card?.dataset.loadoutId ?? defaultBtn.dataset.loadoutId ?? null;
      if (loadoutId) {
        void this.setAsDefault(loadoutId);
      }
      return;
    }

    const slotTab = target.closest<HTMLButtonElement>('.armory-loadout-slot-tab');
    if (slotTab && this.grid.contains(slotTab)) {
      const slot = slotTab.dataset.slot;
      if (slot === 'primary' || slot === 'secondary') {
        this.setEditingSlot(slot);
        this.previewSlotWeapon(slot);
      }
      return;
    }

    const weaponSlot = target.closest<HTMLElement>('.armory-loadout-weapon');
    if (weaponSlot && this.grid.contains(weaponSlot)) {
      const card = weaponSlot.closest<HTMLElement>('.armory-loadout-card');
      const loadoutId = card?.dataset.loadoutId ?? null;
      if (loadoutId && loadoutId !== this.selectedId) {
        this.selectLoadout(loadoutId);
      }
      const slot = weaponSlot.dataset.slot;
      if (slot === 'primary' || slot === 'secondary') {
        this.setEditingSlot(slot);
        this.previewSlotWeapon(slot, loadoutId);
      }
      return;
    }

    const card = target.closest<HTMLElement>('.armory-loadout-card');
    if (card && this.grid.contains(card) && card.dataset.loadoutId) {
      if (card.dataset.loadoutId !== this.selectedId) {
        this.selectLoadout(card.dataset.loadoutId);
      }
    }
  }

  private setEditingSlot(slot: LoadoutSlot): void {
    if (this.editingSlot === slot) return;
    this.syncDraftNameFromDom();
    this.editingSlot = slot;
    this.render();
  }

  private previewSlotWeapon(slot: LoadoutSlot, loadoutId?: string | null): void {
    const summary =
      (loadoutId ? this.loadouts.find((entry) => entry.id === loadoutId) : null) ??
      this.loadouts.find((entry) => entry.id === this.selectedId) ??
      null;
    const draft = this.draft?.id === summary?.id ? this.draft : null;
    const weaponId =
      slot === 'primary'
        ? (draft?.primaryWeaponId ?? summary?.primaryWeaponId)
        : (draft?.secondaryWeaponId ?? summary?.secondaryWeaponId);
    if (weaponId) {
      this.onPreviewWeapon(weaponId);
    }
  }

  private selectLoadout(loadoutId: string): void {
    if (this.selectedId === loadoutId && this.draft?.id === loadoutId) {
      this.syncDraftNameFromDom();
      return;
    }

    this.syncDraftNameFromDom();

    const summary = this.loadouts.find((entry) => entry.id === loadoutId);
    if (!summary) return;

    this.selectedId = summary.id;
    this.draft = {
      id: summary.id,
      name: summary.name,
      primaryWeaponId: summary.primaryWeaponId,
      secondaryWeaponId: summary.secondaryWeaponId,
    };
    this.editingSlot = 'primary';
    this.render();
    this.setStatus('');
    this.onPreviewWeapon(summary.primaryWeaponId);
  }

  private assignWeapon(weaponId: string): void {
    if (!this.draft) return;
    this.syncDraftNameFromDom();

    const current = this.editingSlot === 'primary'
      ? this.draft.primaryWeaponId
      : this.draft.secondaryWeaponId;
    const other = this.editingSlot === 'primary'
      ? this.draft.secondaryWeaponId
      : this.draft.primaryWeaponId;

    if (current === weaponId) {
      this.setStatus(`${weaponLabel(weaponId)} is already in ${this.editingSlot}.`);
      return;
    }

    if (other === weaponId) {
      if (this.editingSlot === 'primary') {
        this.draft.secondaryWeaponId = this.draft.primaryWeaponId;
        this.draft.primaryWeaponId = weaponId;
      } else {
        this.draft.primaryWeaponId = this.draft.secondaryWeaponId;
        this.draft.secondaryWeaponId = weaponId;
      }
    } else if (this.editingSlot === 'primary') {
      this.draft.primaryWeaponId = weaponId;
    } else {
      this.draft.secondaryWeaponId = weaponId;
    }

    this.render();
    this.onPreviewWeapon(weaponId);
    this.setStatus('Unsaved changes — click SAVE LOADOUT.');
  }

  private readNameFromDom(): string {
    if (!this.draft?.id) return this.draft?.name ?? '';
    const input = this.grid.querySelector<HTMLInputElement>(
      `.armory-loadout-card[data-loadout-id="${CSS.escape(this.draft.id)}"] .armory-loadout-name`,
    );
    return input?.value ?? this.draft.name;
  }

  private syncDraftNameFromDom(): void {
    if (!this.draft) return;
    this.draft.name = this.readNameFromDom();
  }

  private async createLoadout(): Promise<void> {
    if (this.busy) return;
    if (this.loadouts.length >= WEAPON_LOADOUT_MAX_PER_USER) {
      this.setStatus(`You can save at most ${WEAPON_LOADOUT_MAX_PER_USER} loadouts.`);
      return;
    }

    this.syncDraftNameFromDom();
    this.setBusy(true);
    this.setStatus('Creating loadout...');
    try {
      const { loadout } = await apiCreateLoadout({
        name: nextLoadoutName(this.loadouts),
        primaryWeaponId: DEFAULT_PRIMARY,
        secondaryWeaponId: DEFAULT_SECONDARY,
        isDefault: this.loadouts.length === 0,
      });
      this.loadouts = [...this.loadouts, loadout];
      this.selectedId = loadout.id;
      this.draft = {
        id: loadout.id,
        name: loadout.name,
        primaryWeaponId: loadout.primaryWeaponId,
        secondaryWeaponId: loadout.secondaryWeaponId,
      };
      this.editingSlot = 'primary';
      this.render();
      this.setStatus('Loadout created. Edit weapons, then save.');
      showSuccessSnackbar(`Created "${loadout.name}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create loadout';
      this.setStatus(message);
      showErrorSnackbar(message);
    } finally {
      this.setBusy(false);
    }
  }

  private async setAsDefault(loadoutId: string): Promise<void> {
    if (this.busy) return;

    const current = this.loadouts.find((entry) => entry.id === loadoutId);
    if (!current) return;
    if (current.isDefault) {
      this.setStatus('This loadout is already the default.');
      return;
    }

    this.syncDraftNameFromDom();
    this.setBusy(true);
    this.setStatus('Setting default loadout...');
    try {
      const { loadout } = await apiSetDefaultLoadout(loadoutId);
      this.loadouts = this.loadouts.map((entry) => {
        if (entry.id === loadout.id) return loadout;
        return entry.isDefault ? { ...entry, isDefault: false } : entry;
      });
      this.render();
      this.setStatus(`"${loadout.name}" is now your default loadout.`);
      showSuccessSnackbar(`"${loadout.name}" set as default`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not set default loadout';
      this.setStatus(message);
      showErrorSnackbar(message);
    } finally {
      this.setBusy(false);
    }
  }

  private async saveSelected(): Promise<void> {
    if (this.busy || !this.draft?.id) {
      if (!this.draft) this.setStatus('Create or select a loadout first.');
      return;
    }

    this.syncDraftNameFromDom();

    let name: string;
    try {
      name = validateWeaponLoadoutName(this.draft.name);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Invalid loadout name');
      return;
    }

    if (this.draft.primaryWeaponId === this.draft.secondaryWeaponId) {
      this.setStatus('Primary and secondary must be different weapons.');
      return;
    }

    this.setBusy(true);
    this.setStatus('Saving loadout...');
    try {
      const { loadout } = await apiUpdateLoadout(this.draft.id, {
        name,
        primaryWeaponId: this.draft.primaryWeaponId,
        secondaryWeaponId: this.draft.secondaryWeaponId,
      });

      this.loadouts = this.loadouts.map((entry) =>
        entry.id === loadout.id ? loadout : entry,
      );
      if (!this.loadouts.some((entry) => entry.id === loadout.id)) {
        this.loadouts.push(loadout);
      }

      this.selectedId = loadout.id;
      this.draft = {
        id: loadout.id,
        name: loadout.name,
        primaryWeaponId: loadout.primaryWeaponId,
        secondaryWeaponId: loadout.secondaryWeaponId,
      };
      this.render();
      this.setStatus('Loadout saved.');
      showSuccessSnackbar(`Saved "${loadout.name}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save loadout';
      this.setStatus(message);
      showErrorSnackbar(message);
    } finally {
      this.setBusy(false);
    }
  }

  private render(): void {
    if (this.loadouts.length === 0) {
      this.grid.innerHTML =
        '<p class="armory-loadout-empty-state">No loadouts yet. Click CREATE NEW to start.</p>';
      return;
    }

    this.grid.innerHTML = this.loadouts
      .map((loadout, index) => this.renderCard(loadout, index))
      .join('');
  }

  private renderCard(loadout: WeaponLoadoutSummary, index: number): string {
    const isSelected = loadout.id === this.selectedId;
    const draft = isSelected && this.draft ? this.draft : null;
    const name = draft?.name ?? loadout.name;
    const primaryId = draft?.primaryWeaponId ?? loadout.primaryWeaponId;
    const secondaryId = draft?.secondaryWeaponId ?? loadout.secondaryWeaponId;
    const status = loadout.isDefault ? 'DEFAULT' : isSelected ? 'OPENED' : '';

    return `
      <article
        class="armory-loadout-card${isSelected ? ' is-active' : ''}${loadout.isDefault ? ' is-default' : ''}"
        data-loadout-id="${escapeAttr(loadout.id)}"
        data-loadout-slot="${index + 1}"
      >
        <div class="armory-loadout-card-top">
          <span class="armory-loadout-index">${index + 1}</span>
          <span class="armory-loadout-label">LOADOUT ${index + 1}</span>
          ${status ? `<span class="armory-loadout-status">${status}</span>` : ''}
        </div>
        <input
          class="armory-loadout-name"
          type="text"
          value="${escapeAttr(name)}"
          maxlength="${WEAPON_LOADOUT_NAME_MAX_LENGTH}"
          aria-label="Loadout ${index + 1} name"
          ${isSelected ? '' : 'readonly'}
        />
        ${
          isSelected
            ? `
        <div class="armory-loadout-slot-tabs" role="tablist" aria-label="Loadout slots">
          <button type="button" class="armory-loadout-slot-tab${this.editingSlot === 'primary' ? ' is-active' : ''}" data-slot="primary">PRIMARY</button>
          <button type="button" class="armory-loadout-slot-tab${this.editingSlot === 'secondary' ? ' is-active' : ''}" data-slot="secondary">SECONDARY</button>
        </div>`
            : ''
        }
        <div class="armory-loadout-weapons">
          ${this.renderWeaponSlot('primary', primaryId, isSelected)}
          ${this.renderWeaponSlot('secondary', secondaryId, isSelected)}
        </div>
        ${
          loadout.isDefault
            ? `<span class="armory-loadout-default-badge">DEFAULT FOR MATCHES</span>`
            : `<button type="button" class="armory-loadout-default-btn" data-loadout-id="${escapeAttr(loadout.id)}">SET AS DEFAULT</button>`
        }
      </article>
    `;
  }

  private renderWeaponSlot(slot: LoadoutSlot, weaponId: string, isSelected: boolean): string {
    const icon = weaponIcon(weaponId);
    const label = weaponLabel(weaponId);
    const editing = isSelected && this.editingSlot === slot;
    return `
      <div
        class="armory-loadout-weapon is-filled${editing ? ' is-editing' : ''}"
        data-slot="${slot}"
        title="${escapeAttr(label)}"
      >
        ${icon ? `<img src="${escapeAttr(icon)}" alt="" />` : `<span>${escapeHtml(label)}</span>`}
      </div>
    `;
  }
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
