import type { MeResponse } from '../../shared/api/me';
import type { RankProgressionResponse } from '../../shared/api/rank';
import { getAppProfile } from '../app/bootstrap';
import { apiGetRankProgression } from '../auth/rankApi';
import { getKdRatio } from '../auth/playerSession';
import { formatRp, rankIconUrl } from '../content/rankIcons';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';

export function applyLobbyProfileStats(me: MeResponse): void {
  document.getElementById('lobby-username')!.textContent = me.displayName;
  document.getElementById('lobby-email')!.textContent = me.email;
  document.getElementById('stat-kills')!.textContent = String(me.stats.kills);
  document.getElementById('stat-kd')!.textContent = getKdRatio(me.stats);
  setPlasmaMineralsDisplay(me.plasmaMinerals);
}

export function applyLobbyProfileRank(data: RankProgressionResponse): void {
  const root = document.getElementById('lobby-profile-rank');
  const icon = document.getElementById('lobby-rank-icon') as HTMLImageElement | null;
  const name = document.getElementById('lobby-rank-name');
  const xp = document.getElementById('lobby-rank-xp');
  if (!root || !icon || !name || !xp) return;

  icon.src = rankIconUrl(data.rank.tier, data.rank.division);
  icon.alt = data.rank.name;
  name.textContent = data.rank.name.toUpperCase();
  xp.textContent = `${formatRp(data.account.xpIntoLevel)} / ${formatRp(data.account.xpForNextLevel)} XP`;
  root.hidden = false;
}

export async function refreshLobbyProfileStats(): Promise<MeResponse> {
  const [me, rank] = await Promise.all([
    getAppProfile(),
    apiGetRankProgression().catch((error) => {
      console.warn('[Lobby] Could not load rank for profile', error);
      return null;
    }),
  ]);
  applyLobbyProfileStats(me);
  if (rank) applyLobbyProfileRank(rank);
  return me;
}
