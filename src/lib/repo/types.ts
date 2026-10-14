import type { ReceiptStatus } from "../receipt-state";
import type { TaskStatus } from "../task-state";
import type { AgentStatus } from "../agent-state";
import type {
  DisputeStatus,
  EscrowStatus,
  NotificationStatus,
  PayoutStatus,
  ReportStatus,
  StakeStatus,
} from "../escrow-state";

export interface AgentRecord {
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
  status: AgentStatus;
  verified: boolean;
  notifyWebhookUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  webhookSecret?: string | null;
  ratingAverage?: number;
  ratingCount?: number;
  completedTaskCount?: number;
  stakedWei?: string;
  stakeStatus?: StakeStatus | null;
}

export interface TaskRecord {
  id: string;
  agentId: string;
  agentSlug: string;
  clientAddress: string;
  input: string;
  inputHash: string;
  status: TaskStatus;
  priceWei: string;
  currency: string;
  paymentTxHash: string | null;
  paymentVerifiedAt: Date | null;
  resultRef: string | null;
  resultHash: string | null;
  result: unknown | null;
  error: string | null;
  onchainTxHash: string | null;
  receiptStatus: ReceiptStatus;
  receiptError: string | null;
  receiptAttempts: number;
  notifyEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRecord {
  id: string;
  taskId: string;
  txHash: string;
  chainId: number;
  fromAddress: string;
  toAddress: string;
  amountWei: string;
  status: string;
  verifiedAt: Date;
}

export interface CreateAgentData {
  slug: string;
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  usageInstructions: string;
  endpoint: string;
  priceWei: string;
  ownerAddress: string;
  metadataUri?: string | null;
  featured?: boolean;
  webhookSecret?: string | null;
}

export interface ReviewRecord {
  id: string;
  taskId: string;
  agentId: string;
  reviewerAddress: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface CreateReviewData {
  taskId: string;
  agentId: string;
  reviewerAddress: string;
  rating: number;
  comment?: string | null;
}

export type AgentSort =
  | "name"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "rating"
  | "popularity";

export interface CreateTaskData {
  agentId: string;
  clientAddress: string;
  input: string;
  inputHash: string;
  priceWei: string;
  currency?: string;
  status?: TaskStatus;
  notifyEmail?: string | null;
}

export interface CreatePaymentData {
  taskId: string;
  txHash: string;
  chainId: number;
  fromAddress: string;
  toAddress: string;
  amountWei: string;
  status: string;
}

export interface UpdateTaskData {
  status?: TaskStatus;
  paymentTxHash?: string | null;
  paymentVerifiedAt?: Date | null;
  resultRef?: string | null;
  resultHash?: string | null;
  result?: unknown | null;
  error?: string | null;
  onchainTxHash?: string | null;
  receiptStatus?: ReceiptStatus;
  receiptError?: string | null;
  receiptAttempts?: number;
  notifyEmail?: string | null;
}

export interface AgentListFilter {
  search?: string;
  category?: string;
  capabilities?: string[];
  sort?: AgentSort;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface AgentPage {
  agents: AgentRecord[];
  total: number;
}

export interface UpdateAgentData {
  active?: boolean;
  status?: AgentStatus;
  verified?: boolean;
  metadataUri?: string | null;
  notifyWebhookUrl?: string | null;
}

export interface EscrowRecord {
  id: string;
  taskId: string;
  agentId: string;
  ownerAddress: string;
  clientAddress: string;
  amountWei: string;
  feeBps: number;
  feeWei: string;
  netWei: string;
  status: EscrowStatus;
  releaseTxHash: string | null;
  refundTxHash: string | null;
  releasedAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEscrowData {
  taskId: string;
  agentId: string;
  ownerAddress: string;
  clientAddress: string;
  amountWei: string;
  feeBps: number;
  feeWei: string;
  netWei: string;
}

export interface UpdateEscrowData {
  status?: EscrowStatus;
  releaseTxHash?: string | null;
  refundTxHash?: string | null;
  releasedAt?: Date | null;
  refundedAt?: Date | null;
}

export interface DisputeRecord {
  id: string;
  taskId: string;
  openedBy: string;
  reason: string;
  status: DisputeStatus;
  note: string | null;
  resolvedBy: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface CreateDisputeData {
  taskId: string;
  openedBy: string;
  reason: string;
}

export interface ReportRecord {
  id: string;
  agentId: string;
  reporterAddress: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  reviewedBy: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface CreateReportData {
  agentId: string;
  reporterAddress: string;
  reason: string;
  details?: string | null;
}

export interface StakeRecord {
  id: string;
  agentId: string;
  ownerAddress: string;
  amountWei: string;
  status: StakeStatus;
  txHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertStakeData {
  agentId: string;
  ownerAddress: string;
  amountWei: string;
  status?: StakeStatus;
  txHash?: string | null;
}

export interface PayoutRecord {
  id: string;
  ownerAddress: string;
  amountWei: string;
  status: PayoutStatus;
  txHash: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export interface CreatePayoutData {
  ownerAddress: string;
  amountWei: string;
  status?: PayoutStatus;
  txHash?: string | null;
  processedAt?: Date | null;
}

export interface NotificationRecord {
  id: string;
  taskId: string;
  event: string;
  channel: string;
  target: string;
  status: NotificationStatus;
  attempts: number;
  error: string | null;
  payload: unknown | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface CreateNotificationData {
  taskId: string;
  event: string;
  channel: string;
  target: string;
  payload?: unknown | null;
}

export interface Repository {
  listAgents(filter?: AgentListFilter): Promise<AgentRecord[]>;
  listAgentsPage(filter?: AgentListFilter): Promise<AgentPage>;
  countAgents(filter?: AgentListFilter): Promise<number>;
  getAgentBySlug(slug: string): Promise<AgentRecord | null>;
  getAgentById(id: string): Promise<AgentRecord | null>;
  listAgentsByOwner(ownerAddress: string): Promise<AgentRecord[]>;
  createAgent(data: CreateAgentData): Promise<AgentRecord>;
  updateAgent(id: string, patch: UpdateAgentData): Promise<AgentRecord>;

  createReview(data: CreateReviewData): Promise<ReviewRecord>;
  getReviewByTask(taskId: string): Promise<ReviewRecord | null>;
  listReviewsByAgent(agentId: string): Promise<ReviewRecord[]>;

  createTask(data: CreateTaskData): Promise<TaskRecord>;
  getTask(id: string): Promise<TaskRecord | null>;
  getTaskByPaymentTx(txHash: string): Promise<TaskRecord | null>;
  listTasksByClient(address: string): Promise<TaskRecord[]>;
  listStaleActiveTasks(olderThan: Date): Promise<TaskRecord[]>;
  listUnconfirmedReceiptTasks(): Promise<TaskRecord[]>;
  updateTask(id: string, patch: UpdateTaskData): Promise<TaskRecord>;

  createPayment(data: CreatePaymentData): Promise<PaymentRecord>;
  getPaymentByTask(taskId: string): Promise<PaymentRecord | null>;

  createEscrow(data: CreateEscrowData): Promise<EscrowRecord>;
  getEscrowByTask(taskId: string): Promise<EscrowRecord | null>;
  updateEscrow(taskId: string, patch: UpdateEscrowData): Promise<EscrowRecord>;
  listEscrowsByOwner(ownerAddress: string): Promise<EscrowRecord[]>;

  createDispute(data: CreateDisputeData): Promise<DisputeRecord>;
  getDispute(id: string): Promise<DisputeRecord | null>;
  getOpenDisputeByTask(taskId: string): Promise<DisputeRecord | null>;
  listDisputes(status?: DisputeStatus): Promise<DisputeRecord[]>;
  updateDispute(
    id: string,
    patch: {
      status?: DisputeStatus;
      note?: string | null;
      resolvedBy?: string | null;
      resolvedAt?: Date | null;
    },
  ): Promise<DisputeRecord>;

  createReport(data: CreateReportData): Promise<ReportRecord>;
  getReport(id: string): Promise<ReportRecord | null>;
  listReports(status?: ReportStatus): Promise<ReportRecord[]>;
  updateReport(
    id: string,
    patch: {
      status?: ReportStatus;
      reviewedBy?: string | null;
      resolvedAt?: Date | null;
    },
  ): Promise<ReportRecord>;

  upsertStake(data: UpsertStakeData): Promise<StakeRecord>;
  getStakeByAgent(agentId: string): Promise<StakeRecord | null>;

  createPayout(data: CreatePayoutData): Promise<PayoutRecord>;
  listPayoutsByOwner(ownerAddress: string): Promise<PayoutRecord[]>;
  sumProcessedPayouts(ownerAddress: string): Promise<string>;

  createNotification(data: CreateNotificationData): Promise<NotificationRecord>;
  markNotification(
    id: string,
    patch: {
      status: NotificationStatus;
      error?: string | null;
      sentAt?: Date | null;
      attempts?: number;
    },
  ): Promise<NotificationRecord>;
  listNotificationsByTask(taskId: string): Promise<NotificationRecord[]>;

  upsertWallet(address: string): Promise<void>;
  readonly kind: "prisma" | "memory";
}
