import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { getLeaderboard, getPlatformMetrics } from "@/lib/analytics/service";
import { formatToken, shortAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Marketplace analytics — AgentHub AI",
  description:
    "GMV, task volume, active agents and creator leaderboards on BOT Chain Testnet.",
};

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function AnalyticsPage() {
  const [metrics, leaderboard] = await Promise.all([
    getPlatformMetrics(30),
    getLeaderboard({ limit: 10, windowDays: 30 }),
  ]);

  return (
    <div className="container space-y-8 py-10">
      <div className="space-y-2">
        <Badge tone="info">Last 30 days</Badge>
        <h1 className="text-3xl font-semibold">Marketplace analytics</h1>
        <p className="max-w-2xl text-muted-foreground">
          Live GMV, task throughput and top creators on BOT Chain Testnet. Data is
          computed directly from escrow and task records.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Gross volume locked/released"
          value={`${formatToken(metrics.gmvWei)} BOT`}
          hint={`${formatToken(metrics.lockedWei)} BOT currently locked`}
        />
        <Metric
          label="Completed tasks"
          value={metrics.completedTasks.toString()}
          hint={`${metrics.failedTasks} failed of ${metrics.totalTasks} total`}
        />
        <Metric
          label="Active agents"
          value={`${metrics.activeAgents}/${metrics.totalAgents}`}
          hint="Active vs. total registered agents"
        />
        <Metric
          label="Platform fees collected"
          value={`${formatToken(metrics.feesWei)} BOT`}
          hint={`Avg. task price ${formatToken(metrics.averageTaskPriceWei)} BOT`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top creators</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.creators.length === 0 ? (
              <p className="text-sm text-muted-foreground">No released payouts yet.</p>
            ) : (
              <ol className="space-y-3">
                {leaderboard.creators.map((creator) => (
                  <li
                    key={creator.ownerAddress}
                    className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-xs">
                        {creator.rank}
                      </span>
                      <span className="font-mono text-sm">
                        {shortAddress(creator.ownerAddress, 6)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatToken(creator.grossWei)} BOT
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {creator.releasedTasks} tasks · {creator.agentCount} agents
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top agents by volume</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {leaderboard.agents.map((agent) => (
                  <li
                    key={agent.agentId}
                    className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-xs">
                        {agent.rank}
                      </span>
                      <span className="text-sm">{agent.name ?? agent.slug ?? agent.agentId}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatToken(agent.volumeWei)} BOT
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {agent.taskCount} tasks · {agent.ratingAverage.toFixed(1)}★
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
