import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/feedback";

interface WrappedResult {
  mode?: string;
  model?: string | null;
  output?: {
    kind?: string;
    disclaimer?: string;
    summary?: string;
    findings?: string[];
    caveats?: string[];
    verifiedFacts?: string[];
    interpretation?: string;
    limitations?: string[];
    onchain?: { chainId?: number; fetchedAt?: string; rpc?: string; data?: unknown };
    target?: { type?: string; value?: string };
  };
}

export function ResultView({ result }: { result: unknown }) {
  const wrapped = result as WrappedResult | null;
  const output = wrapped?.output;

  if (!wrapped || !output) {
    return (
      <pre className="overflow-auto rounded-md border border-border bg-background/60 p-4 text-xs">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={wrapped.mode === "live" ? "success" : "warning"}>
          {wrapped.mode === "live"
            ? "Live LLM"
            : wrapped.mode === "demo"
              ? "Demo mode (not real AI)"
              : wrapped.mode === "webhook"
                ? "External agent"
                : "Unknown mode"}
        </Badge>
        {wrapped.model ? (
          <Badge tone="info">
            {String(wrapped.model)}
          </Badge>
        ) : null}
      </div>

      {output.kind === "research" ? (
        <div className="space-y-5">
          <Section title="Summary">
            <p className="text-sm text-muted-foreground">{output.summary}</p>
          </Section>
          <Section title="Key findings">
            <ul className="space-y-2">
              {(output.findings ?? []).map((finding) => (
                <li key={finding} className="flex gap-2 text-sm">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Caveats">
            <ul className="space-y-2">
              {(output.caveats ?? []).map((caveat) => (
                <li key={caveat} className="flex gap-2 text-sm text-muted-foreground">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />
                  <span>{caveat}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : null}

      {output.kind === "blockchain" ? (
        <div className="space-y-5">
          <Section title="Verified on-chain facts">
            <ul className="space-y-2">
              {(output.verifiedFacts ?? []).map((fact) => (
                <li key={fact} className="flex gap-2 text-sm">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Interpretation (AI-generated)">
            <p className="text-sm text-muted-foreground">
              {output.interpretation}
            </p>
          </Section>
          <Section title="Limitations">
            <ul className="space-y-2">
              {(output.limitations ?? []).map((limitation) => (
                <li key={limitation} className="flex gap-2 text-sm text-muted-foreground">
                  <Info size={16} className="mt-0.5 shrink-0 text-sky-400" />
                  <span>{limitation}</span>
                </li>
              ))}
            </ul>
          </Section>
          <details className="rounded-md border border-border bg-background/60 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Raw on-chain data
            </summary>
            <pre className="mt-3 overflow-auto text-xs">
              {JSON.stringify(output.onchain?.data ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}

      {output.kind !== "research" && output.kind !== "blockchain" ? (
        <pre className="overflow-auto rounded-md border border-border bg-background/60 p-4 text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      ) : null}

      {output.disclaimer ? (
        <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
          {output.disclaimer}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}
