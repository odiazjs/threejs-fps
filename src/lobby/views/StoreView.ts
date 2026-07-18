import type { StoreItemState } from '../../../shared/api/store';
import { isEquipableCharacterType } from '../../../shared/content/storeItemTypes';
import {
  apiListStoreItems,
  apiPurchaseStoreItem,
  apiSelectStoreItem,
  apiSellStoreItem,
} from '../../auth/storeApi';
import {
  getActiveCharacterId,
  setActiveCharacterId,
} from '../../content/activeCharacterMesh';
import { getActiveOperatorId } from '../../content/activeOperatorCharacter';
import { clearCharacterMeshCache } from '../../player/characterModel';
import { StorePreviewScene } from '../../store/StorePreviewScene';
import { formatPlasmaMinerals } from '../../ui/plasmaMineralsHud';

type ConfirmMode = 'purchase' | 'sell';

function typeLabel(type: string): string {
  return type.replaceAll('_', ' ').toUpperCase();
}

function storeCardVisualClass(itemId: string): string {
  switch (itemId) {
    case 'silver':
      return ' store-item-card-visual--silver';
    case 'tech_nature':
      return ' store-item-card-visual--tech-nature';
    case 'magma_fire':
      return ' store-item-card-visual--magma-fire';
    case 'pink_butterfly':
      return ' store-item-card-visual--pink-butterfly';
    case 'bumblebee':
      return ' store-item-card-visual--bumblebee';
    default:
      return '';
  }
}

function storeCardGlyph(itemId: string): string {
  switch (itemId) {
    case 'silver':
      return '◇';
    case 'tech_nature':
      return '❋';
    case 'magma_fire':
      return '▲';
    case 'pink_butterfly':
      return '✧';
    case 'bumblebee':
      return '◈';
    default:
      return '○';
  }
}

export class StoreView {
  private items: StoreItemState[] = [];
  private selectedId: string | null = null;
  private busy = false;
  private confirmMode: ConfirmMode = 'purchase';
  private scene: StorePreviewScene | null = null;

  private grid: HTMLElement | null = null;
  private actionRow: HTMLElement | null = null;
  private detailName: HTMLElement | null = null;
  private detailType: HTMLElement | null = null;
  private detailDesc: HTMLElement | null = null;
  private detailPrice: HTMLElement | null = null;
  private detailStatus: HTMLElement | null = null;
  private purchaseBtn: HTMLButtonElement | null = null;
  private sellBtn: HTMLButtonElement | null = null;
  private sellRefund: HTMLElement | null = null;
  private equipBtn: HTMLButtonElement | null = null;
  private confirmModal: HTMLElement | null = null;
  private confirmEyebrow: HTMLElement | null = null;
  private confirmTitle: HTMLElement | null = null;
  private confirmBody: HTMLElement | null = null;
  private confirmName: HTMLElement | null = null;
  private confirmPrice: HTMLElement | null = null;
  private congratsModal: HTMLElement | null = null;
  private congratsName: HTMLElement | null = null;

  private onGridClick: ((event: Event) => void) | null = null;
  private onPurchaseClick: (() => void) | null = null;
  private onSellClick: (() => void) | null = null;
  private onEquipClick: (() => void) | null = null;
  private onConfirmOk: (() => void) | null = null;
  private onConfirmCancel: (() => void) | null = null;
  private onCongratsDismiss: (() => void) | null = null;

  async mount(): Promise<void> {
    this.unmount();

    this.grid = document.getElementById('store-item-grid');
    this.actionRow = document.getElementById('store-action-row');
    this.detailName = document.getElementById('store-detail-name');
    this.detailType = document.getElementById('store-detail-type');
    this.detailDesc = document.getElementById('store-detail-desc');
    this.detailPrice = document.getElementById('store-detail-price');
    this.detailStatus = document.getElementById('store-detail-status');
    this.purchaseBtn = document.getElementById('store-purchase-btn') as HTMLButtonElement | null;
    this.sellBtn = document.getElementById('store-sell-btn') as HTMLButtonElement | null;
    this.sellRefund = document.getElementById('store-sell-refund');
    this.equipBtn = document.getElementById('store-equip-btn') as HTMLButtonElement | null;
    this.confirmModal = document.getElementById('store-confirm-modal');
    this.confirmEyebrow = document.getElementById('store-confirm-eyebrow');
    this.confirmTitle = document.getElementById('store-confirm-title');
    this.confirmBody = document.getElementById('store-confirm-body');
    this.confirmName = document.getElementById('store-confirm-name');
    this.confirmPrice = document.getElementById('store-confirm-price');
    this.congratsModal = document.getElementById('store-congrats-modal');
    this.congratsName = document.getElementById('store-congrats-name');

    const canvasHost = document.getElementById('store-canvas');
    if (canvasHost) {
      this.scene = new StorePreviewScene(canvasHost);
    }

    this.onGridClick = (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
      if (!target) return;
      const id = target.dataset.itemId;
      if (!id || id === this.selectedId) return;
      this.selectedId = id;
      this.renderGrid();
      void this.renderDetail();
    };
    this.grid?.addEventListener('click', this.onGridClick);

    this.onPurchaseClick = () => {
      this.openConfirm('purchase');
    };
    this.purchaseBtn?.addEventListener('click', this.onPurchaseClick);

    this.onSellClick = () => {
      this.openConfirm('sell');
    };
    this.sellBtn?.addEventListener('click', this.onSellClick);

    this.onEquipClick = () => {
      void this.handleEquip();
    };
    this.equipBtn?.addEventListener('click', this.onEquipClick);

    this.onConfirmCancel = () => this.hideConfirm();
    this.onConfirmOk = () => {
      const mode = this.confirmMode;
      this.hideConfirm();
      if (mode === 'sell') {
        void this.executeSell();
      } else {
        void this.executePurchase();
      }
    };
    document
      .getElementById('store-confirm-cancel')
      ?.addEventListener('click', this.onConfirmCancel);
    document
      .getElementById('store-confirm-ok')
      ?.addEventListener('click', this.onConfirmOk);
    for (const el of document.querySelectorAll('[data-store-confirm-cancel]')) {
      el.addEventListener('click', this.onConfirmCancel);
    }

    this.onCongratsDismiss = () => this.hideCongrats();
    document
      .getElementById('store-congrats-dismiss')
      ?.addEventListener('click', this.onCongratsDismiss);
    this.congratsModal
      ?.querySelector('.store-dialog-backdrop')
      ?.addEventListener('click', this.onCongratsDismiss);

    await Promise.all([this.scene?.whenReady() ?? Promise.resolve(), this.reload()]);
    this.refreshViewport();
  }

  refreshViewport(): void {
    this.scene?.refreshViewport();
  }

  unmount(): void {
    if (this.grid && this.onGridClick) {
      this.grid.removeEventListener('click', this.onGridClick);
    }
    if (this.purchaseBtn && this.onPurchaseClick) {
      this.purchaseBtn.removeEventListener('click', this.onPurchaseClick);
    }
    if (this.sellBtn && this.onSellClick) {
      this.sellBtn.removeEventListener('click', this.onSellClick);
    }
    if (this.equipBtn && this.onEquipClick) {
      this.equipBtn.removeEventListener('click', this.onEquipClick);
    }
    if (this.onConfirmCancel) {
      document
        .getElementById('store-confirm-cancel')
        ?.removeEventListener('click', this.onConfirmCancel);
      for (const el of document.querySelectorAll('[data-store-confirm-cancel]')) {
        el.removeEventListener('click', this.onConfirmCancel);
      }
    }
    if (this.onConfirmOk) {
      document
        .getElementById('store-confirm-ok')
        ?.removeEventListener('click', this.onConfirmOk);
    }
    if (this.onCongratsDismiss) {
      document
        .getElementById('store-congrats-dismiss')
        ?.removeEventListener('click', this.onCongratsDismiss);
      this.congratsModal
        ?.querySelector('.store-dialog-backdrop')
        ?.removeEventListener('click', this.onCongratsDismiss);
    }

    this.hideConfirm();
    this.hideCongrats();
    this.scene?.dispose();
    this.scene = null;

    this.grid = null;
    this.actionRow = null;
    this.detailName = null;
    this.detailType = null;
    this.detailDesc = null;
    this.detailPrice = null;
    this.detailStatus = null;
    this.purchaseBtn = null;
    this.sellBtn = null;
    this.sellRefund = null;
    this.equipBtn = null;
    this.confirmModal = null;
    this.confirmEyebrow = null;
    this.confirmTitle = null;
    this.confirmBody = null;
    this.confirmName = null;
    this.confirmPrice = null;
    this.congratsModal = null;
    this.congratsName = null;
    this.onGridClick = null;
    this.onPurchaseClick = null;
    this.onSellClick = null;
    this.onEquipClick = null;
    this.onConfirmOk = null;
    this.onConfirmCancel = null;
    this.onCongratsDismiss = null;
  }

  private async reload(): Promise<void> {
    const data = await apiListStoreItems();
    this.items = data.items;
    setActiveCharacterId(data.selectedCharacterId);
    this.selectedId =
      this.items.find((item) => item.selected)?.id ??
      this.items[0]?.id ??
      getActiveCharacterId();
    this.renderGrid();
    await this.renderDetail();
  }

  private renderGrid(): void {
    if (!this.grid) return;

    if (this.items.length === 0) {
      this.grid.innerHTML = '<p class="store-empty-msg">No store items available.</p>';
      return;
    }

    this.grid.innerHTML = this.items
      .map((item) => {
        const selected = item.id === this.selectedId;
        const status = item.selected
          ? '<span class="store-card-badge store-card-badge--equipped">EQUIPPED</span>'
          : item.unlocked
            ? '<span class="store-card-badge">OWNED</span>'
            : '<span class="store-card-badge store-card-badge--locked">LOCKED</span>';
        const price =
          item.cost > 0
            ? `PLASMA: ${formatPlasmaMinerals(item.cost)}`
            : 'FREE';
        const visualClass = storeCardVisualClass(item.id);
        const glyph = storeCardGlyph(item.id);
        return `
          <button
            type="button"
            class="store-item-card${selected ? ' is-active' : ''}${item.unlocked ? '' : ' is-locked'}"
            data-item-id="${item.id}"
            data-item-type="${item.type}"
            role="option"
            aria-selected="${selected ? 'true' : 'false'}"
          >
            <span class="store-item-card-name">${item.name}</span>
            <span class="store-item-card-type">${typeLabel(item.type)}</span>
            <div class="store-item-card-visual${visualClass}" aria-hidden="true">
              <span class="store-item-card-glyph">${glyph}</span>
            </div>
            <div class="store-item-card-footer">
              <span class="store-item-card-price">${price}</span>
              ${status}
            </div>
          </button>
        `;
      })
      .join('');
  }

  private currentItem(): StoreItemState | null {
    return this.items.find((item) => item.id === this.selectedId) ?? null;
  }

  private async renderDetail(): Promise<void> {
    const item = this.currentItem();
    if (!item) {
      if (this.detailName) this.detailName.textContent = 'SELECT AN ITEM';
      if (this.detailType) this.detailType.textContent = 'ITEM PREVIEW';
      if (this.detailDesc) this.detailDesc.textContent = 'Select an item from the catalog.';
      if (this.detailPrice) this.detailPrice.textContent = '—';
      if (this.detailStatus) this.detailStatus.textContent = '';
      if (this.purchaseBtn) this.purchaseBtn.disabled = true;
      if (this.sellBtn) {
        this.sellBtn.hidden = true;
        this.sellBtn.disabled = true;
      }
      this.actionRow?.classList.remove('has-sell');
      if (this.equipBtn) this.equipBtn.disabled = true;
      await this.scene?.showAsset(null);
      return;
    }

    if (this.detailName) this.detailName.textContent = `${item.name.toUpperCase()} (PREVIEW)`;
    if (this.detailType) this.detailType.textContent = typeLabel(item.type);
    if (this.detailDesc) this.detailDesc.textContent = item.description;
    if (this.detailPrice) {
      this.detailPrice.textContent =
        item.cost > 0 ? `PLASMA: ${formatPlasmaMinerals(item.cost)}` : 'FREE';
    }

    this.syncActionButtons(item);
    await this.scene?.showAsset(item.assetFile, {
      playShowcaseIdle: isEquipableCharacterType(item.type),
      characterId: getActiveOperatorId(),
    });
  }

  private syncActionButtons(item: StoreItemState): void {
    if (!this.purchaseBtn || !this.equipBtn || !this.detailStatus) return;

    const canEquip =
      item.unlocked && isEquipableCharacterType(item.type) && !item.selected;

    if (item.unlocked) {
      this.purchaseBtn.disabled = true;
      this.purchaseBtn.classList.add('is-owned');
      this.detailStatus.textContent = item.selected
        ? 'Currently equipped'
        : isEquipableCharacterType(item.type)
          ? 'Unlocked — ready to equip'
          : 'Unlocked';
    } else {
      this.purchaseBtn.disabled = this.busy;
      this.purchaseBtn.classList.remove('is-owned');
      this.detailStatus.textContent = 'Locked — purchase with plasma minerals';
    }

    if (this.sellBtn && this.sellRefund) {
      const showSell = item.sellable;
      this.sellBtn.hidden = !showSell;
      this.sellBtn.disabled = this.busy || !showSell;
      this.sellRefund.textContent = showSell
        ? `+${formatPlasmaMinerals(item.sellRefund)}`
        : '—';
      this.actionRow?.classList.toggle('has-sell', showSell);
      if (showSell && item.unlocked) {
        this.detailStatus.textContent = item.selected
          ? `Equipped — sell back for ${formatPlasmaMinerals(item.sellRefund)} plasma`
          : `Owned — sell back for ${formatPlasmaMinerals(item.sellRefund)} plasma`;
      }
    }

    this.equipBtn.disabled = this.busy || !canEquip;
    this.equipBtn.textContent = item.selected ? 'EQUIPPED' : 'EQUIP';
  }

  private openConfirm(mode: ConfirmMode): void {
    const item = this.currentItem();
    if (!item || this.busy) return;

    if (mode === 'purchase') {
      if (item.unlocked) return;
      this.confirmMode = 'purchase';
      if (this.confirmEyebrow) this.confirmEyebrow.textContent = 'CONFIRM PURCHASE';
      if (this.confirmTitle) this.confirmTitle.textContent = 'UNLOCK ITEM?';
      if (this.confirmBody) {
        this.confirmBody.innerHTML =
          `Spend <span id="store-confirm-price">${formatPlasmaMinerals(item.cost)}</span> plasma minerals to unlock ` +
          `<span id="store-confirm-name">${item.name}</span>?`;
      }
    } else {
      if (!item.sellable) return;
      this.confirmMode = 'sell';
      if (this.confirmEyebrow) this.confirmEyebrow.textContent = 'CONFIRM SELL BACK';
      if (this.confirmTitle) this.confirmTitle.textContent = 'SELL ITEM?';
      if (this.confirmBody) {
        this.confirmBody.innerHTML =
          `Sell <span id="store-confirm-name">${item.name}</span> back for ` +
          `<span id="store-confirm-price">${formatPlasmaMinerals(item.sellRefund)}</span> plasma minerals (40% refund)?`;
      }
    }

    this.confirmName = document.getElementById('store-confirm-name');
    this.confirmPrice = document.getElementById('store-confirm-price');
    if (this.confirmModal) {
      this.confirmModal.dataset.confirmMode = mode;
      this.confirmModal.hidden = false;
    }
  }

  private hideConfirm(): void {
    if (this.confirmModal) {
      this.confirmModal.hidden = true;
    }
  }

  private async executePurchase(): Promise<void> {
    const item = this.currentItem();
    if (!item || item.unlocked || this.busy) return;

    this.busy = true;
    this.syncActionButtons(item);
    try {
      const result = await apiPurchaseStoreItem(item.id);
      this.items = result.items;
      this.showCongrats(item.name);
      this.renderGrid();
      await this.renderDetail();
    } catch (error) {
      if (this.detailStatus) {
        this.detailStatus.textContent =
          error instanceof Error ? error.message : 'Purchase failed';
      }
    } finally {
      this.busy = false;
      const current = this.currentItem();
      if (current) this.syncActionButtons(current);
    }
  }

  private async executeSell(): Promise<void> {
    const item = this.currentItem();
    if (!item || !item.sellable || this.busy) return;

    this.busy = true;
    this.syncActionButtons(item);
    try {
      const result = await apiSellStoreItem(item.id);
      this.items = result.items;
      setActiveCharacterId(result.selectedCharacterId);
      clearCharacterMeshCache();
      if (this.detailStatus) {
        this.detailStatus.textContent = `Sold back — refunded ${formatPlasmaMinerals(result.refund)} plasma`;
      }
      this.renderGrid();
      await this.renderDetail();
    } catch (error) {
      if (this.detailStatus) {
        this.detailStatus.textContent =
          error instanceof Error ? error.message : 'Sell back failed';
      }
    } finally {
      this.busy = false;
      const current = this.currentItem();
      if (current) this.syncActionButtons(current);
    }
  }

  private async handleEquip(): Promise<void> {
    const item = this.currentItem();
    if (
      !item
      || !item.unlocked
      || item.selected
      || !isEquipableCharacterType(item.type)
      || this.busy
    ) {
      return;
    }

    this.busy = true;
    this.syncActionButtons(item);
    try {
      const result = await apiSelectStoreItem(item.id);
      this.items = result.items;
      setActiveCharacterId(result.selectedCharacterId);
      clearCharacterMeshCache();
      this.renderGrid();
      await this.renderDetail();
    } catch (error) {
      if (this.detailStatus) {
        this.detailStatus.textContent =
          error instanceof Error ? error.message : 'Equip failed';
      }
    } finally {
      this.busy = false;
      const current = this.currentItem();
      if (current) this.syncActionButtons(current);
    }
  }

  private showCongrats(name: string): void {
    if (this.congratsName) this.congratsName.textContent = name;
    if (this.congratsModal) {
      this.congratsModal.hidden = false;
    }
  }

  private hideCongrats(): void {
    if (this.congratsModal) {
      this.congratsModal.hidden = true;
    }
  }
}
