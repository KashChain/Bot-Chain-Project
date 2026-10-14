import Link from "next/link";
import { ArrowRight, Coins, ShieldCheck, Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import type { PublicAgent } from "@/lib/agents/public";

export function AgentCard({ agent }: { agent: PublicAgent }) {
  const staked = agent.stakeStatus === "ACTIVE" && BigInt(agent.stakedWei) > 0n;
  return (
    <div className="card-glow flex flex-col rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-primary/30 to-accent/30">
            <Sparkles size={18} className="text-accent" />
          </span>
          <div>
            <h3 className="font-semibold leading-tight">{agent.name}</h3>
            <Badge tone="info" className="mt-1">
              {agent.category}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={agent.active ? "success" : "warning"}>
            {agent.active ? "Available" : "Paused"}
          </Badge>
          {agent.verified ? (
            <Badge tone="success">
              <ShieldCheck size={12} /> Verified
            </Badge>
          ) : null}
        </div>
      </div>

      <p className="mt-4 line-clamp-3 flex-1 text-sm text-muted-foreground">
        {agent.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.capabilities.slice(0, 3).map((capability) => (
          <span
            key={capability}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            {capability}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        {agent.ratingCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Star size={13} className="fill-amber-400 text-amber-400" />
            {agent.ratingAverage.toFixed(1)}
            <span>({agent.ratingCount})</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Star size={13} /> New
          </span>
        )}
        <span>{agent.completedTaskCount} completed</span>
        {staked ? (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Coins size={13} />
            {agent.stakedFormatted} staked
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Price per task</p>
          <p className="font-semibold">
            {agent.priceFormatted}{" "}
            <span className="text-xs text-muted-foreground">
              {agent.currency}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/agents/${agent.slug}`}>
            <Button variant="outline" size="sm">
              Details
            </Button>
          </Link>
          <Link href={`/agents/${agent.slug}#run`}>
            <Button size="sm">
              Start task <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
