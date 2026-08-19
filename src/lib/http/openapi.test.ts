import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type OpenApiDocument = {
  info: {
    contact: { url: string };
    "x-guidance": string;
  };
  paths: {
    "/api/health": { get: { security: unknown[] } };
    "/api/preview": { post: { security: unknown[] } };
    "/api/report": {
      post: {
        description: string;
        responses: Record<string, unknown>;
        "x-x402": { settlement: string };
        "x-payment-info": {
          protocols: { x402: Record<string, never> }[];
          price: { mode: string; currency: string; amount: string };
        };
      };
    };
  };
};

describe("published OpenAPI contract", () => {
  it("documents paid-report settlement and every application failure status", () => {
    const document = JSON.parse(
      readFileSync(
        new URL("../../../public/openapi.json", import.meta.url),
        "utf8",
      ),
    ) as OpenApiDocument;
    const report = document.paths["/api/report"].post;

    expect(document.info.contact.url).toBe(
      "https://github.com/BahirHakimy/instructlint/issues",
    );
    expect(document.info["x-guidance"]).toContain("/api/report");
    expect(document.paths["/api/health"].get.security).toEqual([]);
    expect(document.paths["/api/preview"].post.security).toEqual([]);
    expect(report["x-x402"].settlement).toBe(
      "after-successful-handler-response",
    );
    expect(report["x-payment-info"]).toEqual({
      protocols: [{ x402: {} }],
      price: { mode: "fixed", currency: "USD", amount: "1.00" },
    });
    expect(report.description).toContain("application errors are not settled");
    expect(Object.keys(report.responses)).toEqual(
      expect.arrayContaining([
        "200",
        "400",
        "402",
        "403",
        "404",
        "413",
        "429",
        "500",
        "502",
        "503",
        "504",
      ]),
    );
  });
});
