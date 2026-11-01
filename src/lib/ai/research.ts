import { z } from "zod";
import { AppError } from "../errors";
import { runStructured, type LlmMode } from "./llm";

const rawSourceSchema = z.union([
  z.object({
    title: z.string().min(1).optional(),
    url: z.string().url().optional(),
  }),
  z.string().min(1).transform((title) => ({ title })),
]);

const researchSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(z.string().min(1)).min(1).max(10),
  caveats: z.array(z.string().min(1)).max(10),
  sources: z.array(rawSourceSchema).max(10).optional(),
});

export interface ResearchSource {
  title: string | null;
  url: string | null;
}

export interface ResearchResult {
  kind: "research";
  question: string;
  summary: string;
  findings: string[];
  caveats: string[];
  sources: ResearchSource[];
  disclaimer: string;
}

const DISCLAIMER =
  "This output is AI-generated and may be inaccurate or incomplete. It is not verified on-chain and should be independently checked against primary sources.";

const BASE_SYSTEM_PROMPT =
  "You are a careful research assistant. Produce concise, factual, well-structured output. Never fabricate citations, statistics, quotes, or URLs. If something is uncertain, say so explicitly in caveats. Only list a source when you are confident it is real; otherwise return an empty sources list.";

export interface AgentRunResult<T> {
  result: T;
  mode: LlmMode;
  model: string | null;
}

export interface ResearchOptions {
  /** Agent-specific guidance prepended to the base research system prompt. */
  system?: string;
}

export async function runResearch(
  question: string,
  options: ResearchOptions = {},
): Promise<AgentRunResult<ResearchResult>> {
  const trimmed = question.trim();
  if (trimmed.length < 5) {
    throw new AppError(
      "Research question is too short. Please provide more detail.",
      400,
      "INPUT_TOO_SHORT",
    );
  }

  const { data, mode, model } = await runStructured({
    system: options.system
      ? `${options.system}\n\n${BASE_SYSTEM_PROMPT}`
      : BASE_SYSTEM_PROMPT,
    prompt: `Research question:\n"""${trimmed}"""`,
    schemaHint: `{
  "summary": "one paragraph executive summary",
  "findings": ["key finding 1", "key finding 2"],
  "caveats": ["important limitation or open question"],
  "sources": [{ "title": "source title", "url": "https://..." }]
}
Include sources only when they are real and relevant; otherwise return "sources": [].`,
    parse: (raw) => researchSchema.parse(raw),
    demo: () => ({
      summary: `[DEMO MODE] The research question "${truncate(
        trimmed,
        120,
      )}" would be answered with a structured summary by the configured LLM provider. This demo response is generated locally and is NOT real AI output.`,
      findings: [
        "[DEMO] Configure LLM_API_KEY on the server to get real findings.",
        "[DEMO] Findings are returned as a short list of key points.",
        "[DEMO] Each finding is independent and citation-free unless the model provides sources.",
      ],
      caveats: [
        "[DEMO] This is a labelled local placeholder, not an AI result.",
        "Real answers depend on the configured model and may contain errors.",
        "Always verify important claims against primary sources.",
      ],
      sources: [],
    }),
  });

  const sources: ResearchSource[] = (data.sources ?? [])
    .map((source) => ({
      title: source.title ?? null,
      url: "url" in source ? source.url ?? null : null,
    }))
    .filter((source) => source.title || source.url);

  return {
    result: {
      kind: "research",
      question: trimmed,
      summary: data.summary,
      findings: data.findings,
      caveats: data.caveats,
      sources,
      disclaimer: DISCLAIMER,
    },
    mode,
    model,
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
