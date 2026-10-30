// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
/**
 * @title AgentVault
 * @notice Non-upgradeable, owner-controlled USDC vault for a restricted AI agent.
 * @dev Threat model: the agent's only state-changing capability is requestPayment.
 * It cannot administer the vault, withdraw, or approve/reject requests. Autonomous
 * payments require an allowed recipient and both transaction and UTC-day limits.
 * A compromised agent can spend within those permissions and fill the bounded
 * queue, but cannot bypass them. The owner is trusted and can move all vault funds.
 * Kill switch: setAgent(address(0)) revokes requests entirely; setLimits(0, 0)
 * disables autonomous payments but still permits queueing for explicit approval.
 * Owner-approved payments do NOT count toward autonomous daily spending.
 * Requests survive agent rotation/revocation and reserve no balance.
 * Arc Testnet USDC ERC-20 view: 0x3600000000000000000000000000000000000000.
 * Pass that address as usdc_; all amounts/limits use raw 6-decimal USDC units.
 * The supplied token must be trusted, standard, non-rebasing, fee-free USDC.
 * No proxy, upgrade entry point, arbitrary calls, or token approvals are exposed.
 */
contract AgentVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_PENDING = 50;
    enum Status { None, Pending, Approved, Rejected }
    /// @dev reasons: bit 0 = per-transaction limit, bit 1 = recipient not allowed, bit 2 = autonomous daily limit. Reasons are recorded at submission only.
    struct Request { address agent; address to; uint256 amount; uint64 createdAt; uint8 reasons; Status status; }
    struct RequestWithId { uint256 id; Request request; }
    IERC20 public immutable usdc;
    address public agent;
    uint256 public perTxLimit;
    uint256 public dailyLimit;
    uint256 public requestCount;
    uint256 public pendingCount;
    mapping(uint256 => Request) public requests;
    mapping(address => bool) private _allowedRecipients;
    uint256 private _spentDay;
    uint256 private _dailySpent;
    error InvalidUSDC(address token);
    error InvalidRecipient(address recipient);
    error InvalidAmount();
    error AgentIsOwner(address account);
    error NotAgent();
    error InsufficientBalance(uint256 available, uint256 required);
    error QueueFull();
    error NotPending(uint256 id);
    error OwnershipRenunciationDisabled();
    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed owner, address indexed to, uint256 amount);
    event LimitsUpdated(uint256 oldPerTxLimit, uint256 newPerTxLimit, uint256 oldDailyLimit, uint256 newDailyLimit);
    event AllowedRecipientUpdated(address indexed to, bool oldAllowed, bool newAllowed);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event PaymentExecuted(address indexed agent, address indexed to, uint256 amount, uint256 spentTodayAfter);
    event PaymentQueued(uint256 indexed id, address indexed agent, address indexed to, uint256 amount, uint8 reasons);
    event RequestApproved(uint256 indexed id, address indexed owner, address indexed to, uint256 amount);
    event RequestRejected(uint256 indexed id, address indexed owner);
    constructor(address usdc_, address owner_, address agent_, uint256 perTxLimit_, uint256 dailyLimit_) Ownable(owner_) {
        if (usdc_ == address(0) || usdc_.code.length == 0) revert InvalidUSDC(usdc_);
        if (agent_ == owner_) revert AgentIsOwner(agent_);
        usdc = IERC20(usdc_);
        agent = agent_;
        perTxLimit = perTxLimit_;
        dailyLimit = dailyLimit_;
        emit AgentUpdated(address(0), agent_);
        emit LimitsUpdated(0, perTxLimit_, 0, dailyLimit_);
    }
    function deposit(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert InvalidAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidRecipient(to);
        if (amount == 0) revert InvalidAmount();
        _requireBalance(amount);
        usdc.safeTransfer(to, amount);
        emit Withdrawn(msg.sender, to, amount);
    }
    function setLimits(uint256 perTx, uint256 daily) external onlyOwner {
        emit LimitsUpdated(perTxLimit, perTx, dailyLimit, daily);
        perTxLimit = perTx;
        dailyLimit = daily;
    }
    function setAllowedRecipient(address to, bool allowed) external onlyOwner {
        _validateRecipient(to);
        emit AllowedRecipientUpdated(to, _allowedRecipients[to], allowed);
        _allowedRecipients[to] = allowed;
    }
    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == owner()) revert AgentIsOwner(newAgent);
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }
    function requestPayment(address to, uint256 amount) external nonReentrant returns (bool executed, uint256 requestId) {
        if (msg.sender != agent) revert NotAgent();
        _validateRecipient(to);
        if (amount == 0) revert InvalidAmount();
        uint256 spent = spentToday();
        uint8 reasons;
        if (amount > perTxLimit) reasons |= 1;
        if (!_allowedRecipients[to]) reasons |= 2;
        if (spent > dailyLimit || amount > dailyLimit - spent) reasons |= 4;
        if (reasons == 0) {
            _requireBalance(amount);
            uint256 spentAfter = spent + amount;
            _spentDay = block.timestamp / 1 days;
            _dailySpent = spentAfter;
            usdc.safeTransfer(to, amount);
            emit PaymentExecuted(msg.sender, to, amount, spentAfter);
            return (true, 0);
        }
        if (pendingCount >= MAX_PENDING) revert QueueFull();
        requestId = ++requestCount;
        requests[requestId] = Request({agent: msg.sender, to: to, amount: amount, createdAt: uint64(block.timestamp), reasons: reasons, status: Status.Pending});
        ++pendingCount;
        emit PaymentQueued(requestId, msg.sender, to, amount, reasons);
        return (false, requestId);
    }
    function approveRequest(uint256 id) external onlyOwner nonReentrant {
        Request storage request = requests[id];
        if (request.status != Status.Pending) revert NotPending(id);
        _requireBalance(request.amount);
        request.status = Status.Approved;
        --pendingCount;
        emit RequestApproved(id, msg.sender, request.to, request.amount);
        usdc.safeTransfer(request.to, request.amount);
    }
    function rejectRequest(uint256 id) external onlyOwner {
        Request storage request = requests[id];
        if (request.status != Status.Pending) revert NotPending(id);
        request.status = Status.Rejected;
        --pendingCount;
        emit RequestRejected(id, msg.sender);
    }
    function isAllowedRecipient(address to) external view returns (bool) { return _allowedRecipients[to]; }
    function spentToday() public view returns (uint256) { return _spentDay == block.timestamp / 1 days ? _dailySpent : 0; }
    function remainingToday() external view returns (uint256) { uint256 spent = spentToday(); return spent >= dailyLimit ? 0 : dailyLimit - spent; }
    function balance() public view returns (uint256) { return usdc.balanceOf(address(this)); }
    function getRequests(uint256 fromId, uint256 count) external view returns (RequestWithId[] memory page) {
        uint256 start = fromId == 0 ? 1 : fromId;
        if (count == 0 || start > requestCount) return new RequestWithId[](0);
        uint256 available = requestCount - start + 1;
        uint256 length = count < available ? count : available;
        page = new RequestWithId[](length);
        for (uint256 i; i < length; ++i) { uint256 id = start + i; page[i] = RequestWithId({id: id, request: requests[id]}); }
    }
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner != address(0) && newOwner == agent) revert AgentIsOwner(newOwner);
        super.transferOwnership(newOwner);
    }
    function renounceOwnership() public override onlyOwner { revert OwnershipRenunciationDisabled(); }
    function _transferOwnership(address newOwner) internal override {
        if (newOwner != address(0) && newOwner == agent) revert AgentIsOwner(newOwner);
        super._transferOwnership(newOwner);
    }
    function _validateRecipient(address to) private view { if (to == address(0) || to == address(this)) revert InvalidRecipient(to); }
    function _requireBalance(uint256 amount) private view { uint256 available = balance(); if (available < amount) revert InsufficientBalance(available, amount); }
}
