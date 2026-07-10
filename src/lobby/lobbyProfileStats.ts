import type { MeResponse } from '../../shared/api/me';
import { getAppProfile } from '../app/bootstrap';
import { getKdRatio } from '../auth/playerSession';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';

export function applyLobbyProfileStats(me: MeResponse): void {
  document.getElementById('lobby-username')!.textContent = me.displayName;
  document.getElementById('lobby-email')!.textContent = me.email;
  document.getElementById('stat-kills')!.textContent = String(me.stats.kills);
  document.getElementById('stat-kd')!.textContent = getKdRatio(me.stats);
  setPlasmaMineralsDisplay(me.plasmaMinerals);
}

export async function refreshLobbyProfileStats(): Promise<MeResponse> {
  const me = await getAppProfile();
  applyLobbyProfileStats(me);
  return me;
}
