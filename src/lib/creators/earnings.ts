import { getRepository } from "../repo";

export interface AgentEarnings {
  agentId: string;
  agentSlug: string;
  agentName: string;
  completedTasks: number;
  grossWei: string;
  feeWei: string;
  netWei: string;
}

export interface CreatorEarnings {
  ownerAddress: string;
  grossWei: string;
  feeWei: string;
  releasedNetWei: string;
  lockedNetWei: string;
  availableWei: string;
  paidOutWei: string;
  agents: AgentEarnings[];
}

/**
 * Aggregate a creator's economics from escrow ledger entries:
 * available = released net - already processed payouts.
 */
export async function getCreatorEarnings(
  ownerAddress: string,
): Promise<CreatorEarnings> {
  const repo = getRepository();
  const [escrows, agents, paidOutWei] = await Promise.all([
    repo.listEscrowsByOwner(ownerAddress),
    repo.listAgentsByOwner(ownerAddress),
    repo.sumProcessedPayouts(ownerAddress),
  ]);

  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const perAgent = new Map<string, AgentEarnings>();

  let gross = 0n;
  let fees = 0n;
  let releasedNet = 0n;
  let lockedNet = 0n;

  for (const escrow of escrows) {
    const agent = agentById.get(escrow.agentId);
    const entry =
      perAgent.get(escrow.agentId) ??
      {
        agentId: escrow.agentId,
        agentSlug: agent?.slug ?? "",
        agentName: agent?.name ?? "Unknown agent",
        completedTasks: 0,
        grossWei: "0",
        feeWei: "0",
        netWei: "0",
      };

    const amount = BigInt(escrow.amountWei);
    const fee = BigInt(escrow.feeWei);
    const net = BigInt(escrow.netWei);

    if (escrow.status === "RELEASED") {
      gross += amount;
      fees += fee;
      releasedNet += net;
      entry.grossWei = (BigInt(entry.grossWei) + amount).toString();
      entry.feeWei = (BigInt(entry.feeWei) + fee).toString();
      entry.netWei = (BigInt(entry.netWei) + net).toString();
      entry.completedTasks += 1;
    } else if (escrow.status === "LOCKED") {
      lockedNet += net;
    }

    perAgent.set(escrow.agentId, entry);
  }

  const paidOut = BigInt(paidOutWei);
  const available = releasedNet - paidOut;

  return {
    ownerAddress,
    grossWei: gross.toString(),
    feeWei: fees.toString(),
    releasedNetWei: releasedNet.toString(),
    lockedNetWei: lockedNet.toString(),
    availableWei: (available < 0n ? 0n : available).toString(),
    paidOutWei: paidOut.toString(),
    agents: [...perAgent.values()].sort((a, b) =>
      a.agentName.localeCompare(b.agentName),
    ),
  };
}
