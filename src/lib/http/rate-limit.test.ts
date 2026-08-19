import { describe, expect, it } from "vitest";

import { consumePreviewQuota, rateLimitHeaders } from "./rate-limit";

function requestFor(ip: string) {
  return new Request("https://instructlint.example/api/preview", {
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

describe("preview rate limiting", () => {
  it("allows six requests per client and rejects the seventh", () => {
    const request = requestFor("198.51.100.10");
    const now = 1_000_000;

    for (let count = 0; count < 6; count += 1) {
      expect(consumePreviewQuota(request, now)).toMatchObject({ allowed: true });
    }

    const denied = consumePreviewQuota(request, now);
    expect(denied).toEqual({
      allowed: false,
      limit: 6,
      remaining: 0,
      retryAfterSeconds: 600,
    });
    expect(rateLimitHeaders(denied)).toEqual({
      "RateLimit-Limit": "6",
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": "600",
    });
  });

  it("isolates clients and resets the fixed window", () => {
    const first = requestFor("198.51.100.20");
    const second = requestFor("198.51.100.21");
    const now = 2_000_000;

    expect(consumePreviewQuota(first, now).remaining).toBe(5);
    expect(consumePreviewQuota(second, now).remaining).toBe(5);
    expect(consumePreviewQuota(first, now + 600_001)).toMatchObject({
      allowed: true,
      remaining: 5,
    });
  });
});
