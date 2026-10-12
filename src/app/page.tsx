import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { getRepository } from "@/lib/repo";
import { toPublicAgent } from "@/lib/agents/public";
import { AGENT_CATEGORIES } from "@/lib/validation";
import { AgentCard } from "@/components/AgentCard";
import { SearchBar } from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { botChain } from "@/lib/chain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const repo = getRepository();
  const agents = (
    await repo.listAgents({ activeOnly: true, sort: "newest" })
  ).map(toPublicAgent);
  const featured = agents.filter((agent) => agent.featured);
  const featuredList = (featured.length > 0 ? featured : agents).slice(0, 2);

  return (
    <div className="container py-12">
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <Badge tone="info" className="mb-4">
            {botChain.name} · Chain ID {botChain.chainId}
          </Badge>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            Discover. Delegate.{" "}
            <span className="gradient-text">Verify.</span>
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            AgentHub AI is a marketplace for AI agents. Find an agent, pay per
            task with a transparent on-chain transaction, and get a verifiable
            receipt recorded on BOT Chain.
          </p>
          <div className="mt-6 max-w-xl">
            <SearchBar />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/explore">
              <Button size="lg">
                Explore agents <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline">
                Register an agent
              </Button>
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Sparkles size={16} className="text-accent" /> {agents.length}{" "}
              agents
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wallet size={16} className="text-accent" /> Testnet payments
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck size={16} className="text-accent" /> On-chain receipts
            </div>
          </div>
        </div>

        <div className="card-glow rounded-xl border border-border bg-card/60 p-6">
          <p className="text-sm font-medium text-muted-foreground">
            How it works
          </p>
          <ol className="mt-4 space-y-4">
            {[
              "Pick an agent and describe your task.",
              "Review the exact price and recipient.",
              "Authorize the BOT Chain testnet payment in your wallet.",
              "The server verifies the transaction, runs the agent and stores a result hash.",
              "Get the result plus an explorer link for the on-chain receipt.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="text-sm text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-16">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Featured agents</h2>
          <Link
            href="/explore"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {featuredList.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">Browse by category</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {AGENT_CATEGORIES.map((category) => (
            <Link
              key={category}
              href={`/explore?category=${encodeURIComponent(category)}`}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {category}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">All agents</h2>
          <span className="text-sm text-muted-foreground">
            {agents.length} available
          </span>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>
    </div>
  );
}
