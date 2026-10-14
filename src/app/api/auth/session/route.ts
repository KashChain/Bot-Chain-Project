import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = getSession(request);
    return jsonOk({ address: session?.address ?? null });
  });
}
