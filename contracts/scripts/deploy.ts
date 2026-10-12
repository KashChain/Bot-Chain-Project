import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error(
      "No signer available. Set DEPLOYER_PRIVATE_KEY in the repo-root .env before deploying to BOT Chain testnet.",
    );
  }

  const verifier = process.env.VERIFIER_ADDRESS ?? deployer.address;
  const net = await ethers.provider.getNetwork();

  console.log(`Network:  ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Verifier: ${verifier}`);

  const marketplace = await ethers.deployContract("AgentMarketplace", [verifier]);
  await marketplace.waitForDeployment();
  const address = await marketplace.getAddress();

  console.log("");
  console.log("AgentMarketplace deployed to:", address);
  console.log("");
  console.log("Add this to your repo-root .env:");
  console.log(`AGENT_MARKETPLACE_CONTRACT_ADDRESS=${address}`);
  console.log("");
  if (network.name === "botchainTestnet") {
    console.log(`Explorer: https://scan.bohr.life/address/${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
