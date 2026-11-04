const BASE_MS = 1000;
const MAX_MS = 30_000;
const TRANSIENT = new Set(['unavailable', 'deadline-exceeded', 'aborted']);

/** Exponential delay for the n-th retry (0-based), capped. */
export const backoffDelay = (attempt: number) => Math.min(MAX_MS, BASE_MS * 2 ** attempt);

/** True for Firestore errors that a retry can fix (network, timeout); permission and validation errors are final. */
export const isTransient = (e: unknown) => TRANSIENT.has((e as { code?: string } | null)?.code ?? '');

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, retrying transient failures with backoff. Rethrows the last error. */
export async function withRetry<T>(fn: () => Promise<T>, attempts: number, wait: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt + 1 >= attempts || !isTransient(e)) throw e;
      await wait(backoffDelay(attempt));
    }
  }
}
