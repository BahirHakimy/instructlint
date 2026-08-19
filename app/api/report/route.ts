import { NextResponse, type NextRequest } from "next/server";

import {
  auditPublicRepository,
  type AuditResult,
} from "@/src/lib/audit/service";
import {
  apiError,
  type ApiErrorBody,
  readRepositoryRequest,
  respondToApiError,
} from "@/src/lib/http/api";
import {
  resolvePaymentConfig,
} from "@/src/lib/payment/config";
import { protectPaidAudit } from "@/src/lib/payment/x402";

export const runtime = "nodejs";
export const maxDuration = 30;

const payment = resolvePaymentConfig();

async function createReport(
  request: NextRequest,
): Promise<NextResponse<AuditResult | ApiErrorBody>> {
  try {
    const repoUrl = await readRepositoryRequest(request);
    const report = await auditPublicRepository(repoUrl, "full");
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return respondToApiError(error);
  }
}

function unavailableReport() {
  if (payment.status === "invalid") {
    return apiError(
      503,
      "PAYMENT_CONFIGURATION_ERROR",
      "Paid reports are temporarily unavailable because payment configuration is invalid.",
      true,
    );
  }

  return apiError(
    503,
    "PAYMENT_NOT_CONFIGURED",
    "Paid reports are not activated yet.",
    true,
  );
}

export const POST =
  payment.status === "ready"
    ? protectPaidAudit(createReport, payment.config)
    : unavailableReport;
