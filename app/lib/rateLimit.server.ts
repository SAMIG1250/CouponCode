// In-memory fixed-window limiter. Fine for a single-instance M1 deploy; if this app is ever
// scaled horizontally, swap for a shared store (e.g. Redis) so limits apply across instances.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const hits = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(key: string, now: number): boolean {
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}
