import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { ConfigurationError, UnauthorizedError } from "@/lib/errors";
import { getServerConfig } from "@/lib/config";
import { runReceiptSync } from "@/lib/cron/sync";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = getServerConfig().CRON_SECRET;
  if (!secret) {
    throw new ConfigurationError(
      "CRON_SECRET is not configured; scheduled jobs are disabled.",
    );
  }
  const header = request.headers.get("authorization");
  const bearer = header?.replace(/^Bearer\s+/i, "").trim();
  const provided = bearer ?? request.nextUrl.searchParams.get("secret") ?? "";
  if (provided !== secret) {
    throw new UnauthorizedError("Invalid cron credentials");
  }
  return true;
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    authorized(request);
    // Dedupe overlapping scheduler retries within the same minute.
    const dedupeKey = `sync-receipts:${new Date().toISOString().slice(0, 16)}`;
    const result = await runReceiptSync({ dedupeKey });
    return jsonOk(result);
  });
}

export const POST = GET;
