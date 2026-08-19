const BASE_MAINNET = "eip155:8453";
const BASE_SEPOLIA = "eip155:84532";
const DEFAULT_MAINNET_FACILITATOR = "https://facilitator.payai.network";
const DEFAULT_TESTNET_FACILITATOR = "https://x402.org/facilitator";
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type PaymentConfig = {
  facilitatorUrl: string;
  network: typeof BASE_MAINNET | typeof BASE_SEPOLIA;
  payTo: `0x${string}`;
  price: `$${string}`;
  mainnet: boolean;
};

type Environment = Record<string, string | undefined>;

export type PaymentConfigState =
  | { status: "disabled" }
  | { status: "invalid"; message: string }
  | { status: "ready"; config: PaymentConfig };

export function readPaymentConfig(
  env: Environment = process.env,
): PaymentConfig | null {
  const payTo = env.X402_PAY_TO?.trim();
  if (!payTo) {
    return null;
  }

  if (!EVM_ADDRESS.test(payTo)) {
    throw new Error("X402_PAY_TO must be a valid EVM address.");
  }

  const network = env.X402_NETWORK?.trim() || BASE_SEPOLIA;
  if (network !== BASE_MAINNET && network !== BASE_SEPOLIA) {
    throw new Error("X402_NETWORK must be Base mainnet or Base Sepolia.");
  }

  const mainnet = network === BASE_MAINNET;
  const facilitatorUrl =
    env.X402_FACILITATOR_URL?.trim() ||
    (mainnet ? DEFAULT_MAINNET_FACILITATOR : DEFAULT_TESTNET_FACILITATOR);
  const parsedFacilitator = new URL(facilitatorUrl);

  if (parsedFacilitator.protocol !== "https:") {
    throw new Error("X402_FACILITATOR_URL must use HTTPS.");
  }
  if (mainnet && parsedFacilitator.hostname === "x402.org") {
    throw new Error("The public x402.org facilitator is testnet-only.");
  }

  const price = env.X402_PRICE?.trim() || "$1.00";
  if (!/^\$(?:0*[1-9]\d*)(?:\.\d{1,2})?$/.test(price)) {
    throw new Error("X402_PRICE must be a positive dollar amount such as $1.00.");
  }

  return {
    facilitatorUrl: parsedFacilitator.toString().replace(/\/$/, ""),
    network,
    payTo: payTo as `0x${string}`,
    price: price as `$${string}`,
    mainnet,
  };
}

export function resolvePaymentConfig(
  env: Environment = process.env,
): PaymentConfigState {
  try {
    const config = readPaymentConfig(env);
    return config ? { status: "ready", config } : { status: "disabled" };
  } catch (error) {
    return {
      status: "invalid",
      message:
        error instanceof Error ? error.message : "Payment configuration is invalid.",
    };
  }
}
