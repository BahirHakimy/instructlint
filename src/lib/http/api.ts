import { NextResponse } from "next/server";

import { AppError } from "../contracts";

const MAX_REQUEST_BYTES = 2_048;
const MAX_REPOSITORY_URL_LENGTH = 300;

export type ApiErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export async function readRepositoryRequest(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new RequestError("REQUEST_TOO_LARGE", "Request body is too large.", 413);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestError("REQUEST_TOO_LARGE", "Request body is too large.", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new RequestError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  if (typeof parsed !== "object" || parsed === null || !("repoUrl" in parsed)) {
    throw new RequestError(
      "INVALID_REQUEST",
      "Request body must contain a repoUrl string.",
      400,
    );
  }

  const repoUrl = (parsed as { repoUrl?: unknown }).repoUrl;
  if (
    typeof repoUrl !== "string" ||
    repoUrl.trim().length === 0 ||
    repoUrl.length > MAX_REPOSITORY_URL_LENGTH
  ) {
    throw new RequestError(
      "INVALID_REQUEST",
      "repoUrl must be a non-empty GitHub repository URL.",
      400,
    );
  }

  return repoUrl.trim();
}

export function apiError(
  status: number,
  code: string,
  message: string,
  retryable = false,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { ok: false, error: { code, message, retryable } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function respondToApiError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof RequestError || error instanceof AppError) {
    return apiError(error.status, error.code, error.message, isRetryable(error.code));
  }

  return apiError(500, "INTERNAL_ERROR", "The audit could not be completed.", true);
}

class RequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "RequestError";
    this.code = code;
    this.status = status;
  }
}

function isRetryable(code: string): boolean {
  return ["GITHUB_RATE_LIMITED", "GITHUB_REQUEST_FAILED", "GITHUB_TIMEOUT"].includes(
    code,
  );
}
