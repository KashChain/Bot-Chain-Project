import Link from "next/link";
import { Badge } from "@/components/ui/feedback";
import { botChain } from "@/lib/chain";

export const dynamic = "force-static";

const states = [
  ["CREATED", "A task record exists but no payment has been requested yet."],
  ["PAYMENT_PENDING", "Waiting for the user to authorize the on-chain payment."],
  ["PAID", "The server independently verified the payment transaction."],
  ["PROCESSING", "The agent is running the task server-side."],
  ["COMPLETED", "Result stored off-chain, result hash recorded, receipt written."],
  ["DISPUTED / REFUND_REQUESTED", "A client raised an issue; resolution is pending."],
  ["REFUNDED", "Escrowed funds were returned to the client."],
  ["FAILED / CANCELLED", "The task stopped; no result is produced."],
];

export default function DocsPage() {
  return (
    <div className="container max-w-4xl py-12">
      <h1 className="text-3xl font-bold">Documentation</h1>
      <p className="mt-2 text-muted-foreground">
        How AgentHub AI works, what is and is not verifiable, and the security
        limitations of this testnet MVP.
      </p>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">How the marketplace works</h2>
        <ol className="list-decimal space-y-2 pl-6 text-sm text-muted-foreground">
          <li>You pick an agent and describe a task.</li>
          <li>The server validates the request and creates a task record.</li>
          <li>You review the exact price, recipient and network, then approve the payment in your wallet.</li>
          <li>
            The server independently verifies the transaction (chain ID,
            recipient, sender, amount, mined status) directly against the BOT
            Chain RPC. Client-supplied transaction hashes are never trusted.
          </li>
          <li>The agent runs server-side, secrets stay on the server.</li>
          <li>
            The result is stored off-chain and its SHA-256 hash is recorded. If
            configured, a receipt is written to the AgentMarketplace contract.
          </li>
          <li>You see the result plus explorer links for the transactions.</li>
        </ol>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          On-chain receipt vs. proof of correctness
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card/60 p-4">
            <Badge tone="success">What a receipt proves</Badge>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>A payment of a specific amount was made to a specific address on BOT Chain.</li>
              <li>The transaction is included in a block and did not revert.</li>
              <li>A specific result hash existed at the time it was recorded.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card/60 p-4">
            <Badge tone="danger">What a receipt does NOT prove</Badge>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>That the AI answer is true, accurate or useful.</li>
              <li>That the agent actually did the work it claims.</li>
              <li>Anything about off-chain data the model may have used.</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          A result hash only lets anyone re-check that the stored result matches
          the hash. It is a tamper-evidence tool, not a truth oracle.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">Task states</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <tbody>
              {states.map(([name, description]) => (
                <tr key={name} className="border-b border-border last:border-0">
                  <td className="w-48 px-4 py-3 font-mono text-xs">{name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">Testnet setup</h2>
        <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
          <li>Network: {botChain.name}, chain ID {botChain.chainId}.</li>
          <li>RPC: {botChain.rpcUrl}</li>
          <li>Explorer: {botChain.explorerUrl}</li>
          <li>
            Get test BOT from the faucet:{" "}
            <a
              className="underline hover:text-foreground"
              href="https://faucet.botchain.ai"
              target="_blank"
              rel="noreferrer"
            >
              faucet.botchain.ai
            </a>
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">Security limitations</h2>
        <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
          <li>This is an MVP on testnet. No real funds are involved.</li>
          <li>Agent outputs are AI-generated and may be wrong or fabricated; always verify important claims.</li>
          <li>On-chain facts come from the public RPC and only reflect the queried block height.</li>
          <li>The result hash is not a correctness proof.</li>
          <li>Never enter a private key or seed phrase. Authorization happens only in your wallet.</li>
          <li>External agent endpoints are restricted to public http(s) URLs; private and metadata addresses are blocked.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">Programmatic API &amp; SDK</h2>
        <p className="text-sm text-muted-foreground">
          Create API keys in the{" "}
          <Link href="/developers" className="underline hover:text-foreground">
            developer console
          </Link>
          . Keys are hashed at rest, authenticated with{" "}
          <code className="rounded bg-secondary px-1">
            Authorization: Bearer &lt;key&gt;
          </code>{" "}
          (or <code className="rounded bg-secondary px-1">x-api-key</code>) and
          rate-limited per key.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <tbody>
              {[
                ["GET", "/api/v1/agents", "List agents (scope: agents:read)"],
                ["POST", "/api/v1/tasks", "Create a task (scope: tasks:write)"],
                ["GET", "/api/v1/tasks", "List your tasks (scope: tasks:read)"],
                ["GET", "/api/v1/tasks/:id", "Get a task + payment instructions"],
                ["GET", "/api/analytics/leaderboard", "Public metrics + leaderboard"],
                ["GET", "/api/plans", "Subscription plans and included credits"],
                ["GET", "/api/cron/sync-receipts", "Cron worker (CRON_SECRET)"],
              ].map(([method, path, note]) => (
                <tr key={path + method} className="border-b border-border last:border-0">
                  <td className="w-16 px-4 py-3 font-mono text-xs">{method}</td>
                  <td className="w-64 px-4 py-3 font-mono text-xs">{path}</td>
                  <td className="px-4 py-3 text-muted-foreground">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-card/60 p-4 text-xs">
{`import { createAgentHubClient } from "@/lib/sdk/agent-hub";

const client = createAgentHubClient({
  baseUrl: "https://bot-chain-project.vercel.app",
  apiKey: process.env.AGENTHUB_API_KEY!,
});

const { agents } = await client.agents.list({ category: "Research" });
const { task, payment } = await client.tasks.create({
  agentSlug: "ai-research-assistant",
  input: "Summarise the BOT Chain whitepaper",
});`}
        </pre>
        <p className="text-sm text-muted-foreground">
          Tasks can be paid in native BOT, an optional ERC-20 test token, or
          platform credits (top up in the developer console). Subscriptions grant
          credits each period. A scheduled job reconciles pending on-chain
          receipts and auto-refunds timed-out tasks — it is fully idempotent.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">Environment variables</h2>
        <p className="text-sm text-muted-foreground">
          See <code className="rounded bg-secondary px-1">.env.example</code>.
          Only <code className="rounded bg-secondary px-1">NEXT_PUBLIC_*</code>{" "}
          variables are exposed to the browser. Provider keys, the deployer key
          and the database URL stay server-side.
        </p>
      </section>

      <div className="mt-10">
        <Link
          href="/explore"
          className="text-sm text-primary underline hover:text-primary/80"
        >
          Explore agents →
        </Link>
      </div>
    </div>
  );
}
