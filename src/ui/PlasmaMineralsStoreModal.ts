import {
  formatPlasmaPackPrice,
  isPlasmaMineralPackId,
  PLASMA_MINERAL_PACKS,
  type PlasmaMineralPackId,
} from '../../shared/content/plasmaMineralPacks';
import { apiPurchasePlasmaMinerals } from '../auth/meApi';
import { formatPlasmaMinerals } from './plasmaMineralsHud';
import { showErrorSnackbar, showSuccessSnackbar } from './snackbar';

export class PlasmaMineralsStoreModal {
  private readonly root: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly packListEl: HTMLElement;
  private purchasing = false;
  private bound = false;

  private readonly onRootClick = (event: MouseEvent): void => {
    void this.handleClick(event);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isOpen()) {
      event.preventDefault();
      this.close();
    }
  };

  constructor(root: HTMLElement) {
    this.root = root;
    this.statusEl = root.querySelector('[data-plasma-store-status]')!;
    this.packListEl = root.querySelector('[data-plasma-store-packs]')!;
    this.renderPacks();
  }

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.root.addEventListener('click', this.onRootClick);
    document.addEventListener('keydown', this.onKeyDown);

    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-plasma-get-more]')) {
      if (btn.disabled) continue;
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        this.open();
      });
    }
  }

  open(): void {
    this.setStatus('');
    this.root.hidden = false;
    document.body.classList.add('plasma-store-open');
  }

  close(): void {
    if (this.purchasing) return;
    this.root.hidden = true;
    document.body.classList.remove('plasma-store-open');
    this.setStatus('');
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  private renderPacks(): void {
    this.packListEl.innerHTML = PLASMA_MINERAL_PACKS.map((pack) => {
      return `
        <button
          type="button"
          class="plasma-store-pack"
          data-plasma-pack-id="${pack.id}"
        >
          <span class="plasma-store-pack-amount">${formatPlasmaMinerals(pack.amount)}</span>
          <span class="plasma-store-pack-label">${pack.label}</span>
          <span class="plasma-store-pack-price">${formatPlasmaPackPrice(pack.priceUsd)}</span>
        </button>
      `;
    }).join('');
  }

  private setStatus(message: string): void {
    this.statusEl.textContent = message;
    this.statusEl.hidden = !message;
  }

  private setPurchasing(active: boolean): void {
    this.purchasing = active;
    for (const btn of this.packListEl.querySelectorAll<HTMLButtonElement>('[data-plasma-pack-id]')) {
      btn.disabled = active;
    }
    const closeBtn = this.root.querySelector<HTMLButtonElement>('[data-plasma-store-close]');
    if (closeBtn) closeBtn.disabled = active;
  }

  private async handleClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('[data-plasma-store-close]') || target === this.root) {
      this.close();
      return;
    }

    const packBtn = target.closest<HTMLButtonElement>('[data-plasma-pack-id]');
    if (!packBtn || this.purchasing) return;

    const packId = packBtn.dataset.plasmaPackId;
    if (!packId || !isPlasmaMineralPackId(packId)) return;

    await this.purchase(packId);
  }

  private async purchase(packId: PlasmaMineralPackId): Promise<void> {
    this.setPurchasing(true);
    this.setStatus('Processing purchase...');
    try {
      const result = await apiPurchasePlasmaMinerals(packId);
      const message = `Added ${formatPlasmaMinerals(result.amountGranted)} plasma minerals`;
      this.setStatus(message);
      showSuccessSnackbar(message);
      this.setPurchasing(false);
      window.setTimeout(() => {
        if (!this.purchasing) this.close();
      }, 700);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Purchase failed';
      this.setStatus(message);
      showErrorSnackbar(message);
      this.setPurchasing(false);
    }
  }
}
