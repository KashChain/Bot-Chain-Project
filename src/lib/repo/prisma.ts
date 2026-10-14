import { ConflictError, NotFoundError } from "../errors";
import { getPrismaClient } from "../prisma";
import { botToWei, SEED_AGENTS } from "../seed-agents";
import type {
  AgentListFilter,
  AgentPage,
  AgentRecord,
  CreateAgentData,
  CreateDisputeData,
  CreateEscrowData,
  CreateNotificationData,
  CreatePaymentData,
  CreatePayoutData,
  CreateReportData,
  CreateReviewData,
  CreateTaskData,
  DisputeRecord,
  EscrowRecord,
  NotificationRecord,
  PaymentRecord,
  PayoutRecord,
  ReportRecord,
  Repository,
  ReviewRecord,
  StakeRecord,
  TaskRecord,
  UpdateAgentData,
  UpdateEscrowData,
  UpdateTaskData,
  UpsertStakeData,
} from "./types";

interface PrismaAgentRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  usageInstructions: string;
  endpoint: string;
  priceWei: string;
  ownerAddress: string;
  metadataUri: string | null;
  active: boolean;
  featured: boolean;
  webhookSecret: string | null;
  status: AgentRecord["status"];
  verified: boolean;
  notifyWebhookUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaTaskRow {
  id: string;
  agentId: string;
  clientAddress: string;
  input: string;
  inputHash: string;
  status: TaskRecord["status"];
  priceWei: string;
  currency: string;
  paymentTxHash: string | null;
  paymentVerifiedAt: Date | null;
  resultRef: string | null;
  resultHash: string | null;
  result: unknown;
  error: string | null;
  onchainTxHash: string | null;
  receiptStatus: TaskRecord["receiptStatus"];
  receiptError: string | null;
  receiptAttempts: number;
  notifyEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  agent?: { slug: string };
}

interface PrismaReviewRow {
  id: string;
  taskId: string;
  agentId: string;
  reviewerAddress: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

function mapAgent(row: PrismaAgentRow): AgentRecord {
  return { ...row, metadataUri: row.metadataUri };
}

function mapTask(row: PrismaTaskRow): TaskRecord {
  return {
    ...row,
    result: row.result ?? null,
    agentSlug: row.agent?.slug ?? "",
  };
}

function mapReview(row: PrismaReviewRow): ReviewRecord {
  return { ...row };
}

function sortAgents(agents: AgentRecord[], filter?: AgentListFilter): AgentRecord[] {
  const result = [...agents];
  switch (filter?.sort) {
    case "name":
      result.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "price-asc":
      result.sort((a, b) => Number(BigInt(a.priceWei) - BigInt(b.priceWei)));
      break;
    case "price-desc":
      result.sort((a, b) => Number(BigInt(b.priceWei) - BigInt(a.priceWei)));
      break;
    case "rating":
      result.sort(
        (a, b) =>
          (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) ||
          (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
      );
      break;
    case "popularity":
      result.sort(
        (a, b) =>
          (b.completedTaskCount ?? 0) - (a.completedTaskCount ?? 0) ||
          (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
      );
      break;
    case "newest":
    default:
      result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      break;
  }
  return result;
}

function paginate(agents: AgentRecord[], filter?: AgentListFilter): AgentRecord[] {
  const offset = filter?.offset ?? 0;
  if (offset > 0 || filter?.limit !== undefined) {
    const start = Math.max(0, offset);
    const end =
      filter?.limit !== undefined ? start + Math.max(0, filter.limit) : undefined;
    return agents.slice(start, end);
  }
  return agents;
}

class PrismaRepository implements Repository {
  readonly kind = "prisma" as const;

  private buildWhere(filter?: AgentListFilter): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (!filter || filter.activeOnly !== false) where.active = true;
    if (filter?.category && filter.category !== "all") {
      where.category = filter.category;
    }
    if (filter?.capabilities && filter.capabilities.length > 0) {
      where.capabilities = { hasEvery: filter.capabilities };
    }
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: "insensitive" } },
        { description: { contains: filter.search, mode: "insensitive" } },
        { category: { contains: filter.search, mode: "insensitive" } },
        { capabilities: { has: filter.search } },
      ];
    }
    return where;
  }

  private async enrich(rows: PrismaAgentRow[]): Promise<AgentRecord[]> {
    if (rows.length === 0) return [];
    const prisma = await getPrismaClient();
    const ids = rows.map((row) => row.id);
    const reviews = await prisma.review.findMany({
      where: { agentId: { in: ids } },
      select: { agentId: true, rating: true },
    });
    const completed = await prisma.task.findMany({
      where: { agentId: { in: ids }, status: "COMPLETED" },
      select: { agentId: true },
    });
    const stakes = await prisma.stake.findMany({
      where: { agentId: { in: ids } },
      select: { agentId: true, amountWei: true, status: true },
    });

    const ratings = new Map<string, { total: number; count: number }>();
    for (const review of reviews) {
      const entry = ratings.get(review.agentId) ?? { total: 0, count: 0 };
      entry.total += review.rating;
      entry.count += 1;
      ratings.set(review.agentId, entry);
    }
    const completedCounts = new Map<string, number>();
    for (const task of completed) {
      completedCounts.set(task.agentId, (completedCounts.get(task.agentId) ?? 0) + 1);
    }

    const stakeByAgent = new Map<string, { amountWei: string; status: StakeRecord["status"] }>();
    for (const stake of stakes) {
      stakeByAgent.set(stake.agentId, {
        amountWei: stake.amountWei,
        status: stake.status as StakeRecord["status"],
      });
    }

    return rows.map((row) => {
      const rating = ratings.get(row.id);
      const stake = stakeByAgent.get(row.id);
      return {
        ...mapAgent(row),
        ratingAverage: rating && rating.count > 0 ? rating.total / rating.count : 0,
        ratingCount: rating?.count ?? 0,
        completedTaskCount: completedCounts.get(row.id) ?? 0,
        stakedWei: stake?.amountWei ?? "0",
        stakeStatus: stake?.status ?? null,
      };
    });
  }

  async listAgents(filter?: AgentListFilter): Promise<AgentRecord[]> {
    return (await this.listAgentsPage(filter)).agents;
  }

  async listAgentsPage(filter?: AgentListFilter): Promise<AgentPage> {
    const prisma = await getPrismaClient();
    const rows = (await prisma.agent.findMany({
      where: this.buildWhere(filter),
    })) as PrismaAgentRow[];
    const enriched = await this.enrich(rows);
    const sorted = sortAgents(enriched, filter);
    return { agents: paginate(sorted, filter), total: sorted.length };
  }

  async countAgents(filter?: AgentListFilter): Promise<number> {
    const prisma = await getPrismaClient();
    return prisma.agent.count({ where: this.buildWhere(filter) });
  }

  async getAgentBySlug(slug: string): Promise<AgentRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.agent.findUnique({ where: { slug } });
    if (!row) return null;
    return (await this.enrich([row as PrismaAgentRow]))[0];
  }

  async getAgentById(id: string): Promise<AgentRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.agent.findUnique({ where: { id } });
    if (!row) return null;
    return (await this.enrich([row as PrismaAgentRow]))[0];
  }

  async createAgent(data: CreateAgentData): Promise<AgentRecord> {
    const prisma = await getPrismaClient();
    const existing = await prisma.agent.findUnique({ where: { slug: data.slug } });
    if (existing) {
      throw new ConflictError(`Agent slug "${data.slug}" already exists`);
    }
    const row = await prisma.agent.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description,
        category: data.category,
        capabilities: data.capabilities,
        usageInstructions: data.usageInstructions,
        endpoint: data.endpoint,
        priceWei: data.priceWei,
        ownerAddress: data.ownerAddress,
        metadataUri: data.metadataUri ?? null,
        featured: data.featured ?? false,
        webhookSecret: data.webhookSecret ?? null,
      },
    });
    return {
      ...mapAgent(row as PrismaAgentRow),
      ratingAverage: 0,
      ratingCount: 0,
      completedTaskCount: 0,
      stakedWei: "0",
      stakeStatus: null,
    };
  }

  async updateAgent(id: string, patch: UpdateAgentData): Promise<AgentRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.agent.update({
      where: { id },
      data: {
        active: patch.active,
        status: patch.status,
        verified: patch.verified,
        metadataUri: patch.metadataUri,
        notifyWebhookUrl: patch.notifyWebhookUrl,
      },
      include: undefined,
    });
    return (await this.enrich([row as PrismaAgentRow]))[0];
  }

  async listAgentsByOwner(ownerAddress: string): Promise<AgentRecord[]> {
    const prisma = await getPrismaClient();
    const rows = (await prisma.agent.findMany({
      where: { ownerAddress: { equals: ownerAddress, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    })) as PrismaAgentRow[];
    return this.enrich(rows);
  }

  async createReview(data: CreateReviewData): Promise<ReviewRecord> {
    const prisma = await getPrismaClient();
    try {
      const row = await prisma.review.create({
        data: {
          taskId: data.taskId,
          agentId: data.agentId,
          reviewerAddress: data.reviewerAddress,
          rating: data.rating,
          comment: data.comment ?? null,
        },
      });
      return mapReview(row as PrismaReviewRow);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new ConflictError("This task already has a review");
      }
      throw error;
    }
  }

  async getReviewByTask(taskId: string): Promise<ReviewRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.review.findUnique({ where: { taskId } });
    return row ? mapReview(row as PrismaReviewRow) : null;
  }

  async listReviewsByAgent(agentId: string): Promise<ReviewRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.review.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
    });
    return (rows as PrismaReviewRow[]).map(mapReview);
  }

  async createTask(data: CreateTaskData): Promise<TaskRecord> {
    const prisma = await getPrismaClient();
    const agent = await prisma.agent.findUnique({ where: { id: data.agentId } });
    if (!agent) throw new NotFoundError("Agent not found");
    const row = await prisma.task.create({
      data: {
        agentId: data.agentId,
        clientAddress: data.clientAddress,
        input: data.input,
        inputHash: data.inputHash,
        status: data.status ?? "CREATED",
        priceWei: data.priceWei,
        currency: data.currency ?? "BOT",
        notifyEmail: data.notifyEmail ?? null,
      },
      include: { agent: { select: { slug: true } } },
    });
    return mapTask(row as PrismaTaskRow);
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.task.findUnique({
      where: { id },
      include: { agent: { select: { slug: true } } },
    });
    return row ? mapTask(row as PrismaTaskRow) : null;
  }

  async getTaskByPaymentTx(txHash: string): Promise<TaskRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.task.findFirst({
      where: { paymentTxHash: { equals: txHash, mode: "insensitive" } },
      include: { agent: { select: { slug: true } } },
    });
    return row ? mapTask(row as PrismaTaskRow) : null;
  }

  async listTasksByClient(address: string): Promise<TaskRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.task.findMany({
      where: { clientAddress: { equals: address, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      include: { agent: { select: { slug: true } } },
    });
    return (rows as PrismaTaskRow[]).map(mapTask);
  }

  async listStaleActiveTasks(olderThan: Date): Promise<TaskRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.task.findMany({
      where: {
        status: { in: ["PAID", "PROCESSING"] },
        updatedAt: { lt: olderThan },
      },
      orderBy: { updatedAt: "asc" },
      include: { agent: { select: { slug: true } } },
    });
    return (rows as PrismaTaskRow[]).map(mapTask);
  }

  async listUnconfirmedReceiptTasks(): Promise<TaskRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.task.findMany({
      where: { status: "COMPLETED", receiptStatus: { not: "CONFIRMED" } },
      orderBy: { createdAt: "asc" },
      include: { agent: { select: { slug: true } } },
    });
    return (rows as PrismaTaskRow[]).map(mapTask);
  }

  async updateTask(id: string, patch: UpdateTaskData): Promise<TaskRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.task.update({
      where: { id },
      data: patch as never,
      include: { agent: { select: { slug: true } } },
    });
    return mapTask(row as PrismaTaskRow);
  }

  async createPayment(data: CreatePaymentData): Promise<PaymentRecord> {
    const prisma = await getPrismaClient();
    const existing = await prisma.payment.findFirst({
      where: {
        OR: [
          { txHash: { equals: data.txHash, mode: "insensitive" } },
          { taskId: data.taskId },
        ],
      },
    });
    if (existing) throw new ConflictError("Payment already recorded");
    const row = await prisma.payment.create({
      data: {
        taskId: data.taskId,
        txHash: data.txHash,
        chainId: data.chainId,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        amountWei: data.amountWei,
        status: data.status,
      },
    });
    return {
      id: row.id,
      taskId: row.taskId,
      txHash: row.txHash,
      chainId: row.chainId,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      amountWei: row.amountWei,
      status: row.status,
      verifiedAt: row.verifiedAt,
    };
  }

  async getPaymentByTask(taskId: string): Promise<PaymentRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.payment.findUnique({ where: { taskId } });
    if (!row) return null;
    return { ...row };
  }

  async createEscrow(data: CreateEscrowData): Promise<EscrowRecord> {
    const prisma = await getPrismaClient();
    const existing = await prisma.escrow.findUnique({ where: { taskId: data.taskId } });
    if (existing) throw new ConflictError("Task already has an escrow");
    const row = await prisma.escrow.create({ data: { ...data } });
    return { ...row } as EscrowRecord;
  }

  async getEscrowByTask(taskId: string): Promise<EscrowRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.escrow.findUnique({ where: { taskId } });
    return row ? ({ ...row } as EscrowRecord) : null;
  }

  async updateEscrow(taskId: string, patch: UpdateEscrowData): Promise<EscrowRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.escrow.update({ where: { taskId }, data: patch });
    return { ...row } as EscrowRecord;
  }

  async listEscrowsByOwner(ownerAddress: string): Promise<EscrowRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.escrow.findMany({
      where: { ownerAddress: { equals: ownerAddress, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({ ...row }) as EscrowRecord);
  }

  async createDispute(data: CreateDisputeData): Promise<DisputeRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.dispute.create({ data: { ...data } });
    return { ...row } as DisputeRecord;
  }

  async getDispute(id: string): Promise<DisputeRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.dispute.findUnique({ where: { id } });
    return row ? ({ ...row } as DisputeRecord) : null;
  }

  async getOpenDisputeByTask(taskId: string): Promise<DisputeRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.dispute.findFirst({
      where: { taskId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    return row ? ({ ...row } as DisputeRecord) : null;
  }

  async listDisputes(status?: DisputeRecord["status"]): Promise<DisputeRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.dispute.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({ ...row }) as DisputeRecord);
  }

  async updateDispute(
    id: string,
    patch: {
      status?: DisputeRecord["status"];
      note?: string | null;
      resolvedBy?: string | null;
      resolvedAt?: Date | null;
    },
  ): Promise<DisputeRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.dispute.update({ where: { id }, data: patch });
    return { ...row } as DisputeRecord;
  }

  async createReport(data: CreateReportData): Promise<ReportRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.report.create({
      data: {
        agentId: data.agentId,
        reporterAddress: data.reporterAddress,
        reason: data.reason,
        details: data.details ?? null,
      },
    });
    return { ...row } as ReportRecord;
  }

  async getReport(id: string): Promise<ReportRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.report.findUnique({ where: { id } });
    return row ? ({ ...row } as ReportRecord) : null;
  }

  async listReports(status?: ReportRecord["status"]): Promise<ReportRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({ ...row }) as ReportRecord);
  }

  async updateReport(
    id: string,
    patch: {
      status?: ReportRecord["status"];
      reviewedBy?: string | null;
      resolvedAt?: Date | null;
    },
  ): Promise<ReportRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.report.update({ where: { id }, data: patch });
    return { ...row } as ReportRecord;
  }

  async upsertStake(data: UpsertStakeData): Promise<StakeRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.stake.upsert({
      where: { agentId: data.agentId },
      update: {
        ownerAddress: data.ownerAddress,
        amountWei: data.amountWei,
        status: data.status,
        txHash: data.txHash ?? null,
      },
      create: {
        agentId: data.agentId,
        ownerAddress: data.ownerAddress,
        amountWei: data.amountWei,
        status: data.status ?? "ACTIVE",
        txHash: data.txHash ?? null,
      },
    });
    return { ...row } as StakeRecord;
  }

  async getStakeByAgent(agentId: string): Promise<StakeRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.stake.findUnique({ where: { agentId } });
    return row ? ({ ...row } as StakeRecord) : null;
  }

  async createPayout(data: CreatePayoutData): Promise<PayoutRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.payout.create({
      data: {
        ownerAddress: data.ownerAddress,
        amountWei: data.amountWei,
        status: data.status ?? "PENDING",
        txHash: data.txHash ?? null,
        processedAt: data.processedAt ?? null,
      },
    });
    return { ...row } as PayoutRecord;
  }

  async listPayoutsByOwner(ownerAddress: string): Promise<PayoutRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.payout.findMany({
      where: { ownerAddress: { equals: ownerAddress, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({ ...row }) as PayoutRecord);
  }

  async sumProcessedPayouts(ownerAddress: string): Promise<string> {
    const payouts = await this.listPayoutsByOwner(ownerAddress);
    const total = payouts
      .filter((payout) => payout.status === "PROCESSED")
      .reduce((sum, payout) => sum + BigInt(payout.amountWei), 0n);
    return total.toString();
  }

  async createNotification(data: CreateNotificationData): Promise<NotificationRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.notificationDelivery.create({
      data: {
        taskId: data.taskId,
        event: data.event,
        channel: data.channel,
        target: data.target,
        payload: (data.payload ?? null) as never,
      },
    });
    return { ...row } as NotificationRecord;
  }

  async markNotification(
    id: string,
    patch: {
      status: NotificationRecord["status"];
      error?: string | null;
      sentAt?: Date | null;
      attempts?: number;
    },
  ): Promise<NotificationRecord> {
    const prisma = await getPrismaClient();
    const row = await prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: patch.status,
        error: patch.error ?? null,
        sentAt: patch.sentAt ?? null,
        attempts:
          patch.attempts !== undefined ? patch.attempts : { increment: 1 },
      },
    });
    return { ...row } as NotificationRecord;
  }

  async listNotificationsByTask(taskId: string): Promise<NotificationRecord[]> {
    const prisma = await getPrismaClient();
    const rows = await prisma.notificationDelivery.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({ ...row }) as NotificationRecord);
  }

  async upsertWallet(address: string): Promise<void> {
    const prisma = await getPrismaClient();
    await prisma.walletProfile.upsert({
      where: { address: address.toLowerCase() },
      update: {},
      create: { address: address.toLowerCase() },
    });
  }
}

let prismaRepository: PrismaRepository | null = null;

export function getPrismaRepository(): Repository {
  if (!prismaRepository) prismaRepository = new PrismaRepository();
  return prismaRepository;
}

export async function seedPrismaAgents(): Promise<void> {
  const prisma = await getPrismaClient();
  for (const seed of SEED_AGENTS) {
    await prisma.agent.upsert({
      where: { slug: seed.slug },
      update: {
        name: seed.name,
        description: seed.description,
        category: seed.category,
        capabilities: seed.capabilities,
        usageInstructions: seed.usageInstructions,
        endpoint: seed.endpoint,
        priceWei: seed.priceWei || botToWei(0.01),
        metadataUri: seed.metadataUri ?? null,
        featured: seed.featured ?? false,
      },
      create: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        capabilities: seed.capabilities,
        usageInstructions: seed.usageInstructions,
        endpoint: seed.endpoint,
        priceWei: seed.priceWei || botToWei(0.01),
        ownerAddress: seed.ownerAddress,
        metadataUri: seed.metadataUri ?? null,
        featured: seed.featured ?? false,
      },
    });
  }
}
