import '../styles/pages.css';
import { getKdRatio, requireSession } from '../auth/playerSession';
import { LobbyScene } from './LobbyScene';

const session = requireSession();

document.getElementById('lobby-username')!.textContent = session.username;
document.getElementById('stat-kills')!.textContent = String(session.kills);
document.getElementById('stat-kd')!.textContent = getKdRatio(session);

const scene = new LobbyScene(document.getElementById('lobby-canvas')!);

const joinBtn = document.getElementById('lobby-join-btn') as HTMLButtonElement;
joinBtn.addEventListener('click', () => {
  joinBtn.disabled = true;
  joinBtn.textContent = 'JOINING...';
  window.location.href = '/game.html';
});

window.addEventListener('pagehide', () => scene.dispose());
