import {
  HTTPFacilitatorClient,
  type FacilitatorClient,
} from "@x402/core/http";
import {
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";

import type { PaymentConfig } from "./config";
import { withSupportedFallback } from "./facilitator";

export function createPaidAuditHttpServer(
  config: PaymentConfig,
  primaryFacilitator: FacilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    timeoutMs: 8_000,
  }),
) {
  const facilitator = withSupportedFallback(
    primaryFacilitator,
    config.network as Network,
  );
  const server = new x402ResourceServer(facilitator).register(
    "eip155:*",
    new ExactEvmScheme(),
  );
  server.registerExtension(bazaarResourceServerExtension);

  return new x402HTTPResourceServer(server, {
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
}
