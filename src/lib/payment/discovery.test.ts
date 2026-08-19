import { describe, expect, it } from "vitest";

import { GET } from "../../../app/.well-known/x402/route";

describe("x402 discovery document", () => {
  it("fans out to the paid report endpoint", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      version: 1,
      resources: ["https://instructlint.vercel.app/api/report"],
      instructions:
        "POST JSON with repoUrl set to a canonical public GitHub repository URL.",
    });
  });
});
