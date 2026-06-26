export class LoopingSoundService {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private playing = false;
  private volume = 1;

  async preload(src: string): Promise<void> {
    this.ensureContext();
    if (!this.context || this.buffer) return;

    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load sound: ${src}`);
    }

    const data = await response.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(data);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.gain) {
      this.gain.gain.value = volume;
    }
  }

  unlock(): void {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
  }

  setActive(active: boolean): void {
    if (active) {
      this.start();
    } else {
      this.stop();
    }
  }

  stop(): void {
    if (!this.source) return;

    try {
      this.source.stop();
    } catch {
      // Already stopped.
    }

    this.source.disconnect();
    this.source = null;
    this.playing = false;
  }

  private start(): void {
    this.ensureContext();
    if (!this.context || !this.gain || !this.buffer || this.playing) return;

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.gain);
    source.start();
    this.source = source;
    this.playing = true;
  }

  private ensureContext(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.context.destination);
  }
}
