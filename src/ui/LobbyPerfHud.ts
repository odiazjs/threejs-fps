const FPS_SAMPLE_SEC = 0.5;

/** Drives the styled lobby perf panel (#lobby-perf-*). */
export class LobbyPerfHud {
  private readonly fpsEl: HTMLElement | null;
  private readonly msEl: HTMLElement | null;

  private frameAccumulator = 0;
  private frameCount = 0;
  private fps = 60;

  constructor() {
    this.fpsEl = document.getElementById('lobby-perf-fps');
    this.msEl = document.getElementById('lobby-perf-ms');
  }

  update(delta: number): void {
    const frameMs = delta * 1000;
    this.frameCount += 1;
    this.frameAccumulator += delta;

    if (this.frameAccumulator >= FPS_SAMPLE_SEC) {
      this.fps = this.frameCount / this.frameAccumulator;
      this.frameCount = 0;
      this.frameAccumulator = 0;
    }

    if (this.fpsEl) {
      const stable = this.fps >= 55;
      const warn = this.fps >= 45 && !stable;
      this.fpsEl.textContent = stable
        ? `${this.fps.toFixed(0)} STABLE`
        : `${this.fps.toFixed(0)}`;
      this.fpsEl.classList.toggle('lobby-perf-value--stable', stable);
      this.fpsEl.classList.toggle('lobby-perf-value--neutral', warn);
      this.fpsEl.classList.toggle('lobby-perf-value--warn', !stable && !warn);
    }

    if (this.msEl) {
      this.msEl.textContent = `${frameMs.toFixed(0)} MS`;
    }
  }
}
