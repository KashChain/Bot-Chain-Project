import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const RPC_URL = process.env.BOTCHAIN_TESTNET_RPC_URL ?? "https://rpc.bohr.life";
const MAINNET_RPC_URL =
  process.env.BOTCHAIN_MAINNET_RPC_URL ?? "https://rpc.botchain.ai";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    botchainTestnet: {
      url: RPC_URL,
      chainId: 968,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    botchainMainnet: {
      url: MAINNET_RPC_URL,
      chainId: 677,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;
