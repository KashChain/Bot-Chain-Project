import { jsonOk, handle } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const response = jsonOk({ ok: true });
    clearSessionCookie(response);
    return response;
  });
}
