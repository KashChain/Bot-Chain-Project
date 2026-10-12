import { z } from "zod";
import { AppError } from "../errors";
import { runStructured, type LlmMode } from "./llm";

const researchSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(z.string().min(1)).min(1).max(10),
  caveats: z.array(z.string().min(1)).max(10),
});

export interface ResearchResult {
  kind: "research";
  question: string;
  summary: string;
  findings: string[];
  caveats: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This output is AI-generated and may be inaccurate or incomplete. It is not verified on-chain and should be independently checked against primary sources.";

export interface AgentRunResult<T> {
  result: T;
  mode: LlmMode;
  model: string | null;
}

export async function runResearch(
  question: string,
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
    system:
      "You are a careful research assistant. Produce concise, factual, well-structured output. Never fabricate citations, statistics, or quotes. If something is uncertain, say so explicitly in caveats.",
    prompt: `Research question:\n"""${trimmed}"""`,
    schemaHint: `{
  "summary": "one paragraph executive summary",
  "findings": ["key finding 1", "key finding 2"],
  "caveats": ["important limitation or open question"]
}`,
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
    }),
  });

  return {
    result: {
      kind: "research",
      question: trimmed,
      summary: data.summary,
      findings: data.findings,
      caveats: data.caveats,
      disclaimer: DISCLAIMER,
    },
    mode,
    model,
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
