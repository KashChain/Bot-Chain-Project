import { NextRequest } from "next/server";
import { jsonOk, handle, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getRepository } from "@/lib/repo";
import { toPublicAgent } from "@/lib/agents/public";
import { createAgentSchema, agentListQuerySchema } from "@/lib/validation";
import { requireSessionIfEnforced } from "@/lib/auth/session";
import { assertSafeAgentEndpoint } from "@/lib/security/ssrf";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = agentListQuerySchema.safeParse(params);
    if (!parsed.success) {
      return jsonOk(
        { agents: [], total: 0, error: "Invalid query parameters" },
        400,
      );
    }
    const capabilities = parsed.data.capabilities
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const limit = parsed.data.limit ?? 60;
    const offset = parsed.data.offset ?? 0;

    const repo = getRepository();
    const page = await repo.listAgentsPage({
      search: parsed.data.search,
      category: parsed.data.category,
      capabilities,
      sort: parsed.data.sort,
      activeOnly: true,
      limit,
      offset,
    });
    return jsonOk({
      agents: page.agents.map(toPublicAgent),
      total: page.total,
      limit,
      offset,
      sort: parsed.data.sort ?? "newest",
    });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    checkRateLimit(rateLimitKey("agents:create", getClientIp(request)));
    const body = await request.json();
    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        422,
      );
    }

    const session = requireSessionIfEnforced(request);
    if (session && session.address !== parsed.data.ownerAddress.toLowerCase()) {
      return jsonOk(
        {
          error: "ownerAddress must match the signed-in wallet",
          code: "FORBIDDEN",
        },
        403,
      );
    }

    // Block SSRF targets (private IPs, cloud metadata, DNS rebinding) before
    // the endpoint is ever stored or called.
    await assertSafeAgentEndpoint(parsed.data.endpoint);

    const repo = getRepository();
    const agent = await repo.createAgent({
      ...parsed.data,
      metadataUri: parsed.data.metadataUri ?? null,
      webhookSecret: parsed.data.webhookSecret ?? null,
    });
    return jsonOk({ agent: toPublicAgent(agent) }, 201);
  });
}
