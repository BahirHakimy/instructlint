import { NextResponse } from "next/server";

import { resolvePaymentConfig } from "@/src/lib/payment/config";

export const runtime = "nodejs";

export function GET() {
  const payment = resolvePaymentConfig();

  return NextResponse.json(
    {
      ok: true,
      service: "instructlint",
      payment:
        payment.status === "ready"
          ? {
              enabled: true,
              network: payment.config.network,
              price: payment.config.price,
              mainnet: payment.config.mainnet,
            }
          : { enabled: false, status: payment.status },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
