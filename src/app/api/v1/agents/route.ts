import { NextRequest } from "next/server";
import { jsonOk, handle, withRateLimitHeaders } from "@/lib/api";
import { authenticateApiKey, requireScope } from "@/lib/api-keys/auth";
import { getRepository } from "@/lib/repo";
import { toPublicAgent } from "@/lib/agents/public";
import { agentListQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const auth = await authenticateApiKey(request);
    requireScope(auth, "agents:read");
    const parsed = agentListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return jsonOk({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, 400);
    }
    const capabilities = parsed.data.capabilities
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const limit = parsed.data.limit ?? 60;
    const offset = parsed.data.offset ?? 0;
    const page = await getRepository().listAgentsPage({
      search: parsed.data.search,
      category: parsed.data.category,
      capabilities,
      sort: parsed.data.sort,
      activeOnly: true,
      limit,
      offset,
    });
    return withRateLimitHeaders(
      jsonOk({
        agents: page.agents.map(toPublicAgent),
        total: page.total,
        limit,
        offset,
      }),
      auth,
    );
  });
}
