const PREVIEW_LIMIT = 6;
const PREVIEW_WINDOW_MS = 10 * 60 * 1_000;
const MAX_BUCKETS = 1_024;

type Bucket = {
  count: number;
  resetsAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, Bucket>();

export function consumePreviewQuota(
  request: Request,
  now = Date.now(),
): RateLimitResult {
  pruneBuckets(now);
  const key = clientKey(request);
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetsAt <= now) {
    bucket = { count: 0, resetsAt: now + PREVIEW_WINDOW_MS };
    buckets.set(key, bucket);
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetsAt - now) / 1_000),
  );
  if (bucket.count >= PREVIEW_LIMIT) {
    return {
      allowed: false,
      limit: PREVIEW_LIMIT,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    limit: PREVIEW_LIMIT,
    remaining: PREVIEW_LIMIT - bucket.count,
    retryAfterSeconds,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.retryAfterSeconds),
  };
}

function clientKey(request: Request): string {
  const forwarded =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return forwarded.split(",", 1)[0].trim().slice(0, 128) || "unknown";
}

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetsAt <= now) {
      buckets.delete(key);
    }
  }

  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) {
      break;
    }
    buckets.delete(oldest);
  }
}
