import { Contract } from "ethers";
import { getServerConfig } from "./config";
import {
  getRpcProvider,
  getSignerWallet,
  id32,
  isContractAddressConfigured,
  isSignerConfigured,
} from "./contract";
import { AppError, ConfigurationError } from "./errors";

export interface AgentRegistryInput {
  slug: string;
  metadataUri: string | null;
}

const REGISTRY_ABI = [
  "function verifier() view returns (address)",
  "function agentExists(bytes32 agentId) view returns (bool)",
  "function getAgent(bytes32 agentId) view returns (address owner, string metadataUri, bool active, uint256 taskCount)",
  "function registerAgent(bytes32 agentId, string metadataUri)",
  "function updateAgent(bytes32 agentId, string metadataUri, bool active)",
];

export interface OnchainAgentState {
  configured: boolean;
  slug: string;
  agentId: string;
  exists: boolean;
  active: boolean;
  owner: string | null;
  metadataUri: string | null;
  taskCount: number | null;
  verifier: string | null;
  signerAddress: string | null;
  signerIsOwner: boolean | null;
  signerIsVerifier: boolean | null;
  error: string | null;
}

export interface RegisterAgentResult {
  slug: string;
  agentId: string;
  alreadyRegistered: boolean;
  txHashes: string[];
  state: OnchainAgentState;
}

function readContract(): Contract {
  return new Contract(
    getServerConfig().AGENT_MARKETPLACE_CONTRACT_ADDRESS as string,
    REGISTRY_ABI,
    getRpcProvider(),
  );
}

function sanitizeError(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unknown registry error";
  return message.replace(/\s+/g, " ").slice(0, 300);
}

function lower(value: string | null | undefined): string | null {
  return typeof value === "string" ? value.toLowerCase() : null;
}

/**
 * Read-only check of an agent's on-chain registration. Uses the RPC provider
 * only and never signs. Safe to call from request handlers; every failure is
 * reported in the returned `error` field rather than thrown.
 */
export async function getOnchainAgentState(
  slug: string,
): Promise<OnchainAgentState> {
  const agentId = id32(slug);
  const base: OnchainAgentState = {
    configured: isContractAddressConfigured(),
    slug,
    agentId,
    exists: false,
    active: false,
    owner: null,
    metadataUri: null,
    taskCount: null,
    verifier: null,
    signerAddress: null,
    signerIsOwner: null,
    signerIsVerifier: null,
    error: null,
  };

  if (!isContractAddressConfigured()) {
    return {
      ...base,
      error:
        "On-chain registry not configured (AGENT_MARKETPLACE_CONTRACT_ADDRESS)",
    };
  }

  try {
    const contract = readContract();
    const [verifier, exists] = (await Promise.all([
      contract.verifier() as Promise<string>,
      contract.agentExists(agentId) as Promise<boolean>,
    ])) as [string, boolean];

    let signerAddress: string | null = null;
    if (isSignerConfigured()) {
      signerAddress = getSignerWallet().address;
    }

    if (!exists) {
      return {
        ...base,
        verifier,
        signerAddress,
        signerIsVerifier: signerAddress
          ? lower(signerAddress) === lower(verifier)
          : null,
      };
    }

    const [owner, metadataUri, active, taskCount] = (await contract.getAgent(
      agentId,
    )) as [string, string, boolean, bigint];

    return {
      ...base,
      verifier,
      exists: true,
      active,
      owner,
      metadataUri,
      taskCount: Number(taskCount),
      signerAddress,
      signerIsOwner: signerAddress ? lower(signerAddress) === lower(owner) : null,
      signerIsVerifier: signerAddress
        ? lower(signerAddress) === lower(verifier)
        : null,
    };
  } catch (error) {
    return { ...base, error: sanitizeError(error) };
  }
}

/**
 * Admin-only (server/CLI) registration. Idempotent:
 *  - registers the agent when it does not exist yet;
 *  - reactivates/syncs metadata when it exists and the signer is the owner.
 * Never called from a public request path.
 */
export async function registerAgentOnchain(
  agent: AgentRegistryInput,
): Promise<RegisterAgentResult> {
  if (!isSignerConfigured()) {
    throw new ConfigurationError(
      "Registering agents on-chain requires AGENT_MARKETPLACE_CONTRACT_ADDRESS and DEPLOYER_PRIVATE_KEY",
    );
  }

  const wallet = getSignerWallet();
  if (!wallet.provider) {
    throw new AppError("Signer has no provider", 503, "NOT_CONFIGURED");
  }

  const contract = new Contract(
    getServerConfig().AGENT_MARKETPLACE_CONTRACT_ADDRESS as string,
    REGISTRY_ABI,
    wallet,
  );
  const agentId = id32(agent.slug);
  const metadataUri = agent.metadataUri ?? "";
  const txHashes: string[] = [];

  const exists = (await contract.agentExists(agentId)) as boolean;

  if (!exists) {
    const tx = await contract.registerAgent(agentId, metadataUri);
    const receipt = await tx.wait();
    txHashes.push(receipt?.hash ?? tx.hash);
  } else {
    const [owner, currentMetadataUri, active] = (await contract.getAgent(
      agentId,
    )) as [string, string, boolean, bigint];
    const isOwner = lower(owner) === lower(wallet.address);
    if (isOwner && (!active || currentMetadataUri !== metadataUri)) {
      const tx = await contract.updateAgent(agentId, metadataUri, true);
      const receipt = await tx.wait();
      txHashes.push(receipt?.hash ?? tx.hash);
    }
  }

  const state = await getOnchainAgentState(agent.slug);
  if (!state.exists || !state.active) {
    throw new AppError(
      state.error
        ? `Agent registration could not be verified: ${state.error}`
        : "Agent registration could not be verified on-chain",
      502,
      "REGISTRY_VERIFICATION_FAILED",
    );
  }

  return { slug: agent.slug, agentId, alreadyRegistered: exists, txHashes, state };
}
