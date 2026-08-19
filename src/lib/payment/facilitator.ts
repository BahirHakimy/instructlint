import type { FacilitatorClient } from "@x402/core/http";
import type { Network, SupportedResponse } from "@x402/core/types";

function fallbackSupportedResponse(network: Network): SupportedResponse {
  return {
    kinds: [{ x402Version: 2, scheme: "exact", network }],
    extensions: ["bazaar"],
    signers: {},
  };
}

export function withSupportedFallback(
  facilitator: FacilitatorClient,
  network: Network,
): FacilitatorClient {
  let lastSupported: SupportedResponse | null = null;

  return {
    verify: (paymentPayload, paymentRequirements) =>
      facilitator.verify(paymentPayload, paymentRequirements),
    settle: (paymentPayload, paymentRequirements) =>
      facilitator.settle(paymentPayload, paymentRequirements),
    async getSupported() {
      try {
        const supported = await facilitator.getSupported();
        lastSupported = supported;
        return supported;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[x402] Facilitator capability discovery failed; using cached or pinned ${network} capability: ${detail}`,
        );
        return lastSupported ?? fallbackSupportedResponse(network);
      }
    },
  };
}
