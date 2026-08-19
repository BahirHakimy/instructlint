import { NextResponse } from "next/server";

import { auditPublicRepository } from "@/src/lib/audit/service";
import {
  apiError,
  readRepositoryRequest,
  respondToApiError,
} from "@/src/lib/http/api";
import {
  consumePreviewQuota,
  rateLimitHeaders,
} from "@/src/lib/http/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const repoUrl = await readRepositoryRequest(request);
    const quota = consumePreviewQuota(request);
    if (!quota.allowed) {
      const response = apiError(
        429,
        "TOO_MANY_REQUESTS",
        "Too many preview requests. Try again after the rate-limit window resets.",
        true,
      );
      for (const [name, value] of Object.entries(rateLimitHeaders(quota))) {
        response.headers.set(name, value);
      }
      response.headers.set("Retry-After", String(quota.retryAfterSeconds));
      return response;
    }

    const preview = await auditPublicRepository(repoUrl, "preview");
    return NextResponse.json(preview, {
      headers: {
        "Cache-Control": "no-store",
        ...rateLimitHeaders(quota),
      },
    });
  } catch (error) {
    return respondToApiError(error);
  }
}
