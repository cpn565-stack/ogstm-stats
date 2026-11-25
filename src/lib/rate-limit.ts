const WINDOW_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 5;
const MAX_TRACKED_KEYS = 1_000;

interface AttemptBucket {
  timestamps: number[];
}

const buckets = new Map<string, AttemptBucket>();

function pruneExpired(now: number) {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets.entries()) {
    const active = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);
    if (active.length === 0) {
      buckets.delete(key);
    } else {
      bucket.timestamps = active;
    }
  }
}

export function checkLoginRateLimit(
  key: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true };

  const active = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);
  if (active.length === 0) {
    buckets.delete(key);
    return { allowed: true };
  }
  bucket.timestamps = active;

  if (active.length >= MAX_FAILED_ATTEMPTS) {
    const oldest = active[0]!;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  pruneExpired(now);
  const existing = buckets.get(key);
  if (existing) {
    existing.timestamps = existing.timestamps
      .filter((ts) => now - ts < WINDOW_MS)
      .concat(now);
  } else {
    buckets.set(key, { timestamps: [now] });
  }
}

export function resetLoginRateLimit(key: string): void {
  buckets.delete(key);
}

/** 僅供單元測試重置記憶體狀態 */
export function clearAllLoginRateLimitsForTest(): void {
  buckets.clear();
}
