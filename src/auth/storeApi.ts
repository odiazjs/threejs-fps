import type {
  PurchaseStoreItemResponse,
  SelectStoreItemResponse,
  SellStoreItemResponse,
  StoreItemsResponse,
} from '../../shared/api/store';
import { API_BASE_URL } from '../config/apiUrl';
import { rememberStoreItemAssets } from '../content/activeCharacterMesh';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { ensureSession } from './playerSession';

interface ApiErrorBody {
  error?: string;
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await ensureSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed');
  }
  return data;
}

function applyStoreItems(data: { items: StoreItemsResponse['items'] }): void {
  rememberStoreItemAssets(data.items);
}

export async function apiListStoreItems(): Promise<StoreItemsResponse> {
  const data = await authJson<StoreItemsResponse>('/api/me/store/items');
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  applyStoreItems(data);
  return data;
}

export async function apiPurchaseStoreItem(itemId: string): Promise<PurchaseStoreItemResponse> {
  const data = await authJson<PurchaseStoreItemResponse>(
    `/api/me/store/items/${encodeURIComponent(itemId)}/purchase`,
    { method: 'POST' },
  );
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  applyStoreItems(data);
  return data;
}

export async function apiSelectStoreItem(itemId: string): Promise<SelectStoreItemResponse> {
  const data = await authJson<SelectStoreItemResponse>('/api/me/store/items/select', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
  applyStoreItems(data);
  return data;
}

export async function apiSellStoreItem(itemId: string): Promise<SellStoreItemResponse> {
  const data = await authJson<SellStoreItemResponse>(
    `/api/me/store/items/${encodeURIComponent(itemId)}/sell`,
    { method: 'POST' },
  );
  setPlasmaMineralsDisplay(data.plasmaMinerals);
  applyStoreItems(data);
  return data;
}
