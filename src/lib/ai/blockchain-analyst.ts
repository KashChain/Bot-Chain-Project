import { z } from "zod";
import { JsonRpcProvider, formatEther } from "ethers";
import { AppError } from "../errors";
import { getServerConfig } from "../config";
import { runStructured, type LlmMode } from "./llm";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_RE = /^0x[a-fA-F0-9]{64}$/;

const interpretationSchema = z.object({
  interpretation: z.string().min(1),
});

export interface BlockchainResult {
  kind: "blockchain";
  target: { type: "address" | "transaction"; value: string };
  question: string;
  verifiedFacts: string[];
  onchain: {
    chainId: number;
    fetchedAt: string;
    rpc: string;
    data: Record<string, string | number | boolean | null>;
  };
  interpretation: string;
  limitations: string[];
  disclaimer: string;
  mode: LlmMode;
  model: string | null;
}

const DISCLAIMER =
  "On-chain facts above were read directly from the BOT Chain RPC. The interpretation section is AI-generated and may be wrong. Nothing here is financial advice.";

function extractTarget(input: string): {
  type: "address" | "transaction";
  value: string;
  question: string;
} | null {
  const tokens = input.split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.replace(/[.,;)]+$/, "");
    if (TX_RE.test(cleaned)) {
      return {
        type: "transaction",
        value: cleaned,
        question: input,
      };
    }
    if (ADDRESS_RE.test(cleaned)) {
      return { type: "address", value: cleaned, question: input };
    }
  }
  return null;
}

async function fetchFacts(
  type: "address" | "transaction",
  value: string,
): Promise<{
  data: Record<string, string | number | boolean | null>;
  verifiedFacts: string[];
}> {
  const config = getServerConfig();
  const provider = new JsonRpcProvider(config.BOTCHAIN_TESTNET_RPC_URL, {
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    name: "botchain-testnet",
  });

  const withTimeout = <T>(promise: Promise<T>, label: string) =>
    Promise.race<T>([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new AppError(`RPC request timed out: ${label}`, 504, "RPC_TIMEOUT")),
          15_000,
        ),
      ),
    ]);

  try {
    const network = await withTimeout(provider.getNetwork(), "getNetwork");

    if (type === "address") {
      const [balanceWei, nonce, code] = await Promise.all([
        withTimeout(provider.getBalance(value), "getBalance"),
        withTimeout(provider.getTransactionCount(value), "getTransactionCount"),
        withTimeout(provider.getCode(value), "getCode"),
      ]);
      const isContract = code !== "0x" && code.length > 2;
      const data = {
        address: value,
        chainId: Number(network.chainId),
        balanceWei: balanceWei.toString(),
        balanceBOT: formatEther(balanceWei),
        transactionCount: nonce,
        isContract,
        codeSizeBytes: isContract ? Math.floor((code.length - 2) / 2) : 0,
      };
      const verifiedFacts = [
        `Address ${value} is on chain ${Number(network.chainId)}.`,
        `Balance: ${data.balanceBOT} BOT (${data.balanceWei} wei).`,
        `Outgoing transaction count (nonce): ${nonce}.`,
        isContract
          ? `This address has contract bytecode (${data.codeSizeBytes} bytes).`
          : "This address has no contract bytecode (externally owned account or unused).",
      ];
      return { data, verifiedFacts };
    }

    const [tx, receipt] = await Promise.all([
      withTimeout(provider.getTransaction(value), "getTransaction"),
      withTimeout(provider.getTransactionReceipt(value), "getTransactionReceipt"),
    ]);

    if (!tx) {
      throw new AppError(
        `Transaction ${value} was not found on BOT Chain testnet. It may be pending or the hash is incorrect. No data is being inferred.`,
        404,
        "TX_NOT_FOUND",
      );
    }

    const data = {
      hash: tx.hash,
      chainId: Number(network.chainId),
      from: tx.from,
      to: tx.to ?? null,
      valueWei: tx.value.toString(),
      valueBOT: formatEther(tx.value),
      blockNumber: tx.blockNumber ?? null,
      nonce: tx.nonce,
      status: receipt ? (receipt.status === 1 ? "success" : "failed") : "pending",
      gasUsed: receipt ? receipt.gasUsed.toString() : null,
      confirmations: receipt ? await withTimeout(receipt.confirmations(), "confirmations") : 0,
    };
    const verifiedFacts = [
      `Transaction ${tx.hash} is on chain ${Number(network.chainId)}.`,
      `From: ${tx.from}`,
      `To: ${tx.to ?? "(contract creation)"}`,
      `Value: ${data.valueBOT} BOT (${data.valueWei} wei).`,
      receipt
        ? `Status: ${data.status} (gas used ${data.gasUsed}).`
        : "Receipt not available yet: the transaction may still be pending.",
      tx.blockNumber ? `Included in block ${tx.blockNumber}.` : "No block yet (pending).",
    ];
    return { data, verifiedFacts };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Failed to read on-chain data: ${
        error instanceof Error ? error.message : "unknown RPC error"
      }. No on-chain facts were retrieved and no answer will be invented.`,
      502,
      "RPC_ERROR",
    );
  }
}

export async function runBlockchainAnalyst(
  input: string,
): Promise<{ result: BlockchainResult; mode: LlmMode; model: string | null }> {
  const target = extractTarget(input);
  if (!target) {
    throw new AppError(
      "Please include a BOT Chain address (0x...40 hex chars) or a transaction hash (0x...64 hex chars) in your request.",
      400,
      "NO_TARGET",
    );
  }

  const { data, verifiedFacts } = await fetchFacts(target.type, target.value);

  const { data: interpretation, mode, model } = await runStructured({
    system:
      "You explain blockchain data. The user will give you VERIFIED on-chain facts. Summarise them and answer the user's question using ONLY the provided facts. Do not invent transactions, addresses, prices, or history. If the question cannot be answered from the facts, say so explicitly.",
    prompt: `User question:\n"""${target.question}"""\n\nVerified on-chain facts (JSON):\n${JSON.stringify(
      data,
      null,
      2,
    )}`,
    schemaHint: `{ "interpretation": "a short explanation strictly grounded in the verified facts above" }`,
    parse: (raw) => interpretationSchema.parse(raw),
    demo: () => ({
      interpretation: `[DEMO MODE] Local explanation (no LLM configured). Based only on the verified facts listed above for ${target.type} ${target.value}. Configure LLM_API_KEY to enable a natural-language interpretation that answers: "${target.question.slice(
        0,
        120,
      )}".`,
    }),
  });

  return {
    result: {
      kind: "blockchain",
      target: { type: target.type, value: target.value },
      question: target.question,
      verifiedFacts,
      onchain: {
        chainId: data.chainId as number,
        fetchedAt: new Date().toISOString(),
        rpc: getServerConfig().BOTCHAIN_TESTNET_RPC_URL,
        data,
      },
      interpretation: interpretation.interpretation,
      limitations: [
        "Only public data available at the queried block height was read.",
        "Token balances, USD values and historical trends are not included unless explicitly listed in the verified facts.",
        "The interpretation is AI-generated and separate from the verified facts.",
      ],
      disclaimer: DISCLAIMER,
      mode,
      model,
    },
    mode,
    model,
  };
}
