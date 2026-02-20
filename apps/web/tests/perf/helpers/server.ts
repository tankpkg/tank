export const PERF_PORT = 3999;
export const PERF_BASE_URL = `http://localhost:${PERF_PORT}`;

export async function waitForServer(
  baseUrl: string = PERF_BASE_URL,
  timeoutMs: number = 30_000,
): Promise<void> {
  const start = Date.now();
  const pollInterval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Perf server at ${baseUrl} did not become ready within ${timeoutMs}ms`,
  );
}

export async function isServerRunning(
  baseUrl: string = PERF_BASE_URL,
): Promise<boolean> {
  try {
    const response = await fetch(baseUrl, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
