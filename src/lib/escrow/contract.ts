import { Contract, type Provider, type Signer } from "ethers";
import { getServerConfig } from "../config";
import {
  getDeployerWallet,
  getRpcProvider,
  id32,
  isDeployerKeyConfigured,
} from "../contract";
import { ConfigurationError } from "../errors";

/** Status enum mirrored from contracts/contracts/AgentEscrow.sol. */
export const ESCROW_STATUS = {
  None: 0,
  Locked: 1,
  Released: 2,
  Refunded: 3,
} as const;

export type EscrowStatusName = keyof typeof ESCROW_STATUS;

const ESCROW_ABI = [
  "function lock(bytes32 taskId, address payTo) payable",
  "function release(bytes32 taskId)",
  "function refund(bytes32 taskId)",
  "function getEscrow(bytes32 taskId) view returns (address client, address payTo, uint256 amount, uint256 fee, uint256 net, uint64 lockedAt, uint8 status)",
  "function feeBps() view returns (uint16)",
  "function treasury() view returns (address)",
];

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function getEscrowContractAddress(): string | null {
  const address = getServerConfig().ESCROW_CONTRACT_ADDRESS;
  return address && ADDRESS_PATTERN.test(address) ? address : null;
}

/**
 * True when the on-chain escrow path can be used: `ESCROW_MODE=contract`, a
 * valid contract address and a funded operator key.
 */
export function isEscrowContractConfigured(): boolean {
  return (
    getServerConfig().ESCROW_MODE === "contract" &&
    Boolean(getEscrowContractAddress()) &&
    isDeployerKeyConfigured()
  );
}

function getContract(signerOrProvider: Signer | Provider): Contract {
  const address = getEscrowContractAddress();
  if (!address) {
    throw new ConfigurationError(
      "ESCROW_CONTRACT_ADDRESS is not configured; on-chain escrow is unavailable",
    );
  }
  return new Contract(address, ESCROW_ABI, signerOrProvider);
}

export function statusName(status: number): EscrowStatusName | "Unknown" {
  return (
    (Object.keys(ESCROW_STATUS) as EscrowStatusName[]).find(
      (key) => ESCROW_STATUS[key] === status,
    ) ?? "Unknown"
  );
}

export async function readEscrowStatus(taskId: string): Promise<number> {
  const contract = getContract(getRpcProvider());
  const entry = (await contract.getEscrow(id32(taskId))) as unknown[];
  return Number(entry[6] ?? 0);
}

export interface OnchainEscrowResult {
  attempted: boolean;
  skipped: boolean;
  txHash: string | null;
  status: number;
  error?: string;
}

function sanitize(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unknown on-chain escrow error";
  return message.replace(/\s+/g, " ").slice(0, 300);
}

/**
 * Lock `amountWei` for a task on-chain. Idempotent: if the task is already
 * locked (or settled) the existing state is reported and no transaction is
 * sent. Never throws — callers record the outcome and let the cron job
 * reconcile any failure.
 */
export async function lockEscrowOnchain(params: {
  taskId: string;
  payTo: string;
  amountWei: string;
}): Promise<OnchainEscrowResult> {
  const amount = BigInt(params.amountWei);
  if (amount <= 0n) {
    return {
      attempted: false,
      skipped: true,
      txHash: null,
      status: ESCROW_STATUS.None,
    };
  }

  try {
    const contract = getContract(getDeployerWallet());
    const taskId = id32(params.taskId);
    const existing = Number(
      ((await contract.getEscrow(taskId)) as unknown[])[6] ?? 0,
    );
    if (existing !== ESCROW_STATUS.None) {
      return {
        attempted: false,
        skipped: true,
        txHash: null,
        status: existing,
      };
    }

    const tx = await contract.lock(taskId, params.payTo, { value: amount });
    const receipt = await tx.wait();
    return {
      attempted: true,
      skipped: false,
      txHash: receipt?.hash ?? tx.hash,
      status: ESCROW_STATUS.Locked,
    };
  } catch (error) {
    return {
      attempted: true,
      skipped: false,
      txHash: null,
      status: ESCROW_STATUS.None,
      error: sanitize(error),
    };
  }
}

/** Release a locked escrow (splits fee to treasury, net to the agent owner). */
export async function releaseEscrowOnchain(
  taskId: string,
): Promise<OnchainEscrowResult> {
  try {
    const contract = getContract(getDeployerWallet());
    const taskIdHash = id32(taskId);
    const status = Number(
      ((await contract.getEscrow(taskIdHash)) as unknown[])[6] ?? 0,
    );
    if (status === ESCROW_STATUS.Released) {
      return {
        attempted: false,
        skipped: true,
        txHash: null,
        status,
      };
    }
    if (status !== ESCROW_STATUS.Locked) {
      return {
        attempted: false,
        skipped: true,
        txHash: null,
        status,
        error:
          status === ESCROW_STATUS.None
            ? "Escrow is not locked on-chain"
            : "Escrow is not releasable on-chain",
      };
    }

    const tx = await contract.release(taskIdHash);
    const receipt = await tx.wait();
    return {
      attempted: true,
      skipped: false,
      txHash: receipt?.hash ?? tx.hash,
      status: ESCROW_STATUS.Released,
    };
  } catch (error) {
    return {
      attempted: true,
      skipped: false,
      txHash: null,
      status: ESCROW_STATUS.Locked,
      error: sanitize(error),
    };
  }
}

/** Refund a locked escrow back to the client. */
export async function refundEscrowOnchain(
  taskId: string,
): Promise<OnchainEscrowResult> {
  try {
    const contract = getContract(getDeployerWallet());
    const taskIdHash = id32(taskId);
    const status = Number(
      ((await contract.getEscrow(taskIdHash)) as unknown[])[6] ?? 0,
    );
    if (status === ESCROW_STATUS.Refunded) {
      return {
        attempted: false,
        skipped: true,
        txHash: null,
        status,
      };
    }
    if (status !== ESCROW_STATUS.Locked) {
      return {
        attempted: false,
        skipped: true,
        txHash: null,
        status,
        error:
          status === ESCROW_STATUS.None
            ? "Escrow is not locked on-chain"
            : "Escrow is not refundable on-chain",
      };
    }

    const tx = await contract.refund(taskIdHash);
    const receipt = await tx.wait();
    return {
      attempted: true,
      skipped: false,
      txHash: receipt?.hash ?? tx.hash,
      status: ESCROW_STATUS.Refunded,
    };
  } catch (error) {
    return {
      attempted: true,
      skipped: false,
      txHash: null,
      status: ESCROW_STATUS.Locked,
      error: sanitize(error),
    };
  }
}
