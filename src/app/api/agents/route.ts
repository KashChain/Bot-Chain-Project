import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk, handle, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getRepository } from "@/lib/repo";
import { toPublicAgent } from "@/lib/agents/public";
import { createAgentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  search: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  sort: z.enum(["name", "price-asc", "price-desc", "newest"]).optional(),
});

export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return jsonOk({ agents: [], error: "Invalid query parameters" }, 400);
    }
    const repo = getRepository();
    const agents = await repo.listAgents({
      search: parsed.data.search,
      category: parsed.data.category,
      sort: parsed.data.sort,
      activeOnly: true,
    });
    return jsonOk({ agents: agents.map(toPublicAgent) });
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
    const repo = getRepository();
    const agent = await repo.createAgent({
      ...parsed.data,
      metadataUri: parsed.data.metadataUri ?? null,
    });
    return jsonOk({ agent: toPublicAgent(agent) }, 201);
  });
}
