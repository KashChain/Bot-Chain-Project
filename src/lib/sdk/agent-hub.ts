/**
 * AgentHub AI Builder SDK
 *
 * A tiny, dependency-free client for the programmatic API. Works in Node 18+,
 * edge runtimes and the browser (anywhere `fetch` exists). All requests are
 * authenticated with an API key and subject to per-key rate limits.
 *
 * @example
 * const client = createAgentHubClient({
 *   baseUrl: "https://bot-chain-project.vercel.app",
 *   apiKey: process.env.AGENTHUB_API_KEY!,
 * });
 * const { agents } = await client.agents.list({ category: "Research" });
 */

export interface AgentHubClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
}

export interface AgentHubAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  endpoint: string;
  priceWei: string;
  ownerAddress: string;
  active: boolean;
  status?: string;
  verified?: boolean | null;
  ratingAverage?: number;
  ratingCount?: number;
  completedTaskCount?: number;
  [key: string]: unknown;
}

export interface AgentHubTask {
  id: string;
  agentSlug: string;
  agentName?: string;
  clientAddress: string;
  inputPreview: string;
  status: string;
  priceWei: string;
  currency: string;
  paymentTxHash: string | null;
  resultHash: string | null;
  [key: string]: unknown;
}

export interface AgentHubPaymentInstructions {
  currency: string;
  amountWei: string;
  amountFormatted: string;
  recipient: string | null;
  chainId: number;
  explorerUrl: string;
  mode: "mock" | "onchain";
}

export interface AgentListParams {
  search?: string;
  category?: string;
  capabilities?: string[];
  sort?: "name" | "price-asc" | "price-desc" | "newest" | "rating" | "popularity";
  limit?: number;
  offset?: number;
}

export class AgentHubError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = "AgentHubError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface AgentHubClient {
  agents: {
    list(params?: AgentListParams): Promise<{ agents: AgentHubAgent[]; total: number }>;
    get(slug: string): Promise<AgentHubAgent>;
  };
  tasks: {
    create(input: {
      agentSlug: string;
      input: string;
      notifyEmail?: string;
    }): Promise<{ task: AgentHubTask; payment: AgentHubPaymentInstructions }>;
    list(params?: { status?: string; limit?: number }): Promise<{
      tasks: AgentHubTask[];
      total: number;
    }>;
    get(id: string): Promise<{
      task: AgentHubTask;
      payment: AgentHubPaymentInstructions;
    }>;
  };
}

function buildQuery(params?: object): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function createAgentHubClient(
  options: AgentHubClientOptions,
): AgentHubClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new AgentHubError(0, "NO_FETCH", "No fetch implementation available", null);
  }

  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await doFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "x-api-key": options.apiKey,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new AgentHubError(
        response.status,
        typeof payload.code === "string" ? payload.code : "REQUEST_FAILED",
        typeof payload.error === "string" ? payload.error : response.statusText,
        payload,
      );
    }
    return payload as T;
  }

  return {
    agents: {
      async list(params) {
        return request("GET", `/api/v1/agents${buildQuery(params)}`);
      },
      async get(slug) {
        const data = await request<{ agents: AgentHubAgent[] }>(
          "GET",
          `/api/v1/agents${buildQuery({ search: slug, limit: 100 })}`,
        );
        const match = data.agents.find((agent) => agent.slug === slug);
        if (!match) {
          throw new AgentHubError(404, "NOT_FOUND", `Agent '${slug}' not found`, data);
        }
        return match;
      },
    },
    tasks: {
      async create(input) {
        return request("POST", "/api/v1/tasks", input);
      },
      async list(params) {
        return request("GET", `/api/v1/tasks${buildQuery(params)}`);
      },
      async get(id) {
        return request("GET", `/api/v1/tasks/${encodeURIComponent(id)}`);
      },
    },
  };
}
