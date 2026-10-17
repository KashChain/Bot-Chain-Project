import { randomUUID } from "crypto";
import { ConflictError, NotFoundError } from "../errors";
import { SEED_AGENTS } from "../seed-agents";
import {
  matchesSearch,
  rankByRelevance,
  tokenizeSearch,
} from "../agents/search";
import type {
  AgentListFilter,
  AgentPage,
  AgentRecord,
  ApiKeyRecord,
  ApplyCreditData,
  CreateAgentData,
  CreateApiKeyData,
  CreateDisputeData,
  CreateEscrowData,
  CreateNotificationData,
  CreatePaymentData,
  CreatePayoutData,
  CreateReportData,
  CreateReviewData,
  CreateSubscriptionData,
  CreateTaskData,
  CreditBalanceRecord,
  CreditTransactionRecord,
  DisputeRecord,
  EscrowQuery,
  EscrowRecord,
  NotificationRecord,
  PaymentRecord,
  PayoutRecord,
  ReportRecord,
  Repository,
  ReviewRecord,
  StakeRecord,
  SubscriptionRecord,
  TaskQuery,
  TaskRecord,
  UpdateAgentData,
  UpdateApiKeyData,
  UpdateEscrowData,
  UpdateSubscriptionData,
  UpdateTaskData,
  UpsertStakeData,
} from "./types";
import type { DisputeStatus, NotificationStatus, ReportStatus } from "../escrow-state";

interface MemoryStore {
  agents: Map<string, AgentRecord>;
  tasks: Map<string, TaskRecord>;
  payments: Map<string, PaymentRecord>;
  reviews: Map<string, ReviewRecord>;
  wallets: Set<string>;
  escrows: Map<string, EscrowRecord>;
  disputes: Map<string, DisputeRecord>;
  reports: Map<string, ReportRecord>;
  stakes: Map<string, StakeRecord>;
  payouts: Map<string, PayoutRecord>;
  notifications: Map<string, NotificationRecord>;
  apiKeys: Map<string, ApiKeyRecord>;
  creditBalances: Map<string, CreditBalanceRecord>;
  creditTransactions: Map<string, CreditTransactionRecord>;
  subscriptions: Map<string, SubscriptionRecord>;
  jobs: Set<string>;
  seeded: boolean;
}

const globalForStore = globalThis as unknown as { __agenthubStore?: MemoryStore };

function getStore(): MemoryStore {
  if (!globalForStore.__agenthubStore) {
    globalForStore.__agenthubStore = {
      agents: new Map(),
      tasks: new Map(),
      payments: new Map(),
      reviews: new Map(),
      wallets: new Set(),
      escrows: new Map(),
      disputes: new Map(),
      reports: new Map(),
      stakes: new Map(),
      payouts: new Map(),
      notifications: new Map(),
      apiKeys: new Map(),
      creditBalances: new Map(),
      creditTransactions: new Map(),
      subscriptions: new Map(),
      jobs: new Set(),
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
        status: "ACTIVE",
        verified: false,
        notifyWebhookUrl: null,
        ...seed,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return store;
}

function statsFor(
  store: MemoryStore,
  agentId: string,
): {
  ratingAverage: number;
  ratingCount: number;
  completedTaskCount: number;
  stakedWei: string;
  stakeStatus: StakeRecord["status"] | null;
} {
  const reviews = [...store.reviews.values()].filter(
    (review) => review.agentId === agentId,
  );
  const ratingCount = reviews.length;
  const ratingAverage =
    ratingCount === 0
      ? 0
      : reviews.reduce((sum, review) => sum + review.rating, 0) / ratingCount;
  const completedTaskCount = [...store.tasks.values()].filter(
    (task) => task.agentId === agentId && task.status === "COMPLETED",
  ).length;
  const stake = store.stakes.get(agentId);
  return {
    ratingAverage,
    ratingCount,
    completedTaskCount,
    stakedWei: stake?.amountWei ?? "0",
    stakeStatus: stake?.status ?? null,
  };
}

function withStats(store: MemoryStore, agent: AgentRecord): AgentRecord {
  return { ...agent, ...statsFor(store, agent.id) };
}

function matchesFilter(agent: AgentRecord, filter?: AgentListFilter): boolean {
  if (!filter || filter.activeOnly !== false) {
    if (!agent.active) return false;
  }
  if (filter?.category && filter.category !== "all") {
    if (agent.category !== filter.category) return false;
  }
  if (filter?.capabilities && filter.capabilities.length > 0) {
    const owned = agent.capabilities.map((cap) => cap.toLowerCase());
    for (const wanted of filter.capabilities) {
      if (!owned.includes(wanted.toLowerCase())) return false;
    }
  }
  if (filter?.search) {
    const terms = tokenizeSearch(filter.search);
    if (terms.length > 0 && !matchesSearch(agent, terms)) return false;
  }
  return true;
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

function applyPagination(
  agents: AgentRecord[],
  filter?: AgentListFilter,
): AgentRecord[] {
  const offset = filter?.offset ?? 0;
  if (offset > 0 || filter?.limit !== undefined) {
    const start = Math.max(0, offset);
    const end =
      filter?.limit !== undefined ? start + Math.max(0, filter.limit) : undefined;
    return agents.slice(start, end);
  }
  return agents;
}

class MemoryRepository implements Repository {
  readonly kind = "memory" as const;

  async listAgents(filter?: AgentListFilter): Promise<AgentRecord[]> {
    const store = getStore();
    const enriched = [...store.agents.values()].map((agent) =>
      withStats(store, agent),
    );
    const matched = enriched.filter((agent) => matchesFilter(agent, filter));
    const sorted = sortAgents(matched, filter);
    const ranked = rankByRelevance(
      sorted,
      filter?.search ? tokenizeSearch(filter.search) : [],
    );
    return applyPagination(ranked, filter);
  }

  async listAgentsPage(filter?: AgentListFilter): Promise<AgentPage> {
    const store = getStore();
    const enriched = [...store.agents.values()].map((agent) =>
      withStats(store, agent),
    );
    const matched = enriched.filter((agent) => matchesFilter(agent, filter));
    const sorted = sortAgents(matched, filter);
    const ranked = rankByRelevance(
      sorted,
      filter?.search ? tokenizeSearch(filter.search) : [],
    );
    return {
      agents: applyPagination(ranked, filter),
      total: ranked.length,
    };
  }

  async countAgents(filter?: AgentListFilter): Promise<number> {
    const store = getStore();
    return [...store.agents.values()].filter((agent) =>
      matchesFilter(withStats(store, agent), filter),
    ).length;
  }

  async getAgentBySlug(slug: string): Promise<AgentRecord | null> {
    const store = getStore();
    const agent = store.agents.get(slug);
    return agent ? withStats(store, agent) : null;
  }

  async getAgentById(id: string): Promise<AgentRecord | null> {
    const store = getStore();
    for (const agent of store.agents.values()) {
      if (agent.id === id) return withStats(store, agent);
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
      webhookSecret: data.webhookSecret ?? null,
      status: "ACTIVE",
      verified: false,
      notifyWebhookUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    store.agents.set(record.slug, record);
    return withStats(store, record);
  }

  async updateAgent(id: string, patch: UpdateAgentData): Promise<AgentRecord> {
    const store = getStore();
    for (const [slug, agent] of store.agents) {
      if (agent.id !== id) continue;
      const updated: AgentRecord = { ...agent, ...patch, updatedAt: new Date() };
      store.agents.set(slug, updated);
      return withStats(store, updated);
    }
    throw new NotFoundError("Agent not found");
  }

  async listAgentsByOwner(ownerAddress: string): Promise<AgentRecord[]> {
    const store = getStore();
    const lower = ownerAddress.toLowerCase();
    return [...store.agents.values()]
      .filter((agent) => agent.ownerAddress.toLowerCase() === lower)
      .map((agent) => withStats(store, agent));
  }

  async createReview(data: CreateReviewData): Promise<ReviewRecord> {
    const store = getStore();
    for (const review of store.reviews.values()) {
      if (review.taskId === data.taskId) {
        throw new ConflictError("This task already has a review");
      }
    }
    const record: ReviewRecord = {
      id: randomUUID(),
      taskId: data.taskId,
      agentId: data.agentId,
      reviewerAddress: data.reviewerAddress,
      rating: data.rating,
      comment: data.comment ?? null,
      createdAt: new Date(),
    };
    store.reviews.set(record.id, record);
    return record;
  }

  async getReviewByTask(taskId: string): Promise<ReviewRecord | null> {
    for (const review of getStore().reviews.values()) {
      if (review.taskId === taskId) return review;
    }
    return null;
  }

  async listReviewsByAgent(agentId: string): Promise<ReviewRecord[]> {
    return [...getStore().reviews.values()]
      .filter((review) => review.agentId === agentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
      receiptStatus: "NONE",
      receiptError: null,
      receiptAttempts: 0,
      notifyEmail: data.notifyEmail ?? null,
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

  async listStaleActiveTasks(olderThan: Date): Promise<TaskRecord[]> {
    return [...getStore().tasks.values()]
      .filter(
        (task) =>
          (task.status === "PAID" || task.status === "PROCESSING") &&
          task.updatedAt.getTime() < olderThan.getTime(),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  }

  async listUnconfirmedReceiptTasks(): Promise<TaskRecord[]> {
    return [...getStore().tasks.values()]
      .filter(
        (task) =>
          task.status === "COMPLETED" && task.receiptStatus !== "CONFIRMED",
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
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

  async createEscrow(data: CreateEscrowData): Promise<EscrowRecord> {
    const store = getStore();
    for (const escrow of store.escrows.values()) {
      if (escrow.taskId === data.taskId) {
        throw new ConflictError("Task already has an escrow");
      }
    }
    const now = new Date();
    const record: EscrowRecord = {
      id: randomUUID(),
      taskId: data.taskId,
      agentId: data.agentId,
      ownerAddress: data.ownerAddress,
      clientAddress: data.clientAddress,
      amountWei: data.amountWei,
      feeBps: data.feeBps,
      feeWei: data.feeWei,
      netWei: data.netWei,
      status: "LOCKED",
      lockTxHash: data.lockTxHash ?? null,
      releaseTxHash: null,
      refundTxHash: null,
      releasedAt: null,
      refundedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.escrows.set(record.id, record);
    return record;
  }

  async getEscrowByTask(taskId: string): Promise<EscrowRecord | null> {
    for (const escrow of getStore().escrows.values()) {
      if (escrow.taskId === taskId) return escrow;
    }
    return null;
  }

  async updateEscrow(taskId: string, patch: UpdateEscrowData): Promise<EscrowRecord> {
    const store = getStore();
    for (const [id, escrow] of store.escrows) {
      if (escrow.taskId !== taskId) continue;
      const updated: EscrowRecord = { ...escrow, ...patch, updatedAt: new Date() };
      store.escrows.set(id, updated);
      return updated;
    }
    throw new NotFoundError("Escrow not found");
  }

  async listEscrowsByOwner(ownerAddress: string): Promise<EscrowRecord[]> {
    const lower = ownerAddress.toLowerCase();
    return [...getStore().escrows.values()]
      .filter((escrow) => escrow.ownerAddress.toLowerCase() === lower)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createDispute(data: CreateDisputeData): Promise<DisputeRecord> {
    const record: DisputeRecord = {
      id: randomUUID(),
      taskId: data.taskId,
      openedBy: data.openedBy,
      reason: data.reason,
      status: "OPEN",
      note: null,
      resolvedBy: null,
      createdAt: new Date(),
      resolvedAt: null,
    };
    getStore().disputes.set(record.id, record);
    return record;
  }

  async getDispute(id: string): Promise<DisputeRecord | null> {
    return getStore().disputes.get(id) ?? null;
  }

  async getOpenDisputeByTask(taskId: string): Promise<DisputeRecord | null> {
    for (const dispute of getStore().disputes.values()) {
      if (dispute.taskId === taskId && dispute.status === "OPEN") return dispute;
    }
    return null;
  }

  async listDisputes(status?: DisputeStatus): Promise<DisputeRecord[]> {
    return [...getStore().disputes.values()]
      .filter((dispute) => (status ? dispute.status === status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateDispute(
    id: string,
    patch: {
      status?: DisputeStatus;
      note?: string | null;
      resolvedBy?: string | null;
      resolvedAt?: Date | null;
    },
  ): Promise<DisputeRecord> {
    const store = getStore();
    const dispute = store.disputes.get(id);
    if (!dispute) throw new NotFoundError("Dispute not found");
    const updated: DisputeRecord = { ...dispute, ...patch };
    store.disputes.set(id, updated);
    return updated;
  }

  async createReport(data: CreateReportData): Promise<ReportRecord> {
    const record: ReportRecord = {
      id: randomUUID(),
      agentId: data.agentId,
      reporterAddress: data.reporterAddress,
      reason: data.reason,
      details: data.details ?? null,
      status: "OPEN",
      reviewedBy: null,
      createdAt: new Date(),
      resolvedAt: null,
    };
    getStore().reports.set(record.id, record);
    return record;
  }

  async getReport(id: string): Promise<ReportRecord | null> {
    return getStore().reports.get(id) ?? null;
  }

  async listReports(status?: ReportStatus): Promise<ReportRecord[]> {
    return [...getStore().reports.values()]
      .filter((report) => (status ? report.status === status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateReport(
    id: string,
    patch: {
      status?: ReportStatus;
      reviewedBy?: string | null;
      resolvedAt?: Date | null;
    },
  ): Promise<ReportRecord> {
    const store = getStore();
    const report = store.reports.get(id);
    if (!report) throw new NotFoundError("Report not found");
    const updated: ReportRecord = { ...report, ...patch };
    store.reports.set(id, updated);
    return updated;
  }

  async upsertStake(data: UpsertStakeData): Promise<StakeRecord> {
    const store = getStore();
    const existing = store.stakes.get(data.agentId);
    const now = new Date();
    if (existing) {
      const updated: StakeRecord = {
        ...existing,
        ownerAddress: data.ownerAddress,
        amountWei: data.amountWei,
        status: data.status ?? existing.status,
        txHash: data.txHash ?? existing.txHash,
        updatedAt: now,
      };
      store.stakes.set(data.agentId, updated);
      return updated;
    }
    const record: StakeRecord = {
      id: randomUUID(),
      agentId: data.agentId,
      ownerAddress: data.ownerAddress,
      amountWei: data.amountWei,
      status: data.status ?? "ACTIVE",
      txHash: data.txHash ?? null,
      createdAt: now,
      updatedAt: now,
    };
    store.stakes.set(data.agentId, record);
    return record;
  }

  async getStakeByAgent(agentId: string): Promise<StakeRecord | null> {
    return getStore().stakes.get(agentId) ?? null;
  }

  async createPayout(data: CreatePayoutData): Promise<PayoutRecord> {
    const record: PayoutRecord = {
      id: randomUUID(),
      ownerAddress: data.ownerAddress,
      amountWei: data.amountWei,
      status: data.status ?? "PENDING",
      txHash: data.txHash ?? null,
      createdAt: new Date(),
      processedAt: data.processedAt ?? null,
    };
    getStore().payouts.set(record.id, record);
    return record;
  }

  async listPayoutsByOwner(ownerAddress: string): Promise<PayoutRecord[]> {
    const lower = ownerAddress.toLowerCase();
    return [...getStore().payouts.values()]
      .filter((payout) => payout.ownerAddress.toLowerCase() === lower)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async sumProcessedPayouts(ownerAddress: string): Promise<string> {
    const lower = ownerAddress.toLowerCase();
    const total = [...getStore().payouts.values()]
      .filter(
        (payout) =>
          payout.ownerAddress.toLowerCase() === lower &&
          payout.status === "PROCESSED",
      )
      .reduce((sum, payout) => sum + BigInt(payout.amountWei), 0n);
    return total.toString();
  }

  async createNotification(data: CreateNotificationData): Promise<NotificationRecord> {
    const record: NotificationRecord = {
      id: randomUUID(),
      taskId: data.taskId,
      event: data.event,
      channel: data.channel,
      target: data.target,
      status: "PENDING",
      attempts: 0,
      error: null,
      payload: data.payload ?? null,
      createdAt: new Date(),
      sentAt: null,
    };
    getStore().notifications.set(record.id, record);
    return record;
  }

  async markNotification(
    id: string,
    patch: { status: NotificationStatus; error?: string | null; sentAt?: Date | null; attempts?: number },
  ): Promise<NotificationRecord> {
    const store = getStore();
    const notification = store.notifications.get(id);
    if (!notification) throw new NotFoundError("Notification not found");
    const updated: NotificationRecord = {
      ...notification,
      ...patch,
      attempts: patch.attempts ?? notification.attempts + 1,
    };
    store.notifications.set(id, updated);
    return updated;
  }

  async listNotificationsByTask(taskId: string): Promise<NotificationRecord[]> {
    return [...getStore().notifications.values()]
      .filter((notification) => notification.taskId === taskId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async upsertWallet(address: string): Promise<void> {
    getStore().wallets.add(address.toLowerCase());
  }

  async createApiKey(data: CreateApiKeyData): Promise<ApiKeyRecord> {
    const store = getStore();
    const now = new Date();
    const record: ApiKeyRecord = {
      id: randomUUID(),
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      ownerAddress: data.ownerAddress.toLowerCase(),
      rateLimit: data.rateLimit,
      scopes: data.scopes ?? [],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.apiKeys.set(record.id, record);
    return record;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return (
      [...getStore().apiKeys.values()].find((key) => key.keyHash === keyHash) ??
      null
    );
  }

  async getApiKeyById(id: string): Promise<ApiKeyRecord | null> {
    return getStore().apiKeys.get(id) ?? null;
  }

  async listApiKeysByOwner(ownerAddress: string): Promise<ApiKeyRecord[]> {
    const lower = ownerAddress.toLowerCase();
    return [...getStore().apiKeys.values()]
      .filter((key) => key.ownerAddress.toLowerCase() === lower)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateApiKey(id: string, patch: UpdateApiKeyData): Promise<ApiKeyRecord> {
    const store = getStore();
    const key = store.apiKeys.get(id);
    if (!key) throw new NotFoundError("API key not found");
    const updated: ApiKeyRecord = { ...key, ...patch, updatedAt: new Date() };
    store.apiKeys.set(id, updated);
    return updated;
  }

  async getCreditBalance(ownerAddress: string): Promise<CreditBalanceRecord> {
    const store = getStore();
    const lower = ownerAddress.toLowerCase();
    const existing = store.creditBalances.get(lower);
    if (existing) return existing;
    const now = new Date();
    const record: CreditBalanceRecord = {
      ownerAddress: lower,
      balanceWei: "0",
      createdAt: now,
      updatedAt: now,
    };
    store.creditBalances.set(lower, record);
    return record;
  }

  async applyCredit(data: ApplyCreditData): Promise<CreditTransactionRecord> {
    const store = getStore();
    const lower = data.ownerAddress.toLowerCase();
    const balance = await this.getCreditBalance(lower);
    const delta = BigInt(data.amountWei);
    const current = BigInt(balance.balanceWei);
    const next = current + delta;
    if (next < 0n) throw new ConflictError("Insufficient credit balance");
    const now = new Date();
    store.creditBalances.set(lower, {
      ...balance,
      balanceWei: next.toString(),
      updatedAt: now,
    });
    const tx: CreditTransactionRecord = {
      id: randomUUID(),
      ownerAddress: lower,
      type: data.type,
      amountWei: data.amountWei,
      balanceAfterWei: next.toString(),
      reference: data.reference ?? null,
      createdAt: now,
    };
    store.creditTransactions.set(tx.id, tx);
    return tx;
  }

  async listCreditTransactions(
    ownerAddress: string,
    limit = 50,
  ): Promise<CreditTransactionRecord[]> {
    const lower = ownerAddress.toLowerCase();
    return [...getStore().creditTransactions.values()]
      .filter((tx) => tx.ownerAddress.toLowerCase() === lower)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findCreditTransactionByReference(
    reference: string,
  ): Promise<CreditTransactionRecord | null> {
    return (
      [...getStore().creditTransactions.values()].find(
        (tx) => tx.reference === reference,
      ) ?? null
    );
  }

  async createSubscription(
    data: CreateSubscriptionData,
  ): Promise<SubscriptionRecord> {
    const store = getStore();
    const now = new Date();
    const record: SubscriptionRecord = {
      id: randomUUID(),
      ownerAddress: data.ownerAddress.toLowerCase(),
      planId: data.planId,
      status: data.status ?? "ACTIVE",
      agentId: data.agentId ?? null,
      periodStart: data.periodStart ?? now,
      periodEnd: data.periodEnd,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.subscriptions.set(record.id, record);
    return record;
  }

  async getSubscription(id: string): Promise<SubscriptionRecord | null> {
    return getStore().subscriptions.get(id) ?? null;
  }

  async listSubscriptionsByOwner(
    ownerAddress: string,
  ): Promise<SubscriptionRecord[]> {
    const lower = ownerAddress.toLowerCase();
    return [...getStore().subscriptions.values()]
      .filter((sub) => sub.ownerAddress.toLowerCase() === lower)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listActiveSubscriptionsByAgent(
    agentId: string,
  ): Promise<SubscriptionRecord[]> {
    return [...getStore().subscriptions.values()].filter(
      (sub) => sub.agentId === agentId && sub.status === "ACTIVE",
    );
  }

  async updateSubscription(
    id: string,
    patch: UpdateSubscriptionData,
  ): Promise<SubscriptionRecord> {
    const store = getStore();
    const sub = store.subscriptions.get(id);
    if (!sub) throw new NotFoundError("Subscription not found");
    const updated: SubscriptionRecord = {
      ...sub,
      ...patch,
      updatedAt: new Date(),
    };
    store.subscriptions.set(id, updated);
    return updated;
  }

  async listTasks(query?: TaskQuery): Promise<TaskRecord[]> {
    return [...getStore().tasks.values()]
      .filter((task) => (query?.status ? task.status === query.status : true))
      .filter((task) =>
        query?.since ? task.createdAt.getTime() >= query.since.getTime() : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, query?.limit ?? 1000);
  }

  async listEscrows(query?: EscrowQuery): Promise<EscrowRecord[]> {
    return [...getStore().escrows.values()]
      .filter((escrow) => (query?.status ? escrow.status === query.status : true))
      .filter((escrow) =>
        query?.since ? escrow.createdAt.getTime() >= query.since.getTime() : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, query?.limit ?? 1000);
  }

  async countTasks(query?: TaskQuery): Promise<number> {
    return [...getStore().tasks.values()].filter(
      (task) => (query?.status ? task.status === query.status : true),
    ).length;
  }

  async beginJob(jobId: string): Promise<boolean> {
    const store = getStore();
    if (store.jobs.has(jobId)) return false;
    store.jobs.add(jobId);
    return true;
  }
}

let memoryRepository: MemoryRepository | null = null;

export function getMemoryRepository(): Repository {
  if (!memoryRepository) memoryRepository = new MemoryRepository();
  return memoryRepository;
}
