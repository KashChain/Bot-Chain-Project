import { ethers, network } from "hardhat";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function firstAddress(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && ADDRESS_PATTERN.test(trimmed)) return trimmed;
  }
  return null;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer available. Set DEPLOYER_PRIVATE_KEY in the repo-root .env before deploying to BOT Chain testnet.",
    );
  }

  const treasury =
    firstAddress(
      process.env.PLATFORM_TREASURY_ADDRESS,
      process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT,
    ) ?? deployer.address;

  const parsedFee = Number.parseInt(process.env.PLATFORM_FEE_BPS ?? "250", 10);
  const feeBps =
    Number.isFinite(parsedFee) && parsedFee >= 0 && parsedFee <= 10_000
      ? parsedFee
      : 250;

  const net = await ethers.provider.getNetwork();

  console.log(`Network:  ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Fee bps:  ${feeBps}`);

  const escrow = await ethers.deployContract("AgentEscrow", [treasury, feeBps]);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  console.log("");
  console.log("AgentEscrow deployed to:", address);
  console.log("");
  console.log("Add this to your repo-root .env:");
  console.log("ESCROW_MODE=contract");
  console.log(`ESCROW_CONTRACT_ADDRESS=${address}`);
  console.log("");
  if (network.name === "botchainTestnet") {
    console.log(`Explorer: https://scan.bohr.life/address/${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
