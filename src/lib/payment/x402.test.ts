import { describe, expect, it } from "vitest";

import { readPaymentConfig, resolvePaymentConfig } from "./config";

const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("readPaymentConfig", () => {
  it("keeps payment disabled until a receiving address is supplied", () => {
    expect(readPaymentConfig({})).toBeNull();
  });

  it("uses safe Base Sepolia defaults", () => {
    expect(readPaymentConfig({ X402_PAY_TO: ADDRESS })).toEqual({
      facilitatorUrl: "https://x402.org/facilitator",
      network: "eip155:84532",
      payTo: ADDRESS,
      price: "$1.00",
      mainnet: false,
    });
  });

  it("selects PayAI for Base mainnet", () => {
    expect(
      readPaymentConfig({
        X402_PAY_TO: ADDRESS,
        X402_NETWORK: "eip155:8453",
      }),
    ).toMatchObject({
      facilitatorUrl: "https://facilitator.payai.network",
      network: "eip155:8453",
      mainnet: true,
    });
  });

  it("normalizes custom facilitator URLs without a trailing slash", () => {
    expect(
      readPaymentConfig({
        X402_PAY_TO: ADDRESS,
        X402_FACILITATOR_URL: "https://facilitator.example/payments/",
      }),
    ).toMatchObject({
      facilitatorUrl: "https://facilitator.example/payments",
    });
  });

  it.each([
    [{ X402_PAY_TO: "not-an-address" }, "valid EVM address"],
    [
      { X402_PAY_TO: ADDRESS, X402_NETWORK: "solana:mainnet" },
      "Base mainnet or Base Sepolia",
    ],
    [
      { X402_PAY_TO: ADDRESS, X402_FACILITATOR_URL: "http://example.com" },
      "must use HTTPS",
    ],
    [
      {
        X402_PAY_TO: ADDRESS,
        X402_NETWORK: "eip155:8453",
        X402_FACILITATOR_URL: "https://x402.org/facilitator",
      },
      "testnet-only",
    ],
    [{ X402_PAY_TO: ADDRESS, X402_PRICE: "one dollar" }, "dollar amount"],
    [{ X402_PAY_TO: ADDRESS, X402_PRICE: "$0" }, "positive dollar amount"],
  ])("rejects invalid configuration %#", (env, message) => {
    expect(() => readPaymentConfig(env)).toThrow(message);
  });

  it("reports disabled and invalid configuration without throwing", () => {
    expect(resolvePaymentConfig({})).toEqual({ status: "disabled" });
    expect(resolvePaymentConfig({ X402_PAY_TO: "invalid" })).toEqual({
      status: "invalid",
      message: "X402_PAY_TO must be a valid EVM address.",
    });
  });

  it("reports malformed facilitator URLs as invalid configuration without throwing", () => {
    expect(
      resolvePaymentConfig({
        X402_PAY_TO: ADDRESS,
        X402_FACILITATOR_URL: "not a url",
      }),
    ).toEqual({
      status: "invalid",
      message: "Invalid URL",
    });
  });
});
