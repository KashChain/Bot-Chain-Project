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
}

export function isOnchainReceiptConfigured(): boolean {
  const config = getServerConfig();
  return Boolean(
    config.AGENT_MARKETPLACE_CONTRACT_ADDRESS &&
      process.env.DEPLOYER_PRIVATE_KEY,
  );
}

function getWallet(): Wallet {
  const config = getServerConfig();
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!config.AGENT_MARKETPLACE_CONTRACT_ADDRESS || !privateKey) {
    throw new Error("On-chain receipt recording is not configured");
  }
  const provider = new JsonRpcProvider(config.BOTCHAIN_TESTNET_RPC_URL, {
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    name: "botchain-testnet",
  });
  return new Wallet(privateKey, provider);
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
    };
  }

  const wallet = getWallet();
  const contract = new Contract(
    config.AGENT_MARKETPLACE_CONTRACT_ADDRESS as string,
    ABI,
    wallet,
  );
  const taskId = id32(params.taskId);
  const txHashes: string[] = [];

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

  const task = (await contract.getTask(taskId)) as unknown[];
  let status = Number(task[6] ?? task[task.length - 1]);

  if (status === 1) {
    const tx = await contract.markPaid(taskId, params.paymentRef);
    const receipt = await tx.wait();
    txHashes.push(receipt?.hash ?? tx.hash);
    status = 2;
  }

  if (status === 2) {
    const tx = await contract.completeTask(taskId, params.resultHash);
    const receipt = await tx.wait();
    txHashes.push(receipt?.hash ?? tx.hash);
    status = 3;
  }

  return {
    attempted: true,
    txHashes,
    status: STATUS_NAMES[status] ?? `Unknown(${status})`,
  };
}
