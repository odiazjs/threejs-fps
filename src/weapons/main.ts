import { handoffPageBoot } from '../app/pageBoot';
import { ensureSession } from '../auth/playerSession';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { WeaponsScene } from './WeaponsScene';

const loading = LoadingOverlay.shared();
loading.show('Loading weapons...');
handoffPageBoot();

async function startWeapons(): Promise<void> {
  try {    await ensureSession();

    const canvasHost = document.getElementById('weapons-canvas')!;
    const picker = document.getElementById('weapons-picker')!;
    const scene = new WeaponsScene(canvasHost, picker);
    await scene.whenReady();

    const goBack = (): void => {
      if (loading.active) return;
      scene.dispose();
      window.location.href = '/lobby.html';
    };

    document.getElementById('weapons-back-btn')!.addEventListener('click', goBack);
    window.addEventListener('pagehide', () => scene.dispose());
  } catch (error) {
    console.warn('[Weapons] failed to start', error);
    window.location.href = '/lobby.html';
  } finally {
    loading.hide();
  }
}

void startWeapons();
