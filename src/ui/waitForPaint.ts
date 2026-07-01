/** Wait for the browser to paint (default: two animation frames). */
export function waitForPaint(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(frames);
  });
}
