import { handoffPageBoot } from '../app/pageBoot';
import { apiGetLeaderboard } from '../auth/leaderboardApi';
import { ensureSession, getKdRatio } from '../auth/playerSession';
import { LoadingOverlay } from '../ui/LoadingOverlay';

const loading = LoadingOverlay.shared();
loading.show('Loading leaderboard...');
handoffPageBoot();

async function startLeaderboard(): Promise<void> {  const body = document.getElementById('leaderboard-body')!;
  const status = document.getElementById('leaderboard-status')!;

  try {
    await ensureSession();

    document.getElementById('leaderboard-back-btn')!.addEventListener('click', () => {
      if (loading.active) return;
      window.location.href = '/lobby.html';
    });

    const data = await apiGetLeaderboard();
    body.replaceChildren();

    if (data.players.length === 0) {
      status.textContent = 'No players on the board yet';
      return;
    }

    status.textContent = `Top ${data.players.length} players by kills`;

    data.players.forEach((player, index) => {
      const row = document.createElement('tr');

      const rankCell = document.createElement('td');
      rankCell.className = 'leaderboard-rank';
      rankCell.textContent = String(index + 1);

      const nameCell = document.createElement('td');
      nameCell.className = 'leaderboard-player';
      nameCell.textContent = player.displayName;

      const emailCell = document.createElement('td');
      emailCell.className = 'leaderboard-email';
      emailCell.textContent = player.email;

      const killsCell = document.createElement('td');
      killsCell.className = 'leaderboard-kills';
      killsCell.textContent = String(player.kills);

      const kdCell = document.createElement('td');
      kdCell.className = 'leaderboard-kd';
      kdCell.textContent = getKdRatio(player);

      row.append(rankCell, nameCell, emailCell, killsCell, kdCell);
      body.appendChild(row);
    });
  } catch (error) {
    console.warn('[Leaderboard] failed to start', error);
    status.textContent =
      error instanceof Error ? error.message : 'Could not load leaderboard';
  } finally {
    loading.hide();
  }
}

void startLeaderboard();
