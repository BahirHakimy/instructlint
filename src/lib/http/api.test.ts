import { describe, expect, it } from "vitest";

import { AppError } from "../contracts";
import { readRepositoryRequest, respondToApiError } from "./api";

function jsonRequest(body: string, headers?: HeadersInit) {
  return new Request("https://instructlint.example/api/preview", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("readRepositoryRequest", () => {
  it("returns a trimmed repository URL", async () => {
    await expect(
      readRepositoryRequest(
        jsonRequest('{"repoUrl":"  https://github.com/acme/widgets  "}'),
      ),
    ).resolves.toBe("https://github.com/acme/widgets");
  });

  it.each([
    ["not-json", "INVALID_JSON"],
    ["{}", "INVALID_REQUEST"],
    ['{"repoUrl":42}', "INVALID_REQUEST"],
  ])("rejects malformed input %#", async (body, code) => {
    const response = respondToApiError(
      await readRepositoryRequest(jsonRequest(body)).catch((error) => error),
    );
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it("enforces the request byte ceiling before parsing", async () => {
    const response = respondToApiError(
      await readRepositoryRequest(
        jsonRequest('{"repoUrl":"https://github.com/acme/widgets"}', {
          "content-length": "2049",
        }),
      ).catch((error) => error),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "REQUEST_TOO_LARGE" },
    });
  });

  it("enforces the actual request byte ceiling when content-length is absent", async () => {
    const response = respondToApiError(
      await readRepositoryRequest(jsonRequest(JSON.stringify({ repoUrl: "x".repeat(2_049) }))).catch(
        (error) => error,
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "REQUEST_TOO_LARGE" },
    });
  });
});

describe("respondToApiError", () => {
  it("maps known upstream errors without exposing their causes", async () => {
    const response = respondToApiError(
      new AppError(
        "GITHUB_REQUEST_FAILED",
        "GitHub request failed.",
        502,
        new Error("secret upstream detail"),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "GITHUB_REQUEST_FAILED",
        message: "GitHub request failed.",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret upstream detail");
  });
});
