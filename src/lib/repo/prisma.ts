import { ConflictError, NotFoundError } from "../errors";
import { getPrismaClient } from "../prisma";
import { botToWei, SEED_AGENTS } from "../seed-agents";
import type {
  AgentListFilter,
  AgentRecord,
  CreateAgentData,
  CreatePaymentData,
  CreateTaskData,
  PaymentRecord,
  Repository,
  TaskRecord,
  UpdateTaskData,
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
  createdAt: Date;
  updatedAt: Date;
  agent?: { slug: string };
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

class PrismaRepository implements Repository {
  readonly kind = "prisma" as const;

  async listAgents(filter?: AgentListFilter): Promise<AgentRecord[]> {
    const prisma = await getPrismaClient();
    const where: Record<string, unknown> = {};
    if (!filter || filter.activeOnly !== false) where.active = true;
    if (filter?.category && filter.category !== "all") {
      where.category = filter.category;
    }
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: "insensitive" } },
        { description: { contains: filter.search, mode: "insensitive" } },
        { category: { contains: filter.search, mode: "insensitive" } },
        { capabilities: { has: filter.search } },
      ];
    }
    const orderBy =
      filter?.sort === "name"
        ? { name: "asc" as const }
        : filter?.sort === "price-asc"
          ? { priceWei: "asc" as const }
          : filter?.sort === "price-desc"
            ? { priceWei: "desc" as const }
            : { createdAt: "desc" as const };

    const rows = await prisma.agent.findMany({
      where,
      orderBy,
    });
    return (rows as PrismaAgentRow[]).map(mapAgent);
  }

  async getAgentBySlug(slug: string): Promise<AgentRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.agent.findUnique({ where: { slug } });
    return row ? mapAgent(row as PrismaAgentRow) : null;
  }

  async getAgentById(id: string): Promise<AgentRecord | null> {
    const prisma = await getPrismaClient();
    const row = await prisma.agent.findUnique({ where: { id } });
    return row ? mapAgent(row as PrismaAgentRow) : null;
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
      },
    });
    return mapAgent(row as PrismaAgentRow);
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
