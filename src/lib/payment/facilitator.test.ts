import type { FacilitatorClient } from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";

import { withSupportedFallback } from "./facilitator";

const NETWORK = "eip155:8453";

function createFacilitator(
  getSupported: FacilitatorClient["getSupported"],
): FacilitatorClient {
  return {
    getSupported,
    verify: vi.fn(),
    settle: vi.fn(),
  };
}

describe("withSupportedFallback", () => {
  it("pins the configured exact capability when discovery is unavailable", async () => {
    const facilitator = createFacilitator(
      vi.fn().mockRejectedValue(new Error("temporary timeout")),
    );

    await expect(
      withSupportedFallback(facilitator, NETWORK).getSupported(),
    ).resolves.toEqual({
      kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
      extensions: ["bazaar"],
      signers: {},
    });
  });

  it("reuses the last live capability response after a later failure", async () => {
    const supported: SupportedResponse = {
      kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
      extensions: ["bazaar", "example"],
      signers: { "eip155:*": ["0x1111111111111111111111111111111111111111"] },
    };
    const facilitator = createFacilitator(
      vi
        .fn()
        .mockResolvedValueOnce(supported)
        .mockRejectedValueOnce(new Error("temporary timeout")),
    );
    const resilient = withSupportedFallback(facilitator, NETWORK);

    await expect(resilient.getSupported()).resolves.toBe(supported);
    await expect(resilient.getSupported()).resolves.toBe(supported);
  });

  it("delegates verification and settlement to the real facilitator", async () => {
    const verifyResult = { isValid: true, payer: "0xabc" } satisfies VerifyResponse;
    const settleResult = {
      success: true,
      payer: "0xabc",
      transaction: "0xdef",
      network: NETWORK,
    } satisfies SettleResponse;
    const facilitator = createFacilitator(vi.fn());
    facilitator.verify = vi.fn().mockResolvedValue(verifyResult);
    facilitator.settle = vi.fn().mockResolvedValue(settleResult);
    const resilient = withSupportedFallback(facilitator, NETWORK);
    const paymentPayload = {} as PaymentPayload;
    const paymentRequirements = {} as PaymentRequirements;

    await expect(
      resilient.verify(paymentPayload, paymentRequirements),
    ).resolves.toBe(verifyResult);
    await expect(
      resilient.settle(paymentPayload, paymentRequirements),
    ).resolves.toBe(settleResult);
    expect(facilitator.verify).toHaveBeenCalledWith(
      paymentPayload,
      paymentRequirements,
    );
    expect(facilitator.settle).toHaveBeenCalledWith(
      paymentPayload,
      paymentRequirements,
    );
  });
});
