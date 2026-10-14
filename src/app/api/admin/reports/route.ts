import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/api";
import { assertAdmin } from "@/lib/admin";
import { listReportQueue } from "@/lib/moderation/service";
import { REPORT_STATUSES, type ReportStatus } from "@/lib/escrow-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    assertAdmin(request);
    const statusParam = request.nextUrl.searchParams.get("status");
    let status: ReportStatus | undefined;
    if (statusParam && (REPORT_STATUSES as readonly string[]).includes(statusParam)) {
      status = statusParam as ReportStatus;
    }
    const reports = await listReportQueue(status);
    return jsonOk({ reports });
  });
}
