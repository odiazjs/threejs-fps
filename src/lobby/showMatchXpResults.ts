import { apiGetRankProgression } from '../auth/rankApi';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { setPlasmaMineralsDisplay } from '../ui/plasmaMineralsHud';
import { refreshLobbyProfileStats } from './lobbyProfileStats';
import { MatchXpResultsModal } from './MatchXpResultsModal';
import {
  hasSeenMatchXp,
  peekPendingMatchXp,
  savePendingMatchXpSummary,
  type PendingMatchXpPayload,
} from './pendingMatchRewards';

const RECENT_MATCH_FALLBACK_MS = 2 * 60 * 60 * 1000; // 2 hours

const modal = new MatchXpResultsModal();

async function resolvePayloadFromApi(): Promise<PendingMatchXpPayload | null> {
  try {
    const data = await apiGetRankProgression();
    const recent = data.recentMatches[0];
    if (!recent) return null;
    if (hasSeenMatchXp(recent.matchId)) return null;
    const endedAt = Date.parse(recent.endedAt);
    if (!Number.isFinite(endedAt) || Date.now() - endedAt > RECENT_MATCH_FALLBACK_MS) {
      return null;
    }
    if ((recent.xpGained ?? 0) <= 0 && recent.rpDelta === 0) return null;
    savePendingMatchXpSummary({
      matchId: recent.matchId,
      won: recent.won,
      tied: recent.tied,
      kills: recent.kills,
      deaths: recent.deaths,
      xpGained: recent.xpGained ?? 0,
      seasonXpGained: recent.seasonXpGained ?? 0,
      rpDelta: recent.rpDelta,
      mineralsGained: recent.mineralsGained ?? 0,
    });
    return peekPendingMatchXp();
  } catch (error) {
    console.warn('[Lobby] could not load match XP fallback', error);
    return null;
  }
}

export interface ShowMatchXpOptions {
  /** Show a lobby spinner while waiting on the network (e.g. after leaving a match). */
  withLoading?: boolean;
}

/** Show pending match XP modal if one exists (after leave or cold lobby boot). */
export async function maybeShowMatchXpResultsModal(
  options: ShowMatchXpOptions = {},
): Promise<boolean> {
  if (modal.isOpen) return true;

  let payload = peekPendingMatchXp();
  if (!payload) {
    const loading = options.withLoading ? LoadingOverlay.shared() : null;
    loading?.show('Loading match results...');
    try {
      payload = await resolvePayloadFromApi();
    } finally {
      loading?.hide();
    }
  }

  if (!payload) return false;

  // Instant chip update from cached award balance (game iframe can't touch lobby DOM).
  if (typeof payload.plasmaMinerals === 'number') {
    setPlasmaMineralsDisplay(payload.plasmaMinerals);
  }
  // Authoritative refresh for minerals + profile rank strip.
  void refreshLobbyProfileStats();

  modal.setClosedHandler(() => {
    void refreshLobbyProfileStats();
  });
  modal.open(payload);
  return true;
}
