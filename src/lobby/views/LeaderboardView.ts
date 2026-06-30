import { apiGetLeaderboard } from '../../auth/leaderboardApi';
import { getKdRatio } from '../../auth/playerSession';
export class LeaderboardView {
  async mount(): Promise<void> {
    const body = document.getElementById('leaderboard-body')!;
    const status = document.getElementById('leaderboard-status')!;
    body.replaceChildren();
    status.textContent = 'Loading...';

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
  }

  unmount(): void {
    document.getElementById('leaderboard-body')?.replaceChildren();
    const status = document.getElementById('leaderboard-status');
    if (status) status.textContent = 'Loading...';
  }
}
