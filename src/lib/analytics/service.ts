import { getRepository } from "../repo";
import type { EscrowRecord, TaskRecord } from "../repo/types";

export interface PlatformMetrics {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  gmvWei: string;
  releasedWei: string;
  feesWei: string;
  lockedWei: string;
  averageTaskPriceWei: string;
  generatedAt: string;
}

export interface CreatorLeaderboardEntry {
  rank: number;
  ownerAddress: string;
  grossWei: string;
  netWei: string;
  feesWei: string;
  releasedTasks: number;
  agentCount: number;
}

export interface AgentLeaderboardEntry {
  rank: number;
  agentId: string;
  slug: string | null;
  name: string | null;
  volumeWei: string;
  taskCount: number;
  ratingAverage: number;
  ratingCount: number;
}

export interface Leaderboard {
  windowDays: number;
  creators: CreatorLeaderboardEntry[];
  agents: AgentLeaderboardEntry[];
  generatedAt: string;
}

function bigSum(values: string[]): bigint {
  return values.reduce((sum, value) => sum + BigInt(value || "0"), 0n);
}

function averageWei(values: string[]): string {
  if (values.length === 0) return "0";
  return (bigSum(values) / BigInt(values.length)).toString();
}

export async function getPlatformMetrics(
  windowDays?: number,
): Promise<PlatformMetrics> {
  const repo = getRepository();
  const since = windowDays
    ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    : undefined;

  const [agents, tasks, escrows] = await Promise.all([
    repo.listAgents({ activeOnly: false, limit: 1000 }),
    repo.listTasks({ since, limit: 5000 }),
    repo.listEscrows({ since, limit: 5000 }),
  ]);

  const released = escrows.filter((escrow) => escrow.status === "RELEASED");
  const locked = escrows.filter((escrow) => escrow.status === "LOCKED");
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED");

  return {
    totalAgents: agents.length,
    activeAgents: agents.filter((agent) => agent.active).length,
    totalTasks: tasks.length,
    completedTasks: completedTasks.length,
    failedTasks: tasks.filter((task) => task.status === "FAILED").length,
    gmvWei: bigSum(escrows.map((escrow) => escrow.amountWei)).toString(),
    releasedWei: bigSum(released.map((escrow) => escrow.netWei)).toString(),
    feesWei: bigSum(released.map((escrow) => escrow.feeWei)).toString(),
    lockedWei: bigSum(locked.map((escrow) => escrow.amountWei)).toString(),
    averageTaskPriceWei: averageWei(
      completedTasks.map((task: TaskRecord) => task.priceWei),
    ),
    generatedAt: new Date().toISOString(),
  };
}

interface CreatorAccumulator {
  ownerAddress: string;
  grossWei: bigint;
  netWei: bigint;
  feesWei: bigint;
  releasedTasks: number;
  agentIds: Set<string>;
}

function accumulateCreators(escrows: EscrowRecord[]): CreatorLeaderboardEntry[] {
  const map = new Map<string, CreatorAccumulator>();
  for (const escrow of escrows) {
    if (escrow.status !== "RELEASED") continue;
    const key = escrow.ownerAddress.toLowerCase();
    const acc =
      map.get(key) ??
      {
        ownerAddress: escrow.ownerAddress,
        grossWei: 0n,
        netWei: 0n,
        feesWei: 0n,
        releasedTasks: 0,
        agentIds: new Set<string>(),
      };
    acc.grossWei += BigInt(escrow.amountWei);
    acc.netWei += BigInt(escrow.netWei);
    acc.feesWei += BigInt(escrow.feeWei);
    acc.releasedTasks += 1;
    acc.agentIds.add(escrow.agentId);
    map.set(key, acc);
  }
  return [...map.values()]
    .sort((a, b) => (b.grossWei > a.grossWei ? 1 : b.grossWei < a.grossWei ? -1 : 0))
    .map((acc, index) => ({
      rank: index + 1,
      ownerAddress: acc.ownerAddress,
      grossWei: acc.grossWei.toString(),
      netWei: acc.netWei.toString(),
      feesWei: acc.feesWei.toString(),
      releasedTasks: acc.releasedTasks,
      agentCount: acc.agentIds.size,
    }));
}

export async function getLeaderboard(input?: {
  limit?: number;
  windowDays?: number;
}): Promise<Leaderboard> {
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 50);
  const windowDays = input?.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const repo = getRepository();
  const [escrows, agents] = await Promise.all([
    repo.listEscrows({ since, limit: 5000 }),
    repo.listAgents({ activeOnly: false, limit: 1000 }),
  ]);

  const creators = accumulateCreators(escrows).slice(0, limit);

  const agentMeta = new Map(
    agents.map((agent) => [agent.id, agent] as const),
  );
  const agentVolume = new Map<string, { volumeWei: bigint; taskCount: number }>();
  for (const escrow of escrows) {
    const current = agentVolume.get(escrow.agentId) ?? {
      volumeWei: 0n,
      taskCount: 0,
    };
    current.volumeWei += BigInt(escrow.amountWei);
    current.taskCount += 1;
    agentVolume.set(escrow.agentId, current);
  }

  const agentEntries = [...agentVolume.entries()]
    .sort((a, b) =>
      b[1].volumeWei > a[1].volumeWei ? 1 : b[1].volumeWei < a[1].volumeWei ? -1 : 0,
    )
    .slice(0, limit)
    .map(([agentId, stats], index) => {
      const meta = agentMeta.get(agentId);
      return {
        rank: index + 1,
        agentId,
        slug: meta?.slug ?? null,
        name: meta?.name ?? null,
        volumeWei: stats.volumeWei.toString(),
        taskCount: stats.taskCount,
        ratingAverage: meta?.ratingAverage ?? 0,
        ratingCount: meta?.ratingCount ?? 0,
      };
    });

  return {
    windowDays,
    creators,
    agents: agentEntries,
    generatedAt: new Date().toISOString(),
  };
}
