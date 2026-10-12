// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentMarketplace
/// @notice Minimal, non-custodial registry and receipt log for the AgentHub AI
///         marketplace on BOT Chain. It stores only identifiers, payment
///         references, status and a result hash. Full prompts, API keys and
///         AI outputs are NEVER stored on-chain.
/// @dev The contract holds no user funds. Payments are direct transfers from
///      the client to a `payTo` address; this contract only records that a
///      payment reference exists and that a task completed with a given
///      result hash.
contract AgentMarketplace {
    enum TaskStatus {
        None,
        Created,
        Paid,
        Completed,
        Failed
    }

    struct Agent {
        address owner;
        string metadataUri;
        bool active;
        bool exists;
        uint256 taskCount;
    }

    struct Task {
        bytes32 agentId;
        address client;
        uint256 amount;
        address payTo;
        bytes32 paymentRef;
        bytes32 resultHash;
        TaskStatus status;
    }

    /// @notice Address allowed to create tasks and record payment/completion.
    address public immutable verifier;

    /// @dev Maximum length of a metadata URI kept on-chain.
    uint256 public constant MAX_METADATA_LENGTH = 512;

    mapping(bytes32 => Agent) private _agents;
    mapping(bytes32 => Task) private _tasks;

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        string metadataUri
    );
    event AgentUpdated(
        bytes32 indexed agentId,
        string metadataUri,
        bool active
    );
    event TaskCreated(
        bytes32 indexed taskId,
        bytes32 indexed agentId,
        address indexed client,
        uint256 amount,
        address payTo
    );
    event TaskPaid(bytes32 indexed taskId, bytes32 paymentRef);
    event TaskCompleted(bytes32 indexed taskId, bytes32 resultHash);
    event TaskFailed(bytes32 indexed taskId);
    event VerifierTransferred(address indexed previousVerifier, address indexed newVerifier);

    error ZeroAddress();
    error ZeroId();
    error MetadataTooLong();
    error AgentAlreadyRegistered(bytes32 agentId);
    error AgentNotFound(bytes32 agentId);
    error AgentInactive(bytes32 agentId);
    error TaskAlreadyExists(bytes32 taskId);
    error TaskNotFound(bytes32 taskId);
    error InvalidState(TaskStatus current, TaskStatus required);
    error NotVerifier(address caller);
    error NotAgentOwner(bytes32 agentId, address caller);
    error InvalidAmount();

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert NotVerifier(msg.sender);
        _;
    }

    constructor(address verifier_) {
        if (verifier_ == address(0)) revert ZeroAddress();
        verifier = verifier_;
    }

    // ------------------------------------------------------------------
    // Agent management
    // ------------------------------------------------------------------

    /// @notice Register a new agent. The caller becomes the agent owner.
    function registerAgent(bytes32 agentId, string calldata metadataUri) external {
        if (agentId == bytes32(0)) revert ZeroId();
        if (bytes(metadataUri).length > MAX_METADATA_LENGTH) revert MetadataTooLong();
        if (_agents[agentId].exists) revert AgentAlreadyRegistered(agentId);

        _agents[agentId] = Agent({
            owner: msg.sender,
            metadataUri: metadataUri,
            active: true,
            exists: true,
            taskCount: 0
        });

        emit AgentRegistered(agentId, msg.sender, metadataUri);
    }

    /// @notice Update metadata or availability. Only the agent owner may call.
    function updateAgent(
        bytes32 agentId,
        string calldata metadataUri,
        bool active
    ) external {
        Agent storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        if (agent.owner != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (bytes(metadataUri).length > MAX_METADATA_LENGTH) revert MetadataTooLong();

        agent.metadataUri = metadataUri;
        agent.active = active;

        emit AgentUpdated(agentId, metadataUri, active);
    }

    // ------------------------------------------------------------------
    // Task lifecycle
    // ------------------------------------------------------------------

    /// @notice Create a task record for an agent.
    /// @dev The payment itself happens off-contract; this only records intent.
    function createTask(
        bytes32 taskId,
        bytes32 agentId,
        address client,
        uint256 amount,
        address payTo
    ) external onlyVerifier {
        if (taskId == bytes32(0) || agentId == bytes32(0)) revert ZeroId();
        if (client == address(0) || payTo == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (_tasks[taskId].status != TaskStatus.None) revert TaskAlreadyExists(taskId);

        Agent storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        if (!agent.active) revert AgentInactive(agentId);

        _tasks[taskId] = Task({
            agentId: agentId,
            client: client,
            amount: amount,
            payTo: payTo,
            paymentRef: bytes32(0),
            resultHash: bytes32(0),
            status: TaskStatus.Created
        });
        agent.taskCount += 1;

        emit TaskCreated(taskId, agentId, client, amount, payTo);
    }

    /// @notice Record that a task has been paid. Created -> Paid only.
    function markPaid(bytes32 taskId, bytes32 paymentRef) external onlyVerifier {
        Task storage task = _tasks[taskId];
        if (task.status == TaskStatus.None) revert TaskNotFound(taskId);
        if (task.status != TaskStatus.Created) {
            revert InvalidState(task.status, TaskStatus.Created);
        }

        task.paymentRef = paymentRef;
        task.status = TaskStatus.Paid;

        emit TaskPaid(taskId, paymentRef);
    }

    /// @notice Record completion with a result hash. Paid -> Completed only.
    function completeTask(bytes32 taskId, bytes32 resultHash) external onlyVerifier {
        Task storage task = _tasks[taskId];
        if (task.status == TaskStatus.None) revert TaskNotFound(taskId);
        if (task.status != TaskStatus.Paid) {
            revert InvalidState(task.status, TaskStatus.Paid);
        }

        task.resultHash = resultHash;
        task.status = TaskStatus.Completed;

        emit TaskCompleted(taskId, resultHash);
    }

    /// @notice Mark a task failed. Allowed from Created or Paid.
    function failTask(bytes32 taskId) external onlyVerifier {
        Task storage task = _tasks[taskId];
        if (task.status == TaskStatus.None) revert TaskNotFound(taskId);
        if (task.status != TaskStatus.Created && task.status != TaskStatus.Paid) {
            revert InvalidState(task.status, TaskStatus.Created);
        }

        task.status = TaskStatus.Failed;

        emit TaskFailed(taskId);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function agentExists(bytes32 agentId) external view returns (bool) {
        return _agents[agentId].exists;
    }

    function taskExists(bytes32 taskId) external view returns (bool) {
        return _tasks[taskId].status != TaskStatus.None;
    }

    function getAgent(
        bytes32 agentId
    )
        external
        view
        returns (
            address owner,
            string memory metadataUri,
            bool active,
            uint256 taskCount
        )
    {
        Agent storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        return (agent.owner, agent.metadataUri, agent.active, agent.taskCount);
    }

    function getTask(
        bytes32 taskId
    )
        external
        view
        returns (
            bytes32 agentId,
            address client,
            uint256 amount,
            address payTo,
            bytes32 paymentRef,
            bytes32 resultHash,
            TaskStatus status
        )
    {
        Task storage task = _tasks[taskId];
        if (task.status == TaskStatus.None) revert TaskNotFound(taskId);
        return (
            task.agentId,
            task.client,
            task.amount,
            task.payTo,
            task.paymentRef,
            task.resultHash,
            task.status
        );
    }
}
