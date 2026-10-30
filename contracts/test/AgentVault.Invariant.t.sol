// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentVault} from "../AgentVault.sol";
import {AgentVaultTestBase, MockUSDC} from "./AgentVault.Base.t.sol";

/// @dev Drives the vault with bounded random actions and tracks ghost state.
contract AgentVaultHandler is Test {
    AgentVault public vault;
    MockUSDC public usdc;
    address public owner;
    address public agent;
    address[3] public recipients; // [0],[1] whitelisted, [2] not

    uint256 public maxAgentExecutedInADay; // max over days of agent-path outflow
    uint256 public totalAgentExecuted;
    mapping(uint256 => uint256) public agentOutByDay;
    uint256 public calls;

    constructor(AgentVault v, MockUSDC u, address owner_, address agent_, address[3] memory r) {
        vault = v;
        usdc = u;
        owner = owner_;
        agent = agent_;
        recipients = r;
    }

    function pay(uint256 recipientSeed, uint256 amount) external {
        ++calls;
        address to = recipients[recipientSeed % 3];
        amount = bound(amount, 1, 600_000);
        uint256 balBefore = usdc.balanceOf(address(vault));
        vm.prank(agent);
        try vault.requestPayment(to, amount) returns (bool executed, uint256) {
            if (executed) {
                uint256 out = balBefore - usdc.balanceOf(address(vault));
                uint256 day = block.timestamp / 1 days;
                agentOutByDay[day] += out;
                totalAgentExecuted += out;
                if (agentOutByDay[day] > maxAgentExecutedInADay) maxAgentExecutedInADay = agentOutByDay[day];
            }
        } catch {}
    }

    function approve(uint256 idSeed) external {
        uint256 n = vault.requestCount();
        if (n == 0) return;
        vm.prank(owner);
        try vault.approveRequest(bound(idSeed, 1, n)) {} catch {}
    }

    function reject(uint256 idSeed) external {
        uint256 n = vault.requestCount();
        if (n == 0) return;
        vm.prank(owner);
        try vault.rejectRequest(bound(idSeed, 1, n)) {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2 days));
    }

    function fund(uint256 amount) external {
        amount = bound(amount, 0, 2_000_000);
        if (amount == 0) return;
        usdc.mint(owner, amount);
        vm.startPrank(owner);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }
}

contract AgentVaultInvariantTest is AgentVaultTestBase {
    AgentVaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        vault.setAllowedRecipient(makeAddr("carol"), true);
        address[3] memory r = [alice, makeAddr("carol"), bob];
        handler = new AgentVaultHandler(vault, usdc, owner, agent, r);
        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](5);
        sels[0] = AgentVaultHandler.pay.selector;
        sels[1] = AgentVaultHandler.approve.selector;
        sels[2] = AgentVaultHandler.reject.selector;
        sels[3] = AgentVaultHandler.warp.selector;
        sels[4] = AgentVaultHandler.fund.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    /// Tokens leaving via the agent path in any UTC day never exceed dailyLimit.
    function invariant_AgentOutflowPerDayWithinDailyLimit() public view {
        assertLe(handler.maxAgentExecutedInADay(), DAILY);
        assertLe(vault.spentToday(), DAILY);
    }

    /// pendingCount always equals the number of requests whose status is Pending.
    function invariant_PendingCountMatchesPendingRequests() public view {
        uint256 n = vault.requestCount();
        uint256 pending;
        for (uint256 id = 1; id <= n; ++id) {
            if (_status(id) == AgentVault.Status.Pending) ++pending;
        }
        assertEq(vault.pendingCount(), pending);
        assertLe(vault.pendingCount(), vault.MAX_PENDING());
    }
}
