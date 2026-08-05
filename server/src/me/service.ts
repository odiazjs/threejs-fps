import type { MeResponse, PurchasePlasmaMineralsResponse } from '../../../shared/api/me.js';
import { getPlasmaMineralPack } from '../../../shared/content/plasmaMineralPacks.js';
import type { AuthContext } from '../auth/middleware.js';
import { addPlasmaMinerals, ensureUser, getPlasmaMinerals } from '../db/users.js';
import { getPlayerStats } from '../stats/service.js';

export async function getMe(auth: AuthContext): Promise<MeResponse> {
  await ensureUser(auth);

  const [stats, plasmaMinerals] = await Promise.all([
    getPlayerStats(auth.sub),
    getPlasmaMinerals(auth.sub),
  ]);

  return {
    userId: auth.sub,
    email: auth.email!,
    displayName: auth.displayName!,
    plasmaMinerals,
    stats,
  };
}

/** Offline mock purchase (`PLASMA_PURCHASE_MOCK=true`) — no payment provider. */
export async function purchasePlasmaMinerals(
  auth: AuthContext,
  packIdRaw: string,
): Promise<PurchasePlasmaMineralsResponse> {
  await ensureUser(auth);

  const pack = getPlasmaMineralPack(packIdRaw);
  if (!pack) {
    throw new Error('Invalid plasma mineral pack');
  }

  const plasmaMinerals = await addPlasmaMinerals(auth.sub, pack.amount);
  return {
    plasmaMinerals,
    amountGranted: pack.amount,
    packId: pack.id,
  };
}
