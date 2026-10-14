import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const id = (value: string) => ethers.id(value);
const ZERO_ADDRESS = ethers.ZeroAddress;
const FEE_BPS = 250;
const BIGINT_FEE = 250n;

describe("AgentEscrow", () => {
  async function deployFixture() {
    const [operator, treasury, client, payTo, other] = await ethers.getSigners();
    const escrow = await ethers.deployContract("AgentEscrow", [
      treasury.address,
      FEE_BPS,
    ]);
    await escrow.waitForDeployment();
    return { escrow, operator, treasury, client, payTo, other };
  }

  describe("deployment", () => {
    it("sets owner, treasury and fee", async () => {
      const { escrow, operator, treasury } = await loadFixture(deployFixture);
      expect(await escrow.owner()).to.equal(operator.address);
      expect(await escrow.treasury()).to.equal(treasury.address);
      expect(await escrow.feeBps()).to.equal(BIGINT_FEE);
    });

    it("defaults the treasury to the owner when zero", async () => {
      const { operator } = await loadFixture(deployFixture);
      const escrow = await ethers.deployContract("AgentEscrow", [
        ZERO_ADDRESS,
        FEE_BPS,
      ]);
      await escrow.waitForDeployment();
      expect(await escrow.treasury()).to.equal(operator.address);
    });

    it("reverts when the fee exceeds 100%", async () => {
      const factory = await ethers.getContractFactory("AgentEscrow");
      await expect(
        factory.deploy(ZERO_ADDRESS, 10_001),
      ).to.be.revertedWithCustomError(factory, "InvalidFee");
    });
  });

  describe("lock", () => {
    it("splits the fee and stores the escrow", async () => {
      const { escrow, client, payTo } = await loadFixture(deployFixture);
      const taskId = id("task-1");
      const value = ethers.parseEther("1");

      await expect(
        escrow.connect(client).lock(taskId, payTo.address, { value }),
      )
        .to.emit(escrow, "EscrowLocked")
        .withArgs(
          taskId,
          client.address,
          payTo.address,
          value,
          (value * BigInt(FEE_BPS)) / 10_000n,
          value - (value * BigInt(FEE_BPS)) / 10_000n,
        );

      const entry = await escrow.getEscrow(taskId);
      expect(entry.client).to.equal(client.address);
      expect(entry.payTo).to.equal(payTo.address);
      expect(entry.amount).to.equal(value);
      expect(entry.fee).to.equal((value * BigInt(FEE_BPS)) / 10_000n);
      expect(entry.net).to.equal(value - (value * BigInt(FEE_BPS)) / 10_000n);
      expect(entry.status).to.equal(1n);
    });

    it("reverts on zero value", async () => {
      const { escrow, client, payTo } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).lock(id("t"), payTo.address),
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });

    it("reverts when a task is already locked", async () => {
      const { escrow, client, payTo } = await loadFixture(deployFixture);
      const taskId = id("task-1");
      await escrow.connect(client).lock(taskId, payTo.address, { value: 1n });
      await expect(
        escrow.connect(client).lock(taskId, payTo.address, { value: 1n }),
      ).to.be.revertedWithCustomError(escrow, "AlreadyLocked");
    });
  });

  describe("release", () => {
    it("pays the net to the agent and the fee to treasury", async () => {
      const { escrow, treasury, client, payTo } = await loadFixture(deployFixture);
      const taskId = id("task-1");
      const value = ethers.parseEther("1");
      await escrow.connect(client).lock(taskId, payTo.address, { value });

      const fee = (value * BigInt(FEE_BPS)) / 10_000n;
      const net = value - fee;
      const payToBefore = await ethers.provider.getBalance(payTo.address);
      const treasuryBefore = await ethers.provider.getBalance(treasury.address);

      await expect(escrow.release(taskId))
        .to.emit(escrow, "EscrowReleased")
        .withArgs(taskId, payTo.address, net);

      expect(await ethers.provider.getBalance(payTo.address)).to.equal(
        payToBefore + net,
      );
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(
        treasuryBefore + fee,
      );
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(
        0n,
      );
      const entry = await escrow.getEscrow(taskId);
      expect(entry.status).to.equal(2n);
    });

    it("only the owner can release", async () => {
      const { escrow, client, payTo, other } = await loadFixture(deployFixture);
      const taskId = id("task-1");
      await escrow.connect(client).lock(taskId, payTo.address, { value: 1n });
      await expect(
        escrow.connect(other).release(taskId),
      ).to.be.revertedWithCustomError(escrow, "NotOwner");
    });

    it("reverts releasing an unknown escrow", async () => {
      const { escrow } = await loadFixture(deployFixture);
      await expect(
        escrow.release(id("missing")),
      ).to.be.revertedWithCustomError(escrow, "NotLocked");
    });
  });

  describe("refund", () => {
    it("returns the full amount to the client", async () => {
      const { escrow, client, payTo } = await loadFixture(deployFixture);
      const taskId = id("task-1");
      const value = ethers.parseEther("1");
      await escrow.connect(client).lock(taskId, payTo.address, { value });

      const clientBefore = await ethers.provider.getBalance(client.address);
      await expect(escrow.refund(taskId))
        .to.emit(escrow, "EscrowRefunded")
        .withArgs(taskId, client.address, value);

      expect(await ethers.provider.getBalance(client.address)).to.equal(
        clientBefore + value,
      );
      const entry = await escrow.getEscrow(taskId);
      expect(entry.status).to.equal(3n);
    });

    it("only the owner can refund", async () => {
      const { escrow, client, payTo, other } = await loadFixture(deployFixture);
      const taskId = id("task-1");
      await escrow.connect(client).lock(taskId, payTo.address, { value: 1n });
      await expect(
        escrow.connect(other).refund(taskId),
      ).to.be.revertedWithCustomError(escrow, "NotOwner");
    });
  });

  describe("admin", () => {
    it("updates the fee and treasury", async () => {
      const { escrow, treasury, other } = await loadFixture(deployFixture);
      await expect(escrow.setFeeBps(100))
        .to.emit(escrow, "FeeUpdated")
        .withArgs(100);
      expect(await escrow.feeBps()).to.equal(100n);

      await expect(escrow.setTreasury(other.address))
        .to.emit(escrow, "TreasuryUpdated")
        .withArgs(other.address);
      expect(await escrow.treasury()).to.equal(other.address);
      void treasury;
    });

    it("rejects invalid fees and non-owner updates", async () => {
      const { escrow, other } = await loadFixture(deployFixture);
      await expect(
        escrow.setFeeBps(10_001),
      ).to.be.revertedWithCustomError(escrow, "InvalidFee");
      await expect(
        escrow.connect(other).setFeeBps(100),
      ).to.be.revertedWithCustomError(escrow, "NotOwner");
    });
  });
});
