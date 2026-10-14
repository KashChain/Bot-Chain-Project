import {
  Contract,
  JsonRpcProvider,
  Wallet,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { getServerConfig } from "./config";

const ABI = [
  "function agentExists(bytes32 agentId) view returns (bool)",
  "function taskExists(bytes32 taskId) view returns (bool)",
  "function getTask(bytes32 taskId) view returns (bytes32 agentId, address client, uint256 amount, address payTo, bytes32 paymentRef, bytes32 resultHash, uint8 status)",
  "function registerAgent(bytes32 agentId, string metadataUri)",
  "function createTask(bytes32 taskId, bytes32 agentId, address client, uint256 amount, address payTo)",
  "function markPaid(bytes32 taskId, bytes32 paymentRef)",
  "function completeTask(bytes32 taskId, bytes32 resultHash)",
];

const STATUS_NAMES = ["None", "Created", "Paid", "Completed", "Failed"];

export function id32(value: string): string {
  return keccak256(toUtf8Bytes(value));
}

export interface OnchainReceiptResult {
  attempted: boolean;
  skippedReason?: string;
  txHashes: string[];
  status?: string;
  confirmed: boolean;
  error?: string;
}

const MAX_ERROR_LENGTH = 300;

function sanitizeError(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unknown on-chain receipt error";
  return message.replace(/\s+/g, " ").slice(0, MAX_ERROR_LENGTH);
}

export function isOnchainReceiptConfigured(): boolean {
  const config = getServerConfig();
  return Boolean(
    config.AGENT_MARKETPLACE_CONTRACT_ADDRESS &&
      process.env.DEPLOYER_PRIVATE_KEY,
  );
}

export function isContractAddressConfigured(): boolean {
  return Boolean(getServerConfig().AGENT_MARKETPLACE_CONTRACT_ADDRESS);
}

export function isSignerConfigured(): boolean {
  return Boolean(
    getServerConfig().AGENT_MARKETPLACE_CONTRACT_ADDRESS &&
      process.env.DEPLOYER_PRIVATE_KEY,
  );
}

export function getRpcProvider(): JsonRpcProvider {
  const config = getServerConfig();
  return new JsonRpcProvider(config.BOTCHAIN_TESTNET_RPC_URL, {
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    name: "botchain-testnet",
  });
}

export function getSignerWallet(): Wallet {
  const config = getServerConfig();
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!config.AGENT_MARKETPLACE_CONTRACT_ADDRESS || !privateKey) {
    throw new Error("Signing key is not configured");
  }
  return new Wallet(privateKey, getRpcProvider());
}

/** Whether a deployer/operator key is available to sign transactions. */
export function isDeployerKeyConfigured(): boolean {
  return Boolean(process.env.DEPLOYER_PRIVATE_KEY);
}

/**
 * Signer wallet for operator transactions that are independent of the
 * marketplace registry contract (e.g. AgentEscrow settlement).
 */
export function getDeployerWallet(): Wallet {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not configured");
  }
  return new Wallet(privateKey, getRpcProvider());
}

function getWallet(): Wallet {
  return getSignerWallet();
}

function readStatus(task: unknown[]): number {
  return Number(task[6] ?? task[task.length - 1]);
}

export async function syncTaskOnchain(params: {
  taskId: string;
  agentId: string;
  client: string;
  amountWei: string;
  payTo: string;
  paymentRef: string;
  resultHash: string;
}): Promise<OnchainReceiptResult> {
  const config = getServerConfig();
  if (!isOnchainReceiptConfigured()) {
    return {
      attempted: false,
      skippedReason:
        "On-chain receipt recording skipped: set AGENT_MARKETPLACE_CONTRACT_ADDRESS and DEPLOYER_PRIVATE_KEY to enable it.",
      txHashes: [],
      confirmed: false,
    };
  }

  const txHashes: string[] = [];
  try {
    const wallet = getWallet();
    const contract = new Contract(
      config.AGENT_MARKETPLACE_CONTRACT_ADDRESS as string,
      ABI,
      wallet,
    );
    const taskId = id32(params.taskId);

    // Idempotent step 1: only create when the task does not already exist.
    const exists = (await contract.taskExists(taskId)) as boolean;
    if (!exists) {
      const tx = await contract.createTask(
        taskId,
        id32(params.agentId),
        params.client,
        BigInt(params.amountWei),
        params.payTo,
      );
      const receipt = await tx.wait();
      txHashes.push(receipt?.hash ?? tx.hash);
    }

    // Idempotent step 2: mark paid only when the task is still Created.
    let status = readStatus((await contract.getTask(taskId)) as unknown[]);
    if (status === 1) {
      const tx = await contract.markPaid(taskId, params.paymentRef);
      const receipt = await tx.wait();
      txHashes.push(receipt?.hash ?? tx.hash);
      status = readStatus((await contract.getTask(taskId)) as unknown[]);
    }

    // Idempotent step 3: complete only when the task is Paid.
    if (status === 2) {
      const tx = await contract.completeTask(taskId, params.resultHash);
      const receipt = await tx.wait();
      txHashes.push(receipt?.hash ?? tx.hash);
      status = readStatus((await contract.getTask(taskId)) as unknown[]);
    }

    // Verify the on-chain record matches what we computed off-chain.
    const finalTask = (await contract.getTask(taskId)) as unknown[];
    const finalStatus = readStatus(finalTask);
    const finalResultHash = String(finalTask[5] ?? "").toLowerCase();
    const expectedHash = params.resultHash.toLowerCase();

    if (finalStatus !== 3) {
      return {
        attempted: true,
        txHashes,
        status: STATUS_NAMES[finalStatus] ?? `Unknown(${finalStatus})`,
        confirmed: false,
        error: `On-chain task status is ${
          STATUS_NAMES[finalStatus] ?? finalStatus
        }, expected Completed`,
      };
    }

    if (finalResultHash !== expectedHash) {
      return {
        attempted: true,
        txHashes,
        status: "Completed",
        confirmed: false,
        error: "On-chain result hash does not match the computed hash",
      };
    }

    return {
      attempted: true,
      txHashes,
      status: "Completed",
      confirmed: true,
    };
  } catch (error) {
    return {
      attempted: true,
      txHashes,
      confirmed: false,
      error: sanitizeError(error),
    };
  }
}
