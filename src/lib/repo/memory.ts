import { randomUUID } from "crypto";
import { ConflictError, NotFoundError } from "../errors";
import { SEED_AGENTS } from "../seed-agents";
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

interface MemoryStore {
  agents: Map<string, AgentRecord>;
  tasks: Map<string, TaskRecord>;
  payments: Map<string, PaymentRecord>;
  wallets: Set<string>;
  seeded: boolean;
}

const globalForStore = globalThis as unknown as { __agenthubStore?: MemoryStore };

function getStore(): MemoryStore {
  if (!globalForStore.__agenthubStore) {
    globalForStore.__agenthubStore = {
      agents: new Map(),
      tasks: new Map(),
      payments: new Map(),
      wallets: new Set(),
      seeded: false,
    };
  }
  const store = globalForStore.__agenthubStore;
  if (!store.seeded) {
    store.seeded = true;
    for (const seed of SEED_AGENTS) {
      const now = new Date();
      store.agents.set(seed.slug, {
        id: randomUUID(),
        metadataUri: null,
        featured: false,
        ...seed,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return store;
}

function applyFilter(
  agents: AgentRecord[],
  filter?: AgentListFilter,
): AgentRecord[] {
  let result = [...agents];
  if (!filter || filter.activeOnly !== false) {
    result = result.filter((agent) => agent.active);
  }
  if (filter?.category && filter.category !== "all") {
    result = result.filter((agent) => agent.category === filter.category);
  }
  if (filter?.search) {
    const term = filter.search.toLowerCase();
    result = result.filter(
      (agent) =>
        agent.name.toLowerCase().includes(term) ||
        agent.description.toLowerCase().includes(term) ||
        agent.category.toLowerCase().includes(term) ||
        agent.capabilities.some((cap) => cap.toLowerCase().includes(term)),
    );
  }
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
    case "newest":
    default:
      result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      break;
  }
  return result;
}

class MemoryRepository implements Repository {
  readonly kind = "memory" as const;

  async listAgents(filter?: AgentListFilter): Promise<AgentRecord[]> {
    const store = getStore();
    return applyFilter([...store.agents.values()], filter);
  }

  async getAgentBySlug(slug: string): Promise<AgentRecord | null> {
    return getStore().agents.get(slug) ?? null;
  }

  async getAgentById(id: string): Promise<AgentRecord | null> {
    for (const agent of getStore().agents.values()) {
      if (agent.id === id) return agent;
    }
    return null;
  }

  async createAgent(data: CreateAgentData): Promise<AgentRecord> {
    const store = getStore();
    if (store.agents.has(data.slug)) {
      throw new ConflictError(`Agent slug "${data.slug}" already exists`);
    }
    const now = new Date();
    const record: AgentRecord = {
      id: randomUUID(),
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
      active: true,
      featured: data.featured ?? false,
      createdAt: now,
      updatedAt: now,
    };
    store.agents.set(record.slug, record);
    return record;
  }

  async createTask(data: CreateTaskData): Promise<TaskRecord> {
    const store = getStore();
    const agent = [...store.agents.values()].find((a) => a.id === data.agentId);
    if (!agent) throw new NotFoundError("Agent not found");
    const now = new Date();
    const record: TaskRecord = {
      id: randomUUID(),
      agentId: agent.id,
      agentSlug: agent.slug,
      clientAddress: data.clientAddress,
      input: data.input,
      inputHash: data.inputHash,
      status: data.status ?? "CREATED",
      priceWei: data.priceWei,
      currency: data.currency ?? "BOT",
      paymentTxHash: null,
      paymentVerifiedAt: null,
      resultRef: null,
      resultHash: null,
      result: null,
      error: null,
      onchainTxHash: null,
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.set(record.id, record);
    return record;
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    return getStore().tasks.get(id) ?? null;
  }

  async getTaskByPaymentTx(txHash: string): Promise<TaskRecord | null> {
    for (const task of getStore().tasks.values()) {
      if (task.paymentTxHash?.toLowerCase() === txHash.toLowerCase()) {
        return task;
      }
    }
    return null;
  }

  async listTasksByClient(address: string): Promise<TaskRecord[]> {
    const lower = address.toLowerCase();
    return [...getStore().tasks.values()]
      .filter((task) => task.clientAddress.toLowerCase() === lower)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateTask(id: string, patch: UpdateTaskData): Promise<TaskRecord> {
    const store = getStore();
    const task = store.tasks.get(id);
    if (!task) throw new NotFoundError("Task not found");
    const updated: TaskRecord = { ...task, ...patch, updatedAt: new Date() };
    store.tasks.set(id, updated);
    return updated;
  }

  async createPayment(data: CreatePaymentData): Promise<PaymentRecord> {
    const store = getStore();
    for (const payment of store.payments.values()) {
      if (payment.txHash.toLowerCase() === data.txHash.toLowerCase()) {
        throw new ConflictError("Payment transaction already recorded");
      }
      if (payment.taskId === data.taskId) {
        throw new ConflictError("Task already has a payment");
      }
    }
    const record: PaymentRecord = {
      id: randomUUID(),
      taskId: data.taskId,
      txHash: data.txHash,
      chainId: data.chainId,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      amountWei: data.amountWei,
      status: data.status,
      verifiedAt: new Date(),
    };
    store.payments.set(record.id, record);
    return record;
  }

  async getPaymentByTask(taskId: string): Promise<PaymentRecord | null> {
    for (const payment of getStore().payments.values()) {
      if (payment.taskId === taskId) return payment;
    }
    return null;
  }

  async upsertWallet(address: string): Promise<void> {
    getStore().wallets.add(address.toLowerCase());
  }
}

let memoryRepository: MemoryRepository | null = null;

export function getMemoryRepository(): Repository {
  if (!memoryRepository) memoryRepository = new MemoryRepository();
  return memoryRepository;
}
