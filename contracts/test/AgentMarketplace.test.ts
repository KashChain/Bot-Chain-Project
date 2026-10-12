import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const id = (value: string) => ethers.id(value);
const ZERO_ID = ethers.ZeroHash;
const ZERO_ADDRESS = ethers.ZeroAddress;

describe("AgentMarketplace", () => {
  async function deployFixture() {
    const [verifier, agentOwner, other, client] = await ethers.getSigners();
    const marketplace = await ethers.deployContract("AgentMarketplace", [
      verifier.address,
    ]);
    await marketplace.waitForDeployment();
    return { marketplace, verifier, agentOwner, other, client };
  }

  describe("deployment", () => {
    it("sets the verifier", async () => {
      const { marketplace, verifier } = await loadFixture(deployFixture);
      expect(await marketplace.verifier()).to.equal(verifier.address);
    });

    it("reverts when the verifier is the zero address", async () => {
      const factory = await ethers.getContractFactory("AgentMarketplace");
      await expect(factory.deploy(ZERO_ADDRESS)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddress",
      );
    });
  });

  describe("registerAgent", () => {
    it("registers an agent and emits an event", async () => {
      const { marketplace, agentOwner } = await loadFixture(deployFixture);
      const agentId = id("agent-1");

      await expect(
        marketplace.connect(agentOwner).registerAgent(agentId, "ipfs://meta"),
      )
        .to.emit(marketplace, "AgentRegistered")
        .withArgs(agentId, agentOwner.address, "ipfs://meta");

      expect(await marketplace.agentExists(agentId)).to.equal(true);
      const [owner, metadataUri, active, taskCount] = await marketplace.getAgent(
        agentId,
      );
      expect(owner).to.equal(agentOwner.address);
      expect(metadataUri).to.equal("ipfs://meta");
      expect(active).to.equal(true);
      expect(taskCount).to.equal(0n);
    });

    it("reverts on duplicate agent id", async () => {
      const { marketplace, agentOwner } = await loadFixture(deployFixture);
      const agentId = id("agent-1");
      await marketplace.connect(agentOwner).registerAgent(agentId, "a");
      await expect(
        marketplace.connect(agentOwner).registerAgent(agentId, "b"),
      ).to.be.revertedWithCustomError(marketplace, "AgentAlreadyRegistered");
    });

    it("reverts on zero id", async () => {
      const { marketplace } = await loadFixture(deployFixture);
      await expect(
        marketplace.registerAgent(ZERO_ID, "meta"),
      ).to.be.revertedWithCustomError(marketplace, "ZeroId");
    });

    it("reverts when metadata is too long", async () => {
      const { marketplace } = await loadFixture(deployFixture);
      const longUri = "x".repeat(513);
      await expect(
        marketplace.registerAgent(id("agent-long"), longUri),
      ).to.be.revertedWithCustomError(marketplace, "MetadataTooLong");
    });
  });

  describe("updateAgent", () => {
    it("allows the owner to update metadata and availability", async () => {
      const { marketplace, agentOwner } = await loadFixture(deployFixture);
      const agentId = id("agent-1");
      await marketplace.connect(agentOwner).registerAgent(agentId, "a");

      await expect(
        marketplace.connect(agentOwner).updateAgent(agentId, "b", false),
      )
        .to.emit(marketplace, "AgentUpdated")
        .withArgs(agentId, "b", false);

      const [, metadataUri, active] = await marketplace.getAgent(agentId);
      expect(metadataUri).to.equal("b");
      expect(active).to.equal(false);
    });

    it("reverts when a non-owner updates", async () => {
      const { marketplace, agentOwner, other } = await loadFixture(deployFixture);
      const agentId = id("agent-1");
      await marketplace.connect(agentOwner).registerAgent(agentId, "a");
      await expect(
        marketplace.connect(other).updateAgent(agentId, "b", true),
      ).to.be.revertedWithCustomError(marketplace, "NotAgentOwner");
    });

    it("reverts for unknown agent", async () => {
      const { marketplace } = await loadFixture(deployFixture);
      await expect(
        marketplace.updateAgent(id("missing"), "b", true),
      ).to.be.revertedWithCustomError(marketplace, "AgentNotFound");
    });
  });

  describe("createTask", () => {
    async function withAgent() {
      const base = await deployFixture();
      const agentId = id("agent-1");
      await base.marketplace
        .connect(base.agentOwner)
        .registerAgent(agentId, "meta");
      return { ...base, agentId };
    }

    it("creates a task as verifier and increments agent task count", async () => {
      const { marketplace, verifier, agentOwner, client, agentId } =
        await loadFixture(withAgent);
      const taskId = id("task-1");

      await expect(
        marketplace
          .connect(verifier)
          .createTask(taskId, agentId, client.address, 100n, agentOwner.address),
      )
        .to.emit(marketplace, "TaskCreated")
        .withArgs(taskId, agentId, client.address, 100n, agentOwner.address);

      const task = await marketplace.getTask(taskId);
      expect(task.agentId).to.equal(agentId);
      expect(task.client).to.equal(client.address);
      expect(task.amount).to.equal(100n);
      expect(task.status).to.equal(1n);

      const [, , , taskCount] = await marketplace.getAgent(agentId);
      expect(taskCount).to.equal(1n);
    });

    it("reverts when called by a non-verifier", async () => {
      const { marketplace, other, agentOwner, client, agentId } =
        await loadFixture(withAgent);
      await expect(
        marketplace
          .connect(other)
          .createTask(
            id("task-1"),
            agentId,
            client.address,
            100n,
            agentOwner.address,
          ),
      ).to.be.revertedWithCustomError(marketplace, "NotVerifier");
    });

    it("reverts on duplicate task id", async () => {
      const { marketplace, verifier, agentOwner, client, agentId } =
        await loadFixture(withAgent);
      const taskId = id("task-1");
      await marketplace
        .connect(verifier)
        .createTask(taskId, agentId, client.address, 100n, agentOwner.address);
      await expect(
        marketplace
          .connect(verifier)
          .createTask(taskId, agentId, client.address, 100n, agentOwner.address),
      ).to.be.revertedWithCustomError(marketplace, "TaskAlreadyExists");
    });

    it("reverts for unknown agent", async () => {
      const { marketplace, verifier, agentOwner, client } =
        await loadFixture(deployFixture);
      await expect(
        marketplace
          .connect(verifier)
          .createTask(
            id("task-1"),
            id("ghost"),
            client.address,
            100n,
            agentOwner.address,
          ),
      ).to.be.revertedWithCustomError(marketplace, "AgentNotFound");
    });

    it("reverts for an inactive agent", async () => {
      const { marketplace, verifier, agentOwner, client, agentId } =
        await loadFixture(withAgent);
      await marketplace.connect(agentOwner).updateAgent(agentId, "meta", false);
      await expect(
        marketplace
          .connect(verifier)
          .createTask(
            id("task-1"),
            agentId,
            client.address,
            100n,
            agentOwner.address,
          ),
      ).to.be.revertedWithCustomError(marketplace, "AgentInactive");
    });

    it("reverts on invalid amount or zero client", async () => {
      const { marketplace, verifier, agentOwner, client, agentId } =
        await loadFixture(withAgent);
      await expect(
        marketplace
          .connect(verifier)
          .createTask(id("t"), agentId, client.address, 0n, agentOwner.address),
      ).to.be.revertedWithCustomError(marketplace, "InvalidAmount");
      await expect(
        marketplace
          .connect(verifier)
          .createTask(id("t"), agentId, ZERO_ADDRESS, 1n, agentOwner.address),
      ).to.be.revertedWithCustomError(marketplace, "ZeroAddress");
    });
  });

  describe("task lifecycle and state machine", () => {
    async function withTask() {
      const base = await loadFixture(deployFixture);
      const agentId = id("agent-1");
      const taskId = id("task-1");
      await base.marketplace
        .connect(base.agentOwner)
        .registerAgent(agentId, "meta");
      await base.marketplace
        .connect(base.verifier)
        .createTask(
          taskId,
          agentId,
          base.client.address,
          100n,
          base.agentOwner.address,
        );
      return { ...base, agentId, taskId };
    }

    it("marks a created task paid", async () => {
      const { marketplace, verifier, taskId } = await loadFixture(withTask);
      const paymentRef = id("payment-1");
      await expect(marketplace.connect(verifier).markPaid(taskId, paymentRef))
        .to.emit(marketplace, "TaskPaid")
        .withArgs(taskId, paymentRef);
      const task = await marketplace.getTask(taskId);
      expect(task.status).to.equal(2n);
      expect(task.paymentRef).to.equal(paymentRef);
    });

    it("reverts markPaid when not verifier", async () => {
      const { marketplace, other, taskId } = await loadFixture(withTask);
      await expect(
        marketplace.connect(other).markPaid(taskId, id("p")),
      ).to.be.revertedWithCustomError(marketplace, "NotVerifier");
    });

    it("reverts markPaid on invalid transition", async () => {
      const { marketplace, verifier, taskId } = await loadFixture(withTask);
      await marketplace.connect(verifier).markPaid(taskId, id("p"));
      await expect(
        marketplace.connect(verifier).markPaid(taskId, id("p2")),
      ).to.be.revertedWithCustomError(marketplace, "InvalidState");
    });

    it("completes a paid task", async () => {
      const { marketplace, verifier, taskId } = await loadFixture(withTask);
      await marketplace.connect(verifier).markPaid(taskId, id("p"));
      const resultHash = id("result-1");
      await expect(marketplace.connect(verifier).completeTask(taskId, resultHash))
        .to.emit(marketplace, "TaskCompleted")
        .withArgs(taskId, resultHash);
      const task = await marketplace.getTask(taskId);
      expect(task.status).to.equal(3n);
      expect(task.resultHash).to.equal(resultHash);
    });

    it("reverts completeTask before payment", async () => {
      const { marketplace, verifier, taskId } = await loadFixture(withTask);
      await expect(
        marketplace.connect(verifier).completeTask(taskId, id("r")),
      ).to.be.revertedWithCustomError(marketplace, "InvalidState");
    });

    it("reverts double completion", async () => {
      const { marketplace, verifier, taskId } = await loadFixture(withTask);
      await marketplace.connect(verifier).markPaid(taskId, id("p"));
      await marketplace.connect(verifier).completeTask(taskId, id("r"));
      await expect(
        marketplace.connect(verifier).completeTask(taskId, id("r2")),
      ).to.be.revertedWithCustomError(marketplace, "InvalidState");
    });

    it("fails a created task and blocks later completion", async () => {
      const { marketplace, verifier, taskId } = await loadFixture(withTask);
      await expect(marketplace.connect(verifier).failTask(taskId)).to.emit(
        marketplace,
        "TaskFailed",
      );
      await expect(
        marketplace.connect(verifier).completeTask(taskId, id("r")),
      ).to.be.revertedWithCustomError(marketplace, "InvalidState");
    });

    it("reverts failTask on a completed task", async () => {
      const { marketplace, verifier, taskId } = await loadFixture(withTask);
      await marketplace.connect(verifier).markPaid(taskId, id("p"));
      await marketplace.connect(verifier).completeTask(taskId, id("r"));
      await expect(
        marketplace.connect(verifier).failTask(taskId),
      ).to.be.revertedWithCustomError(marketplace, "InvalidState");
    });

    it("reverts lifecycle calls for unknown tasks", async () => {
      const { marketplace, verifier } = await loadFixture(withTask);
      await expect(
        marketplace.connect(verifier).markPaid(id("ghost"), id("p")),
      ).to.be.revertedWithCustomError(marketplace, "TaskNotFound");
      await expect(
        marketplace.connect(verifier).failTask(id("ghost")),
      ).to.be.revertedWithCustomError(marketplace, "TaskNotFound");
    });

    it("reports existence via taskExists", async () => {
      const { marketplace, taskId } = await loadFixture(withTask);
      expect(await marketplace.taskExists(taskId)).to.equal(true);
      expect(await marketplace.taskExists(id("nope"))).to.equal(false);
    });
  });
});
