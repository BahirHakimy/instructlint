import { HTTPFacilitatorClient } from "@x402/core/http";
import {
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { withX402FromHTTPServer } from "@x402/next";
import type { NextRequest, NextResponse } from "next/server";

import type { PaymentConfig } from "./config";

export function protectPaidAudit<T>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  config: PaymentConfig,
): (request: NextRequest) => Promise<NextResponse<T>> {
  const facilitator = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    timeoutMs: 8_000,
  });
  const server = new x402ResourceServer(facilitator).register(
    "eip155:*",
    new ExactEvmScheme(),
  );

  const httpServer = new x402HTTPResourceServer(server, {
    "/api/report": {
      accepts: [
        {
          scheme: "exact",
          price: config.price,
          network: config.network as Network,
          payTo: config.payTo,
        },
      ],
      description:
        "Full InstructLint audit of repository agent instructions, including evidence and repair suggestions.",
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({
          bodyType: "json",
          input: { repoUrl: "https://github.com/owner/repository" },
          inputSchema: {
            properties: {
              repoUrl: {
                type: "string",
                description: "Canonical public GitHub repository URL.",
              },
            },
            required: ["repoUrl"],
          },
          output: {
            example: {
              ok: true,
              repository: { owner: "owner", name: "repository" },
              audit: {
                mode: "full",
                score: 82,
                findings: [
                  {
                    severity: "high",
                    title: "Documented script does not exist",
                  },
                ],
              },
            },
          },
        }),
      },
    },
  });

  return withX402FromHTTPServer(handler, httpServer);
}

export type { PaymentConfig } from "./config";
