import type { WeaponLoadoutSummary } from '../../shared/api/loadouts';
import type { WeaponUnlockableState } from '../../shared/api/weaponUnlockables';
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
import {
  apiEquipWeaponSight,
  apiListWeaponUnlockables,
  apiPurchaseWeaponUnlockable,
  apiSellWeaponUnlockable,
} from '../auth/weaponUnlockablesApi';
import {
  applyLoadoutSightAssignments,
  getEquippedSightForWeapon,
} from '../content/equippedWeaponSights';
import { WEAPON_ICON_SRC } from '../content/inventoryConfig';
import { getWeaponConfig } from '../content/weaponConfig';
import { formatPlasmaMinerals } from '../ui/plasmaMineralsHud';
import { showErrorSnackbar, showSuccessSnackbar } from '../ui/snackbar';

type LoadoutSlot = 'primary' | 'secondary';
type SightConfirmMode = 'purchase' | 'sell';

interface DraftLoadout {
  id: string | null;
  name: string;
  primaryWeaponId: string;
  secondaryWeaponId: string;
  primarySightId: string | null;
  secondarySightId: string | null;
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

/** Short category label for loadout card center text (e.g. RIFLE | PISTOL). */
function weaponTypeLabel(weaponId: string): string {
  const types: Record<string, string> = {
    pistol: 'PISTOL',
    plasma_rifle: 'RIFLE',
    root_bio_carbine: 'CARBINE',
    bio_liquid_rifle: 'RIFLE',
    bio_machine_gun: 'LMG',
    bio_smg_1: 'SMG',
    plasma_shotgun: 'SHOTGUN',
    sniper_rifle: 'SNIPER',
    katana: 'MELEE',
  };
  return types[weaponId] ?? 'WEAPON';
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
  private unlockables: WeaponUnlockableState[] = [];
  private selectedId: string | null = null;
  private editingSlot: LoadoutSlot = 'primary';
  private draft: DraftLoadout | null = null;
  private busy = false;
  private dragPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartScrollLeft = 0;
  private dragMoved = false;
  private readonly slotsEl: HTMLElement | null;
  private readonly sightsEl: HTMLElement | null;
  private readonly sightsHintEl: HTMLElement | null;
  private readonly onPickerClick: (event: Event) => void;
  private readonly onGridClick: (event: Event) => void;
  private readonly onSlotsClick: (event: Event) => void;
  private readonly onSightsClick: (event: Event) => void;
  private readonly onGridInput: (event: Event) => void;
  private readonly onGridWheel: (event: WheelEvent) => void;
  private readonly onGridPointerDown: (event: PointerEvent) => void;
  private readonly onGridPointerMove: (event: PointerEvent) => void;
  private readonly onGridPointerUp: (event: PointerEvent) => void;
  private readonly onCreateClick: () => void;
  private readonly onSaveClick: () => void;
  private readonly onConfirmCancel: () => void;
  private readonly onConfirmOk: () => void;
  private readonly onCongratsDismiss: () => void;
  private confirmMode: SightConfirmMode = 'purchase';
  private pendingSightId: string | null = null;
  private readonly confirmModal: HTMLElement | null;
  private readonly congratsModal: HTMLElement | null;
  private readonly congratsName: HTMLElement | null;

  constructor(
    private readonly grid: HTMLElement,
    private readonly picker: HTMLElement,
    private readonly createBtn: HTMLButtonElement,
    private readonly saveBtn: HTMLButtonElement,
    private readonly statusEl: HTMLElement | null,
    private readonly onPreviewWeapon: (weaponId: string) => void = () => undefined,
  ) {
    this.slotsEl = document.getElementById('armory-loadout-slots');
    this.sightsEl = document.getElementById('armory-loadout-sights');
    this.sightsHintEl = document.getElementById('armory-loadout-sights-hint');
    this.confirmModal = document.getElementById('store-confirm-modal');
    this.congratsModal = document.getElementById('store-congrats-modal');
    this.congratsName = document.getElementById('store-congrats-name');
    this.onPickerClick = (event) => this.handlePickerClick(event);
    this.onGridClick = (event) => this.handleGridClick(event);
    this.onSlotsClick = (event) => this.handleSlotsClick(event);
    this.onSightsClick = (event) => this.handleSightsClick(event);
    this.onGridInput = (event) => this.handleGridInput(event);
    this.onGridWheel = (event) => this.handleGridWheel(event);
    this.onGridPointerDown = (event) => this.handleGridPointerDown(event);
    this.onGridPointerMove = (event) => this.handleGridPointerMove(event);
    this.onGridPointerUp = (event) => this.handleGridPointerUp(event);
    this.onCreateClick = () => {
      void this.createLoadout();
    };
    this.onSaveClick = () => {
      void this.saveSelected();
    };
    this.onConfirmCancel = () => this.hideConfirm();
    this.onConfirmOk = () => {
      const mode = this.confirmMode;
      const sightId = this.pendingSightId;
      this.hideConfirm();
      if (!sightId) return;
      if (mode === 'sell') void this.sellSight(sightId);
      else void this.purchaseSight(sightId);
    };
    this.onCongratsDismiss = () => this.hideCongrats();
  }

  async mount(): Promise<void> {
    this.picker.addEventListener('click', this.onPickerClick);
    this.grid.addEventListener('click', this.onGridClick);
    this.grid.addEventListener('input', this.onGridInput);
    this.grid.addEventListener('wheel', this.onGridWheel, { passive: false });
    this.grid.addEventListener('pointerdown', this.onGridPointerDown);
    this.grid.addEventListener('pointermove', this.onGridPointerMove);
    this.grid.addEventListener('pointerup', this.onGridPointerUp);
    this.grid.addEventListener('pointercancel', this.onGridPointerUp);
    this.slotsEl?.addEventListener('click', this.onSlotsClick);
    this.sightsEl?.addEventListener('click', this.onSightsClick);
    this.createBtn.addEventListener('click', this.onCreateClick);
    this.saveBtn.addEventListener('click', this.onSaveClick);
    document
      .getElementById('store-confirm-cancel')
      ?.addEventListener('click', this.onConfirmCancel);
    document
      .getElementById('store-confirm-ok')
      ?.addEventListener('click', this.onConfirmOk);
    for (const el of document.querySelectorAll('[data-store-confirm-cancel]')) {
      el.addEventListener('click', this.onConfirmCancel);
    }
    document
      .getElementById('store-congrats-dismiss')
      ?.addEventListener('click', this.onCongratsDismiss);
    this.congratsModal
      ?.querySelector('.store-dialog-backdrop')
      ?.addEventListener('click', this.onCongratsDismiss);
    await this.reload();
  }

  dispose(): void {
    this.picker.removeEventListener('click', this.onPickerClick);
    this.grid.removeEventListener('click', this.onGridClick);
    this.grid.removeEventListener('input', this.onGridInput);
    this.grid.removeEventListener('wheel', this.onGridWheel);
    this.grid.removeEventListener('pointerdown', this.onGridPointerDown);
    this.grid.removeEventListener('pointermove', this.onGridPointerMove);
    this.grid.removeEventListener('pointerup', this.onGridPointerUp);
    this.grid.removeEventListener('pointercancel', this.onGridPointerUp);
    this.slotsEl?.removeEventListener('click', this.onSlotsClick);
    this.sightsEl?.removeEventListener('click', this.onSightsClick);
    this.createBtn.removeEventListener('click', this.onCreateClick);
    this.saveBtn.removeEventListener('click', this.onSaveClick);
    document
      .getElementById('store-confirm-cancel')
      ?.removeEventListener('click', this.onConfirmCancel);
    document
      .getElementById('store-confirm-ok')
      ?.removeEventListener('click', this.onConfirmOk);
    for (const el of document.querySelectorAll('[data-store-confirm-cancel]')) {
      el.removeEventListener('click', this.onConfirmCancel);
    }
    document
      .getElementById('store-congrats-dismiss')
      ?.removeEventListener('click', this.onCongratsDismiss);
    this.congratsModal
      ?.querySelector('.store-dialog-backdrop')
      ?.removeEventListener('click', this.onCongratsDismiss);
    this.hideConfirm();
    this.hideCongrats();
    this.pendingSightId = null;
  }

  /** Mouse wheel is usually vertical; map it to horizontal carousel scroll. */
  private handleGridWheel(event: WheelEvent): void {
    const maxScroll = this.grid.scrollWidth - this.grid.clientWidth;
    if (maxScroll <= 0) return;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    const next = Math.min(maxScroll, Math.max(0, this.grid.scrollLeft + delta));
    if (next === this.grid.scrollLeft) return;

    event.preventDefault();
    this.grid.scrollLeft = next;
  }

  private handleGridPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target instanceof HTMLElement) {
      if (
        event.target.closest(
          'input, button, a, textarea, select, .armory-loadout-name, .armory-loadout-default-btn',
        )
      ) {
        return;
      }
    }
    const maxScroll = this.grid.scrollWidth - this.grid.clientWidth;
    if (maxScroll <= 0) return;

    // Record intent only — don't capture / scroll until movement crosses threshold,
    // otherwise tiny click jitter suppresses card selection.
    this.dragPointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartScrollLeft = this.grid.scrollLeft;
    this.dragMoved = false;
  }

  private handleGridPointerMove(event: PointerEvent): void {
    if (this.dragPointerId !== event.pointerId) return;
    const dx = event.clientX - this.dragStartX;
    if (!this.dragMoved) {
      if (Math.abs(dx) < 8) return;
      this.dragMoved = true;
      this.grid.classList.add('is-dragging');
      try {
        this.grid.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    this.grid.scrollLeft = this.dragStartScrollLeft - dx;
  }

  private handleGridPointerUp(event: PointerEvent): void {
    if (this.dragPointerId !== event.pointerId) return;
    const wasDragging = this.dragMoved;
    this.dragPointerId = null;
    this.dragMoved = false;
    this.grid.classList.remove('is-dragging');
    if (wasDragging) {
      try {
        this.grid.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      // Suppress the click that follows a real pan so cards don't select mid-drag.
      const suppress = (clickEvent: Event) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
        this.grid.removeEventListener('click', suppress, true);
      };
      this.grid.addEventListener('click', suppress, true);
      window.setTimeout(() => this.grid.removeEventListener('click', suppress, true), 0);
    }
  }

  private async reload(): Promise<void> {
    this.setStatus('Loading loadouts...');
    try {
      const [{ loadouts }, unlockablesData] = await Promise.all([
        apiListLoadouts(),
        apiListWeaponUnlockables().catch(() => null),
      ]);
      this.loadouts = loadouts;
      if (unlockablesData) this.unlockables = unlockablesData.unlockables;
      const preferred =
        loadouts.find((entry) => entry.id === this.selectedId) ??
        loadouts.find((entry) => entry.isDefault) ??
        loadouts[0] ??
        null;
      this.selectedId = preferred?.id ?? null;
      this.draft = preferred ? draftFromSummary(preferred) : null;
      this.syncDraftSightsFromPersisted();
      this.syncEquippedSightsFromDraft();
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

    const card = target.closest<HTMLElement>('.armory-loadout-card');
    if (card && this.grid.contains(card) && card.dataset.loadoutId) {
      if (card.dataset.loadoutId !== this.selectedId) {
        this.selectLoadout(card.dataset.loadoutId);
      }
    }
  }

  private handleSlotsClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element) || !this.slotsEl) return;

    const weaponSlot = target.closest<HTMLElement>('.armory-loadout-weapon');
    if (!weaponSlot || !this.slotsEl.contains(weaponSlot)) return;

    const slot = weaponSlot.dataset.slot;
    if (slot !== 'primary' && slot !== 'secondary') return;

    this.setEditingSlot(slot);
    this.previewSlotWeapon(slot);
  }

  private setEditingSlot(slot: LoadoutSlot): void {
    if (this.editingSlot === slot) return;
    this.syncDraftNameFromDom();
    this.editingSlot = slot;
    this.render();
  }

  private previewSlotWeapon(slot: LoadoutSlot): void {
    const summary = this.loadouts.find((entry) => entry.id === this.selectedId) ?? null;
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
    this.draft = draftFromSummary(summary);
    this.syncDraftSightsFromPersisted();
    this.syncEquippedSightsFromDraft();
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
      // Swap slots and keep each weapon's equipped sight with it.
      const prevPrimaryWeapon = this.draft.primaryWeaponId;
      const prevPrimarySight = this.draft.primarySightId;
      const prevSecondaryWeapon = this.draft.secondaryWeaponId;
      const prevSecondarySight = this.draft.secondarySightId;
      this.draft.primaryWeaponId = prevSecondaryWeapon;
      this.draft.primarySightId = prevSecondarySight;
      this.draft.secondaryWeaponId = prevPrimaryWeapon;
      this.draft.secondarySightId = prevPrimarySight;
    } else if (this.editingSlot === 'primary') {
      this.draft.primaryWeaponId = weaponId;
    } else {
      this.draft.secondaryWeaponId = weaponId;
    }

    this.syncDraftSightsFromPersisted();
    this.syncEquippedSightsFromDraft();
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
      this.draft = draftFromSummary(loadout);
      this.syncDraftSightsFromPersisted();
      this.syncEquippedSightsFromDraft();
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
        primarySightId: this.draft.primarySightId,
        secondarySightId: this.draft.secondarySightId,
      });

      this.loadouts = this.loadouts.map((entry) =>
        entry.id === loadout.id ? loadout : entry,
      );
      if (!this.loadouts.some((entry) => entry.id === loadout.id)) {
        this.loadouts.push(loadout);
      }

      this.selectedId = loadout.id;
      this.draft = draftFromSummary(loadout);
      this.syncEquippedSightsFromDraft();
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
      if (this.slotsEl) this.slotsEl.innerHTML = '';
      this.renderSights();
      return;
    }

    this.grid.innerHTML = this.loadouts
      .map((loadout, index) => this.renderCard(loadout, index))
      .join('');
    this.renderActiveSlots();
    this.renderSights();
  }

  private renderCard(loadout: WeaponLoadoutSummary, index: number): string {
    const isSelected = loadout.id === this.selectedId;
    const draft = isSelected && this.draft ? this.draft : null;
    const name = draft?.name ?? loadout.name;
    const primaryId = draft?.primaryWeaponId ?? loadout.primaryWeaponId;
    const secondaryId = draft?.secondaryWeaponId ?? loadout.secondaryWeaponId;
    const typeLine = `${weaponTypeLabel(primaryId)} | ${weaponTypeLabel(secondaryId)}`;

    return `
      <article
        class="armory-loadout-card${isSelected ? ' is-active' : ''}${loadout.isDefault ? ' is-default' : ''}"
        data-loadout-id="${escapeAttr(loadout.id)}"
        data-loadout-slot="${index + 1}"
        role="listitem"
      >
        <div class="armory-loadout-card-top">
          <span class="armory-loadout-label">LOADOUT ${index + 1}</span>
          ${
            loadout.isDefault
              ? '<span class="armory-loadout-status">DEFAULT</span>'
              : `<button type="button" class="armory-loadout-default-btn" data-loadout-id="${escapeAttr(loadout.id)}">SET DEFAULT</button>`
          }
        </div>
        ${
          isSelected
            ? `<input
          class="armory-loadout-name"
          type="text"
          value="${escapeAttr(name)}"
          maxlength="${WEAPON_LOADOUT_NAME_MAX_LENGTH}"
          aria-label="Loadout ${index + 1} name"
        />`
            : `<p class="armory-loadout-name-static" title="${escapeAttr(name)}">${escapeHtml(name)}</p>`
        }
        <p class="armory-loadout-types">${escapeHtml(typeLine)}</p>
      </article>
    `;
  }

  private renderActiveSlots(): void {
    if (!this.slotsEl) return;

    const summary =
      this.loadouts.find((entry) => entry.id === this.selectedId) ?? null;
    if (!summary || !this.draft) {
      this.slotsEl.innerHTML = '';
      return;
    }

    const primaryId = this.draft.primaryWeaponId;
    const secondaryId = this.draft.secondaryWeaponId;

    this.slotsEl.innerHTML = `
      ${this.renderActiveSlot('primary', primaryId)}
      ${this.renderActiveSlot('secondary', secondaryId)}
    `;
  }

  private renderActiveSlot(slot: LoadoutSlot, weaponId: string): string {
    const icon = weaponIcon(weaponId);
    const label = weaponLabel(weaponId);
    const editing = this.editingSlot === slot;
    const slotLabel = slot === 'primary' ? 'PRIMARY' : 'SECONDARY';
    const equippedSightId =
      slot === 'primary' ? this.draft?.primarySightId : this.draft?.secondarySightId;
    const sightName = equippedSightId
      ? (this.unlockables.find((entry) => entry.id === equippedSightId)?.name ?? 'SIGHT')
      : 'NO SIGHT';
    return `
      <button
        type="button"
        class="armory-loadout-weapon is-filled${editing ? ' is-editing' : ''}"
        data-slot="${slot}"
        title="${escapeAttr(label)}"
        aria-pressed="${editing ? 'true' : 'false'}"
      >
        <span class="armory-loadout-weapon-slot">${slotLabel}</span>
        <span class="armory-loadout-weapon-name">${escapeHtml(label)}</span>
        <span class="armory-loadout-weapon-visual">
          ${icon ? `<img src="${escapeAttr(icon)}" alt="" />` : ''}
        </span>
        <span class="armory-loadout-weapon-sight">${escapeHtml(sightName)}</span>
      </button>
    `;
  }

  private activeWeaponId(): string | null {
    if (!this.draft) return null;
    return this.editingSlot === 'primary'
      ? this.draft.primaryWeaponId
      : this.draft.secondaryWeaponId;
  }

  private equippedSightForEditingSlot(): string | null {
    if (!this.draft) return null;
    return this.editingSlot === 'primary'
      ? this.draft.primarySightId
      : this.draft.secondarySightId;
  }

  private syncDraftSightsFromPersisted(): void {
    if (!this.draft) return;
    this.draft.primarySightId = getEquippedSightForWeapon(this.draft.primaryWeaponId);
    this.draft.secondarySightId = getEquippedSightForWeapon(this.draft.secondaryWeaponId);
  }

  private syncEquippedSightsFromDraft(): void {
    if (!this.draft) return;
    applyLoadoutSightAssignments({
      primaryWeaponId: this.draft.primaryWeaponId,
      secondaryWeaponId: this.draft.secondaryWeaponId,
      primarySightId: this.draft.primarySightId,
      secondarySightId: this.draft.secondarySightId,
    });
  }

  private renderSights(): void {
    if (!this.sightsEl) return;
    const weaponId = this.activeWeaponId();
    if (!this.draft || !weaponId) {
      this.sightsEl.innerHTML =
        '<p class="armory-loadout-sights-empty">Select a loadout to manage sights.</p>';
      if (this.sightsHintEl) {
        this.sightsHintEl.textContent = 'Select a weapon slot, then unlock or equip a sight.';
      }
      return;
    }

    if (this.sightsHintEl) {
      this.sightsHintEl.textContent = `Sights for ${weaponLabel(weaponId)} (${this.editingSlot.toUpperCase()})`;
    }

    // All sights can equip on any weapon; each loadout slot keeps its own equipped sight.
    const sights = this.unlockables.filter((entry) => entry.type === 'sight');
    if (sights.length === 0) {
      this.sightsEl.innerHTML =
        '<p class="armory-loadout-sights-empty">No sights available yet.</p>';
      return;
    }

    const equippedId = this.equippedSightForEditingSlot();
    this.sightsEl.innerHTML = sights.map((entry) => this.renderSightCard(entry, equippedId)).join('');
  }

  private renderSightCard(entry: WeaponUnlockableState, equippedId: string | null): string {
    const iconSrc = entry.iconFile ? `/images/${entry.iconFile}` : '';
    const equipped = equippedId === entry.id;
    const actions = entry.unlocked
      ? `
        <button type="button" class="armory-sight-btn armory-sight-btn--equip" data-sight-action="equip" data-sight-id="${escapeAttr(entry.id)}">
          ${equipped ? 'EQUIPPED' : 'EQUIP'}
        </button>
        ${
          entry.sellable
            ? `<button type="button" class="armory-sight-btn armory-sight-btn--sell" data-sight-action="sell" data-sight-id="${escapeAttr(entry.id)}">SELL ${entry.sellRefund.toLocaleString('en-US')}</button>`
            : ''
        }
        ${
          equipped
            ? `<button type="button" class="armory-sight-btn" data-sight-action="unequip" data-sight-id="${escapeAttr(entry.id)}">UNEQUIP</button>`
            : ''
        }
      `
      : `<button type="button" class="armory-sight-btn armory-sight-btn--buy" data-sight-action="buy" data-sight-id="${escapeAttr(entry.id)}">UNLOCK ${entry.cost.toLocaleString('en-US')}</button>`;

    return `
      <article
        class="armory-sight-card${entry.unlocked ? ' is-unlocked' : ''}${equipped ? ' is-equipped' : ''}"
        data-sight-id="${escapeAttr(entry.id)}"
        role="listitem"
      >
        <div class="armory-sight-preview" aria-hidden="true">
          ${iconSrc ? `<img src="${escapeAttr(iconSrc)}" alt="" />` : '<span class="armory-sight-preview-empty">—</span>'}
        </div>
        <div class="armory-sight-meta">
          <span class="armory-sight-name">${escapeHtml(entry.name)}</span>
          <span class="armory-sight-desc">${escapeHtml(entry.description)}</span>
        </div>
        <div class="armory-sight-actions">${actions}</div>
      </article>
    `;
  }

  private handleSightsClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element) || !this.sightsEl) return;
    const button = target.closest<HTMLButtonElement>('[data-sight-action]');
    if (!button || !this.sightsEl.contains(button)) return;

    const action = button.dataset.sightAction;
    const sightId = button.dataset.sightId?.trim() ?? '';
    if (!action || !sightId) return;

    if (action === 'equip') {
      void this.equipSight(sightId);
      return;
    }
    if (action === 'unequip') {
      void this.unequipSight();
      return;
    }
    if (action === 'buy') {
      this.openSightConfirm('purchase', sightId);
      return;
    }
    if (action === 'sell') {
      this.openSightConfirm('sell', sightId);
    }
  }

  private openSightConfirm(mode: SightConfirmMode, sightId: string): void {
    if (this.busy) return;
    const entry = this.unlockables.find((item) => item.id === sightId);
    if (!entry || entry.type !== 'sight') return;

    const confirmEyebrow = document.getElementById('store-confirm-eyebrow');
    const confirmTitle = document.getElementById('store-confirm-title');
    const confirmBody = document.getElementById('store-confirm-body');

    if (mode === 'purchase') {
      if (entry.unlocked) return;
      this.confirmMode = 'purchase';
      this.pendingSightId = sightId;
      if (confirmEyebrow) confirmEyebrow.textContent = 'CONFIRM PURCHASE';
      if (confirmTitle) confirmTitle.textContent = 'UNLOCK SIGHT?';
      if (confirmBody) {
        confirmBody.innerHTML =
          `Spend <span id="store-confirm-price">${formatPlasmaMinerals(entry.cost)}</span> plasma minerals to unlock ` +
          `<span id="store-confirm-name">${escapeHtml(entry.name)}</span>?`;
      }
    } else {
      if (!entry.sellable) return;
      this.confirmMode = 'sell';
      this.pendingSightId = sightId;
      if (confirmEyebrow) confirmEyebrow.textContent = 'CONFIRM SELL BACK';
      if (confirmTitle) confirmTitle.textContent = 'SELL SIGHT?';
      if (confirmBody) {
        confirmBody.innerHTML =
          `Sell <span id="store-confirm-name">${escapeHtml(entry.name)}</span> back for ` +
          `<span id="store-confirm-price">${formatPlasmaMinerals(entry.sellRefund)}</span> plasma minerals (40% refund)?`;
      }
    }

    if (this.confirmModal) {
      this.confirmModal.dataset.confirmMode = mode;
      this.confirmModal.hidden = false;
    }
  }

  private hideConfirm(): void {
    if (this.confirmModal) this.confirmModal.hidden = true;
  }

  private showCongrats(name: string): void {
    if (this.congratsName) this.congratsName.textContent = name;
    if (this.congratsModal) this.congratsModal.hidden = false;
  }

  private hideCongrats(): void {
    if (this.congratsModal) this.congratsModal.hidden = true;
  }

  private async equipSight(
    sightId: string,
    options: { quiet?: boolean } = {},
  ): Promise<void> {
    if (!this.draft || this.busy) return;
    const entry = this.unlockables.find((item) => item.id === sightId);
    const weaponId = this.activeWeaponId();
    if (!entry?.unlocked || entry.type !== 'sight' || !weaponId) {
      this.setStatus('Unlock this sight before equipping.');
      return;
    }

    this.setBusy(true);
    this.setStatus('Saving equipped sight...');
    try {
      await apiEquipWeaponSight(weaponId, sightId);
      if (this.editingSlot === 'primary') this.draft.primarySightId = sightId;
      else this.draft.secondarySightId = sightId;
      this.loadouts = this.loadouts.map((loadout) => ({
        ...loadout,
        primarySightId:
          loadout.primaryWeaponId === weaponId ? sightId : loadout.primarySightId,
        secondarySightId:
          loadout.secondaryWeaponId === weaponId ? sightId : loadout.secondarySightId,
      }));
      this.syncEquippedSightsFromDraft();
      this.render();
      this.setStatus(`Equipped sight on ${weaponLabel(weaponId)}.`);
      if (!options.quiet) {
        showSuccessSnackbar(`Equipped on ${weaponLabel(weaponId)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not equip sight';
      this.setStatus(message);
      showErrorSnackbar(message);
    } finally {
      this.setBusy(false);
    }
  }

  private async unequipSight(): Promise<void> {
    if (!this.draft || this.busy) return;
    const weaponId = this.activeWeaponId();
    if (!weaponId) return;

    this.setBusy(true);
    this.setStatus('Removing equipped sight...');
    try {
      await apiEquipWeaponSight(weaponId, null);
      if (this.editingSlot === 'primary') this.draft.primarySightId = null;
      else this.draft.secondarySightId = null;
      this.loadouts = this.loadouts.map((entry) => ({
        ...entry,
        primarySightId:
          entry.primaryWeaponId === weaponId ? null : entry.primarySightId,
        secondarySightId:
          entry.secondaryWeaponId === weaponId ? null : entry.secondarySightId,
      }));
      this.syncEquippedSightsFromDraft();
      this.render();
      this.setStatus(`Unequipped sight from ${weaponLabel(weaponId)}.`);
      showSuccessSnackbar(`Unequipped from ${weaponLabel(weaponId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not unequip sight';
      this.setStatus(message);
      showErrorSnackbar(message);
    } finally {
      this.setBusy(false);
    }
  }

  private async purchaseSight(sightId: string): Promise<void> {
    if (this.busy) return;
    const entry = this.unlockables.find((item) => item.id === sightId);
    if (!entry || entry.unlocked) return;

    this.setBusy(true);
    this.setStatus('Unlocking sight...');
    try {
      const data = await apiPurchaseWeaponUnlockable(sightId);
      this.unlockables = data.unlockables;
      this.showCongrats(entry.name);
      this.setBusy(false);
      await this.equipSight(sightId, { quiet: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not unlock sight';
      this.setStatus(message);
      showErrorSnackbar(message);
      this.setBusy(false);
    }
  }

  private async sellSight(sightId: string): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    try {
      const data = await apiSellWeaponUnlockable(sightId);
      this.unlockables = data.unlockables;
      if (this.draft?.primarySightId === sightId) this.draft.primarySightId = null;
      if (this.draft?.secondarySightId === sightId) this.draft.secondarySightId = null;
      this.loadouts = this.loadouts.map((entry) => ({
        ...entry,
        primarySightId: entry.primarySightId === sightId ? null : entry.primarySightId,
        secondarySightId: entry.secondarySightId === sightId ? null : entry.secondarySightId,
      }));
      this.syncDraftSightsFromPersisted();
      this.syncEquippedSightsFromDraft();
      this.render();
      showSuccessSnackbar(`Sold sight for ${data.refund.toLocaleString('en-US')} plasma`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sell sight';
      this.setStatus(message);
      showErrorSnackbar(message);
    } finally {
      this.setBusy(false);
    }
  }
}

function draftFromSummary(summary: WeaponLoadoutSummary): DraftLoadout {
  return {
    id: summary.id,
    name: summary.name,
    primaryWeaponId: summary.primaryWeaponId,
    secondaryWeaponId: summary.secondaryWeaponId,
    primarySightId: summary.primarySightId ?? null,
    secondarySightId: summary.secondarySightId ?? null,
  };
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
