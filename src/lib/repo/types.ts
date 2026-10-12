import type { TaskStatus } from "../task-state";

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
  createdAt: Date;
  updatedAt: Date;
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
}

export interface CreateTaskData {
  agentId: string;
  clientAddress: string;
  input: string;
  inputHash: string;
  priceWei: string;
  currency?: string;
  status?: TaskStatus;
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
}

export interface AgentListFilter {
  search?: string;
  category?: string;
  sort?: "name" | "price-asc" | "price-desc" | "newest";
  activeOnly?: boolean;
}

export interface Repository {
  listAgents(filter?: AgentListFilter): Promise<AgentRecord[]>;
  getAgentBySlug(slug: string): Promise<AgentRecord | null>;
  getAgentById(id: string): Promise<AgentRecord | null>;
  createAgent(data: CreateAgentData): Promise<AgentRecord>;

  createTask(data: CreateTaskData): Promise<TaskRecord>;
  getTask(id: string): Promise<TaskRecord | null>;
  getTaskByPaymentTx(txHash: string): Promise<TaskRecord | null>;
  listTasksByClient(address: string): Promise<TaskRecord[]>;
  updateTask(id: string, patch: UpdateTaskData): Promise<TaskRecord>;

  createPayment(data: CreatePaymentData): Promise<PaymentRecord>;
  getPaymentByTask(taskId: string): Promise<PaymentRecord | null>;

  upsertWallet(address: string): Promise<void>;
  readonly kind: "prisma" | "memory";
}
