import {
  PLASMA_MINERAL_PACK_IDS,
  type PlasmaMineralPackId,
} from '../../../shared/content/plasmaMineralPacks.js';

export type LemonSqueezyConfig = {
  readonly apiKey: string;
  readonly storeId: string;
  readonly webhookSecret: string;
  readonly checkoutRedirectUrl: string;
  readonly variantByPack: Readonly<Record<PlasmaMineralPackId, string>>;
  readonly packByVariant: ReadonlyMap<string, PlasmaMineralPackId>;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

/** Lemon store/variant ids are numeric strings (e.g. "123456"), not pack_1k. */
function requireNumericIdEnv(name: string): string {
  const value = requireEnv(name);
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `${name} must be the Lemon Squeezy numeric variant id (digits only), not "${value}"`,
    );
  }
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

/** True when offline mock purchases are explicitly enabled. */
export function isPlasmaPurchaseMockEnabled(): boolean {
  return process.env.PLASMA_PURCHASE_MOCK?.trim().toLowerCase() === 'true';
}

export function getLemonSqueezyConfig(): LemonSqueezyConfig {
  const apiKey = requireEnv('LEMONSQUEEZY_API_KEY');
  const storeId = requireEnv('LEMONSQUEEZY_STORE_ID');
  const webhookSecret = requireEnv('LEMONSQUEEZY_WEBHOOK_SECRET');
  const checkoutRedirectUrl =
    optionalEnv('LEMONSQUEEZY_CHECKOUT_REDIRECT_URL') ?? 'http://localhost:5173/lobby.html';

  const variantByPack = {
    pack_1k: requireNumericIdEnv('LEMONSQUEEZY_VARIANT_PACK_1K'),
    pack_10k: requireNumericIdEnv('LEMONSQUEEZY_VARIANT_PACK_10K'),
    pack_100k: requireNumericIdEnv('LEMONSQUEEZY_VARIANT_PACK_100K'),
  } as const satisfies Record<PlasmaMineralPackId, string>;

  const packByVariant = new Map<string, PlasmaMineralPackId>();
  for (const packId of PLASMA_MINERAL_PACK_IDS) {
    packByVariant.set(String(variantByPack[packId]), packId);
  }

  return {
    apiKey,
    storeId,
    webhookSecret,
    checkoutRedirectUrl,
    variantByPack,
    packByVariant,
  };
}

export function getVariantIdForPack(packId: PlasmaMineralPackId): string {
  return getLemonSqueezyConfig().variantByPack[packId];
}

export function getPackIdForVariant(variantId: string | number): PlasmaMineralPackId | null {
  return getLemonSqueezyConfig().packByVariant.get(String(variantId)) ?? null;
}
