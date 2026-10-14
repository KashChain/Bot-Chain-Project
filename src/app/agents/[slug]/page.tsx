import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Coins, ExternalLink, ShieldCheck, Star } from "lucide-react";
import { getRepository } from "@/lib/repo";
import { toPublicAgent } from "@/lib/agents/public";
import { TaskRunner } from "@/components/TaskRunner";
import { ReviewForm } from "@/components/ReviewForm";
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
  const reviews = await repo.listReviewsByAgent(agentRecord.id);

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
            {agent.verified ? (
              <Badge tone="success">
                <ShieldCheck size={12} /> Verified
              </Badge>
            ) : null}
            {agent.stakeStatus === "ACTIVE" && BigInt(agent.stakedWei) > 0n ? (
              <Badge tone="info">
                <Coins size={12} /> {agent.stakedFormatted} staked
              </Badge>
            ) : null}
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

          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Reviews</h2>
              {agent.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  {agent.ratingAverage.toFixed(1)} · {agent.ratingCount} review
                  {agent.ratingCount === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No reviews yet</span>
              )}
            </div>

            <div className="mt-4">
              <ReviewForm agentSlug={agent.slug} />
            </div>

            {reviews.length > 0 ? (
              <ul className="mt-6 space-y-4">
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-lg border border-border bg-card/60 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5">
                        {[0, 1, 2, 3, 4].map((index) => (
                          <Star
                            key={index}
                            size={13}
                            className={
                              index < review.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground"
                            }
                          />
                        ))}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {shortAddress(review.reviewerAddress, 4)}
                      </span>
                    </div>
                    {review.comment ? (
                      <p className="mt-2 text-sm">{review.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
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
