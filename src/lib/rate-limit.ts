type Bucket = { count: number; resetAt: number };

const globalForLimit = globalThis as typeof globalThis & {
  __diffyRateLimit?: Map<string, Bucket>;
};

function store(): Map<string, Bucket> {
  if (!globalForLimit.__diffyRateLimit) {
    globalForLimit.__diffyRateLimit = new Map();
  }
  return globalForLimit.__diffyRateLimit;
}

/**
 * Simple fixed-window limiter. Returns null if allowed, or retry-after seconds.
 */
export function takeToken(
  key: string,
  limit: number,
  windowMs: number,
): number | null {
  const now = Date.now();
  const map = store();
  let bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    map.set(key, bucket);
  }
  if (bucket.count >= limit) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }
  bucket.count += 1;
  return null;
}

export function clientKeyFromRequest(request: Request): string {
  const xf = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anon";
  return xf.slice(0, 128);
}
