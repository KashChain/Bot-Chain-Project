// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentEscrow
/// @notice Optional custodial escrow for the AgentHub AI marketplace on BOT
///         Chain. Funds are held per task and released to the agent owner
///         (minus a platform fee) or refunded to the client.
/// @dev DEPLOYMENT IS NOT ENABLED BY DEFAULT. The backend defaults to
///      `ESCROW_MODE=mock` (a ledger mirroring these states). Only when the
///      operator explicitly deploys this contract and sets
///      `ESCROW_MODE=contract` + `ESCROW_CONTRACT_ADDRESS` does the on-chain
///      path become active. The contract never stores prompts, keys or
///      outputs — only task ids, addresses, amounts and status.
contract AgentEscrow {
    enum Status {
        None,
        Locked,
        Released,
        Refunded
    }

    struct Escrow {
        address client;
        address payTo;
        uint256 amount;
        uint256 fee;
        uint256 net;
        uint64 lockedAt;
        Status status;
    }

    address public owner;
    address public treasury;
    uint16 public feeBps;
    uint16 public constant BPS_DENOMINATOR = 10_000;

    mapping(bytes32 => Escrow) private escrows;

    event EscrowLocked(
        bytes32 indexed taskId,
        address indexed client,
        address indexed payTo,
        uint256 amount,
        uint256 fee,
        uint256 net
    );
    event EscrowReleased(bytes32 indexed taskId, address indexed payTo, uint256 net);
    event EscrowRefunded(bytes32 indexed taskId, address indexed client, uint256 amount);
    event FeeUpdated(uint16 feeBps);
    event TreasuryUpdated(address treasury);

    error NotOwner();
    error InvalidAmount();
    error InvalidFee();
    error AlreadyLocked();
    error NotLocked();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address treasury_, uint16 feeBps_) {
        if (feeBps_ > BPS_DENOMINATOR) revert InvalidFee();
        owner = msg.sender;
        treasury = treasury_ == address(0) ? msg.sender : treasury_;
        feeBps = feeBps_;
    }

    /// @notice Lock `msg.value` for a task, splitting the fee up front.
    function lock(bytes32 taskId, address payTo) external payable {
        if (msg.value == 0) revert InvalidAmount();
        if (escrows[taskId].status != Status.None) revert AlreadyLocked();

        uint256 fee = (msg.value * feeBps) / BPS_DENOMINATOR;
        uint256 net = msg.value - fee;

        escrows[taskId] = Escrow({
            client: msg.sender,
            payTo: payTo,
            amount: msg.value,
            fee: fee,
            net: net,
            lockedAt: uint64(block.timestamp),
            status: Status.Locked
        });

        emit EscrowLocked(taskId, msg.sender, payTo, msg.value, fee, net);
    }

    /// @notice Release the net amount to the agent owner and the fee to treasury.
    function release(bytes32 taskId) external onlyOwner {
        Escrow storage entry = escrows[taskId];
        if (entry.status != Status.Locked) revert NotLocked();
        entry.status = Status.Released;

        (bool netOk, ) = entry.payTo.call{value: entry.net}("");
        if (!netOk) revert TransferFailed();

        if (entry.fee > 0) {
            (bool feeOk, ) = treasury.call{value: entry.fee}("");
            if (!feeOk) revert TransferFailed();
        }

        emit EscrowReleased(taskId, entry.payTo, entry.net);
    }

    /// @notice Refund the full amount to the client.
    function refund(bytes32 taskId) external onlyOwner {
        Escrow storage entry = escrows[taskId];
        if (entry.status != Status.Locked) revert NotLocked();
        entry.status = Status.Refunded;

        (bool ok, ) = entry.client.call{value: entry.amount}("");
        if (!ok) revert TransferFailed();

        emit EscrowRefunded(taskId, entry.client, entry.amount);
    }

    function getEscrow(bytes32 taskId) external view returns (Escrow memory) {
        return escrows[taskId];
    }

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > BPS_DENOMINATOR) revert InvalidFee();
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }
}
