import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { getRepository } from "@/lib/repo";
import { toPublicAgent } from "@/lib/agents/public";
import { TaskRunner } from "@/components/TaskRunner";
import { OnchainAgentBadge } from "@/components/OnchainAgentBadge";
import { Badge } from "@/components/ui/feedback";
import { botChain } from "@/lib/chain";
import { shortAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgentDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const repo = getRepository();
  const agentRecord = await repo.getAgentBySlug(slug);
  if (!agentRecord) notFound();
  const agent = toPublicAgent(agentRecord);

  return (
    <div className="container py-12">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to explore
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <Badge tone="info">{agent.category}</Badge>
            <Badge tone={agent.active ? "success" : "warning"}>
              {agent.active ? "Available" : "Paused"}
            </Badge>
            <OnchainAgentBadge slug={agent.slug} />
          </div>
          <p className="mt-4 text-muted-foreground">{agent.description}</p>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Capabilities</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {agent.capabilities.map((capability) => (
                <li key={capability} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={16} className="text-accent" />
                  {capability}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Usage instructions</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {agent.usageInstructions}
            </p>
          </section>

          <section className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card/60 p-4">
              <p className="text-xs text-muted-foreground">Price per task</p>
              <p className="mt-1 text-xl font-semibold">
                {agent.priceFormatted}{" "}
                <span className="text-sm text-muted-foreground">
                  {agent.currency}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-4">
              <p className="text-xs text-muted-foreground">Network</p>
              <p className="mt-1 text-sm font-medium">
                {botChain.name} · {botChain.chainId}
              </p>
            </div>
          </section>

          <section className="mt-8 text-sm text-muted-foreground">
            <p>
              Owner:{" "}
              <span className="font-mono">
                {shortAddress(agent.ownerAddress, 6)}
              </span>
            </p>
            <p className="mt-1 break-all">
              Endpoint: <span className="font-mono">{agent.endpoint}</span>
            </p>
            <a
              href={botChain.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 hover:text-foreground"
            >
              View on BOT Chain explorer <ExternalLink size={12} />
            </a>
          </section>
        </div>

        <div>
          <TaskRunner agent={agent} />
        </div>
      </div>
    </div>
  );
}
