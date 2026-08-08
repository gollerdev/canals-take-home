const JITTER_RATIO = 0.4;

export async function simulateNetworkLatency(baseMs: number): Promise<void> {
  if (baseMs <= 0) {
    return;
  }

  const jitter = baseMs * JITTER_RATIO;
  const delay = baseMs - jitter + Math.random() * jitter * 2;

  await new Promise((resolve) => setTimeout(resolve, delay));
}
