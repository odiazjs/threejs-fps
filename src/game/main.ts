import { Game } from '../app/Game';
import { resolveGameJoinIntent } from '../auth/gameJoin';
import { apiListCharacters } from '../auth/charactersApi';
import { apiGetMe } from '../auth/meApi';
import { apiGetRankProgression } from '../auth/rankApi';
import { ensureSession } from '../auth/playerSession';
import { isCompetitiveGameMode } from '../../shared/combat/match';
import type { GameLaunchParticipant } from '../../shared/network/gameInvite';
import {
  getActiveOperatorId,
  setActiveOperatorId,
} from '../content/activeOperatorCharacter';
import { getServerUrl } from '../config/serverUrl';
import { bootstrapDebugFlags } from '../debug/debugQuery';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { PreMatchOverlay } from '../ui/PreMatchOverlay';

function hideClickToPlayBlocker(): void {
  const blocker = document.getElementById('blocker');
  if (!blocker) return;
  blocker.hidden = true;
  blocker.style.display = 'none';
}

async function seedLocalParticipant(
  userId: string,
  username: string,
  teamId: number,
  me: Awaited<ReturnType<typeof apiGetMe>>,
): Promise<GameLaunchParticipant> {
  let rankTier = 'bronze';
  let rankDivision = 1;
  let rankName = 'Bronze I';
  try {
    const progression = await apiGetRankProgression();
    rankTier = progression.rank.tier;
    rankDivision = progression.rank.division;
    rankName = progression.rank.name;
  } catch {
    // Keep bronze defaults if rank API is unavailable.
  }

  return {
    userId,
    username,
    teamId: teamId === 1 ? 1 : 0,
    rankLevel: Math.max(1, me.stats.level || 1),
    careerKills: Math.max(0, me.stats.kills || 0),
    careerDeaths: Math.max(0, me.stats.deaths || 0),
    xp: Math.max(0, me.stats.xp || 0),
    rankTier,
    rankDivision,
    rankName,
    selectedOperatorId: getActiveOperatorId(),
  };
}

async function startGame(): Promise<void> {
  bootstrapDebugFlags();
  const loading = LoadingOverlay.shared();
  hideClickToPlayBlocker();

  try {
    const session = await ensureSession();
    const [me, characters] = await Promise.all([apiGetMe(), apiListCharacters()]);
    setActiveOperatorId(characters.selectedCharacterId);

    console.info('[Game] Colyseus server:', getServerUrl());

    const joinIntent = await resolveGameJoinIntent({
      userId: session.userId,
      username: session.username,
    });
    const competitive = isCompetitiveGameMode(joinIntent?.gameMode);

    if (!competitive) {
      loading.show('Joining game...');
    } else {
      loading.reset();
      hideClickToPlayBlocker();

      // Prefer LAUNCH-prefetched party roster; fall back to local career card.
      let participants = joinIntent?.participants ?? [];
      if (participants.length === 0) {
        participants = [
          await seedLocalParticipant(
            session.userId,
            session.username,
            joinIntent?.teamId ?? 0,
            me,
          ),
        ];
        if (joinIntent) joinIntent.participants = participants;
      }

      // Paint the pre-match screen before any Game boot work so click-to-play
      // never flashes and the roster is already filled.
      const preMatch = new PreMatchOverlay();
      preMatch.show('Preparing match…', participants);
    }

    const game = new Game();
    await game.start(
      { userId: session.userId, username: session.username },
      joinIntent,
      () => {
        if (!competitive) loading.hide();
      },
      (message) => {
        if (!competitive) loading.setMessage(message);
      },
    );
  } catch (error) {
    loading.reset();
    const detail = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Game] failed to join', error);
    alert(
      `Could not join game: ${detail}\n\nServer: ${getServerUrl()}\nCheck that the game server is running and CORS allows this site.`,
    );
    window.location.href = '/lobby.html';
  }
}

void startGame();
