/** Procedural arena impulse — avoids shipping a separate IR asset. */
export function createArenaReverbImpulse(
  context: AudioContext,
  durationSec = 1.6,
  decay = 2.8,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const buffer = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }

  return buffer;
}

export function clampReverbLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}

/** Dry/wet gains — keeps a little direct signal even at full wet. */
export function reverbDryWetGains(volume: number, reverbLevel: number): { dry: number; wet: number } {
  const wet = clampReverbLevel(reverbLevel);
  return {
    dry: volume * (1 - wet * 0.82),
    wet: volume * wet,
  };
}
