import type { EnvironmentAudioConfig } from '../content/audioConfig';
import { LoopingSoundService } from './LoopingSoundService';

/** Looping ambience for the game scene. */
export class EnvironmentSoundService extends LoopingSoundService {
  configure(config: EnvironmentAudioConfig): void {
    this.setVolume(config.volume);
  }
}
