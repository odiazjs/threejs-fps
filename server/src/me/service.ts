import type { MeResponse } from '../../../shared/api/me.js';
import type { AuthContext } from '../auth/middleware.js';
import { ensureUser } from '../db/users.js';
import { getPlayerStats } from '../stats/service.js';

export async function getMe(auth: AuthContext): Promise<MeResponse> {
  await ensureUser(auth);

  const stats = await getPlayerStats(auth.sub);

  return {
    userId: auth.sub,
    email: auth.email!,
    displayName: auth.displayName!,
    stats,
  };
}
