import { withX402FromHTTPServer } from "@x402/next";
import type { NextRequest, NextResponse } from "next/server";

import type { PaymentConfig } from "./config";
import { createPaidAuditHttpServer } from "./server";

export function protectPaidAudit<T>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  config: PaymentConfig,
): (request: NextRequest) => Promise<NextResponse<T>> {
  return withX402FromHTTPServer(handler, createPaidAuditHttpServer(config));
}

export type { PaymentConfig } from "./config";
