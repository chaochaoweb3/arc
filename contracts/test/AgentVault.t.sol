// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentVault} from "../AgentVault.sol";
import {AgentVaultTestBase, MockUSDC} from "./AgentVault.Base.t.sol";

/// Constructor, owner admin, access control and requestPayment decision logic.
contract AgentVaultTest is AgentVaultTestBase {
    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------
    function test_Constructor_SetsState() public view {
        assertEq(address(vault.usdc()), address(usdc));
        assertEq(vault.owner(), owner);
        assertEq(vault.agent(), agent);
        assertEq(vault.perTxLimit(), PER_TX);
        assertEq(vault.dailyLimit(), DAILY);
        assertEq(vault.requestCount(), 0);
        assertEq(vault.pendingCount(), 0);
        assertEq(vault.balance(), FUND);
        assertEq(vault.MAX_PENDING(), 50);
    }

    function test_Constructor_EmitsInitEvents() public {
        vm.expectEmit(true, true, false, false);
        emit AgentVault.AgentUpdated(address(0), agent);
        vm.expectEmit(false, false, false, true);
        emit AgentVault.LimitsUpdated(0, PER_TX, 0, DAILY);
        new AgentVault(address(usdc), owner, agent, PER_TX, DAILY);
    }

    function test_Constructor_RevertsZeroUsdc() public {
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvalidUSDC.selector, address(0)));
        new AgentVault(address(0), owner, agent, PER_TX, DAILY);
    }

    function test_Constructor_RevertsNoCodeUsdc() public {
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvalidUSDC.selector, stranger));
        new AgentVault(stranger, owner, agent, PER_TX, DAILY);
    }

    function test_Constructor_RevertsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new AgentVault(address(usdc), address(0), agent, PER_TX, DAILY);
    }

    function test_Constructor_RevertsAgentEqualsOwner() public {
        vm.expectRevert(abi.encodeWithSelector(AgentVault.AgentIsOwner.selector, owner));
        new AgentVault(address(usdc), owner, owner, PER_TX, DAILY);
    }

    function test_Constructor_AllowsZeroAgent() public {
        AgentVault v = new AgentVault(address(usdc), owner, address(0), PER_TX, DAILY);
        assertEq(v.agent(), address(0));
    }

    // ------------------------------------------------------------------
    // Owner happy paths + validation
    // ------------------------------------------------------------------
    function test_Deposit_PullsFundsAndEmits() public {
        usdc.mint(owner, 5);
        vm.expectEmit(true, false, false, true, address(vault));
        emit AgentVault.Deposited(owner, 5);
        vm.prank(owner);
        vault.deposit(5);
        assertEq(vault.balance(), FUND + 5);
    }

    function test_Deposit_RevertsZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(AgentVault.InvalidAmount.selector);
        vault.deposit(0);
    }

    function test_Withdraw_SendsFundsAndEmits() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit AgentVault.Withdrawn(owner, stranger, 300);
        vm.prank(owner);
        vault.withdraw(stranger, 300);
        assertEq(usdc.balanceOf(stranger), 300);
        assertEq(vault.balance(), FUND - 300);
    }

    function test_Withdraw_Reverts() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvalidRecipient.selector, address(0)));
        vault.withdraw(address(0), 1);
        vm.expectRevert(AgentVault.InvalidAmount.selector);
        vault.withdraw(stranger, 0);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InsufficientBalance.selector, FUND, FUND + 1));
        vault.withdraw(stranger, FUND + 1);
        vm.stopPrank();
    }

    function test_SetLimits_UpdatesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit AgentVault.LimitsUpdated(PER_TX, 1, DAILY, 2);
        vm.prank(owner);
        vault.setLimits(1, 2);
        assertEq(vault.perTxLimit(), 1);
        assertEq(vault.dailyLimit(), 2);
    }

    function test_SetAllowedRecipient_UpdatesAndEmits() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit AgentVault.AllowedRecipientUpdated(bob, false, true);
        vm.prank(owner);
        vault.setAllowedRecipient(bob, true);
        assertTrue(vault.isAllowedRecipient(bob));
        vm.prank(owner);
        vault.setAllowedRecipient(bob, false);
        assertFalse(vault.isAllowedRecipient(bob));
    }

    function test_SetAllowedRecipient_RevertsZeroAndVault() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvalidRecipient.selector, address(0)));
        vault.setAllowedRecipient(address(0), true);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvalidRecipient.selector, address(vault)));
        vault.setAllowedRecipient(address(vault), true);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Access control: owner-only functions (agent AND stranger rejected)
    // ------------------------------------------------------------------
    function _callers() internal view returns (address[2] memory c) {
        c[0] = agent;
        c[1] = stranger;
    }

    function test_AccessControl_Deposit() public {
        address[2] memory c = _callers();
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.deposit(1);
        }
    }

    function test_AccessControl_Withdraw() public {
        address[2] memory c = _callers();
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.withdraw(c[i], 1);
        }
        assertEq(vault.balance(), FUND);
    }

    function test_AccessControl_SetLimits() public {
        address[2] memory c = _callers();
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.setLimits(type(uint256).max, type(uint256).max);
        }
        assertEq(vault.perTxLimit(), PER_TX);
        assertEq(vault.dailyLimit(), DAILY);
    }

    function test_AccessControl_SetAllowedRecipient() public {
        address[2] memory c = _callers();
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.setAllowedRecipient(c[i], true);
            assertFalse(vault.isAllowedRecipient(c[i]));
        }
    }

    function test_AccessControl_SetAgent() public {
        address[2] memory c = _callers();
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.setAgent(c[i]);
        }
        assertEq(vault.agent(), agent);
    }

    function test_AccessControl_ApproveReject() public {
        uint256 id = _queueSmall(1_000);
        address[2] memory c = _callers();
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.approveRequest(id);
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.rejectRequest(id);
        }
        assertEq(uint8(_status(id)), uint8(AgentVault.Status.Pending));
        assertEq(vault.pendingCount(), 1);
        assertEq(usdc.balanceOf(bob), 0);
    }

    function test_AccessControl_OwnershipFunctions() public {
        address[2] memory c = _callers();
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.transferOwnership(c[i]);
            vm.prank(c[i]);
            vm.expectRevert(_unauthorized(c[i]));
            vault.renounceOwnership();
        }
        assertEq(vault.owner(), owner);
    }

    function test_AgentCannotEscalate_EndToEnd() public {
        uint256 id = _queueSmall(10_000);
        vm.startPrank(agent);
        vm.expectRevert(_unauthorized(agent));
        vault.withdraw(agent, FUND);
        vm.expectRevert(_unauthorized(agent));
        vault.setLimits(FUND, FUND);
        vm.expectRevert(_unauthorized(agent));
        vault.setAllowedRecipient(bob, true);
        vm.expectRevert(_unauthorized(agent));
        vault.setAgent(agent);
        vm.expectRevert(_unauthorized(agent));
        vault.approveRequest(id);
        vm.expectRevert(_unauthorized(agent));
        vault.rejectRequest(id);
        vm.stopPrank();
        assertEq(vault.balance(), FUND);
        assertEq(usdc.balanceOf(agent), 0);
    }

    function test_RequestPayment_OnlyAgent() public {
        address[2] memory c;
        c[0] = owner;
        c[1] = stranger;
        for (uint256 i; i < 2; ++i) {
            vm.prank(c[i]);
            vm.expectRevert(abi.encodeWithSelector(AgentVault.NotAgent.selector, c[i], agent));
            vault.requestPayment(alice, 1);
        }
    }

    // ------------------------------------------------------------------
    // requestPayment: execute vs queue
    // ------------------------------------------------------------------
    function test_Pay_SmallWhitelistedExecutesImmediately() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit AgentVault.PaymentExecuted(agent, alice, 100_000, 100_000);
        (bool executed, uint256 id) = _pay(alice, 100_000);
        assertTrue(executed);
        assertEq(id, 0);
        assertEq(usdc.balanceOf(alice), 100_000);
        assertEq(vault.balance(), FUND - 100_000);
        assertEq(vault.spentToday(), 100_000);
        assertEq(vault.remainingToday(), DAILY - 100_000);
        assertEq(vault.requestCount(), 0);
    }

    function test_Pay_OverPerTxWhitelistedQueuesBit0() public {
        vm.expectEmit(true, true, true, true, address(vault));
        emit AgentVault.PaymentQueued(1, agent, alice, 500_000, 1);
        (bool executed, uint256 id) = _pay(alice, 500_000);
        assertFalse(executed);
        assertEq(id, 1);
        assertEq(_reasons(id), 1);
        assertEq(uint8(_status(id)), uint8(AgentVault.Status.Pending));
        assertEq(usdc.balanceOf(alice), 0);
        assertEq(vault.spentToday(), 0);
        assertEq(vault.pendingCount(), 1);
        assertEq(vault.requestCount(), 1);
    }

    function test_Pay_NonWhitelistedSmallQueuesBit1() public {
        (bool executed, uint256 id) = _pay(bob, 1_000);
        assertFalse(executed);
        assertEq(_reasons(id), 2);
        assertEq(usdc.balanceOf(bob), 0);
        assertEq(vault.spentToday(), 0);
    }

    function test_Pay_DailyExceededQueuesBit2() public {
        (bool e1,) = _pay(alice, 200_000);
        (bool e2,) = _pay(alice, 200_000);
        assertTrue(e1 && e2);
        assertEq(vault.spentToday(), 400_000);
        (bool e3, uint256 id) = _pay(alice, 200_000);
        assertFalse(e3);
        assertEq(_reasons(id), 4);
        assertEq(vault.spentToday(), 400_000);
        assertEq(usdc.balanceOf(alice), 400_000);
    }

    function test_Pay_CombinedReasonsBitmask() public {
        // over perTx + non-whitelisted -> 1|2 = 3
        (, uint256 a) = _pay(bob, 300_000);
        assertEq(_reasons(a), 3);
        // over perTx + over daily, whitelisted -> 1|4 = 5
        (, uint256 b) = _pay(alice, 600_000);
        assertEq(_reasons(b), 5);
        // non-whitelisted + over daily (but within perTx after raising) -> 2|4 = 6
        vm.prank(owner);
        vault.setLimits(700_000, DAILY);
        (, uint256 c) = _pay(bob, 600_000);
        assertEq(_reasons(c), 6);
        // all three
        (, uint256 d) = _pay(bob, 800_000);
        assertEq(_reasons(d), 7);
    }

    function test_Pay_DayRolloverResetsSpentToday() public {
        _pay(alice, 200_000);
        _pay(alice, 200_000);
        assertEq(vault.spentToday(), 400_000);
        vm.warp(DAY0 + 1 days); // next UTC day
        assertEq(vault.spentToday(), 0);
        assertEq(vault.remainingToday(), DAILY);
        (bool executed,) = _pay(alice, 200_000);
        assertTrue(executed);
        assertEq(vault.spentToday(), 200_000);
    }

    function test_Pay_SameDayLastSecondStillCounts() public {
        _pay(alice, 200_000);
        vm.warp(DAY0 + 1 days - 1);
        assertEq(vault.spentToday(), 200_000);
    }

    function test_Pay_ExactPerTxBoundaryExecutes() public {
        (bool executed,) = _pay(alice, PER_TX);
        assertTrue(executed);
        (bool over, uint256 id) = _pay(alice, PER_TX + 1);
        assertFalse(over);
        assertEq(_reasons(id), 1);
    }

    function test_Pay_ExactDailyRemainingExecutes() public {
        _pay(alice, 200_000);
        _pay(alice, 200_000);
        (bool executed,) = _pay(alice, 100_000); // remaining exactly 100_000
        assertTrue(executed);
        assertEq(vault.spentToday(), DAILY);
        assertEq(vault.remainingToday(), 0);
        (bool over, uint256 id) = _pay(alice, 1);
        assertFalse(over);
        assertEq(_reasons(id), 4);
    }

    function test_Pay_DailyLimitLoweredBelowSpentQueues() public {
        _pay(alice, 200_000);
        vm.prank(owner);
        vault.setLimits(PER_TX, 100_000); // spent (200k) > daily (100k)
        assertEq(vault.remainingToday(), 0);
        (bool executed, uint256 id) = _pay(alice, 1);
        assertFalse(executed);
        assertEq(_reasons(id), 4);
    }

    function test_Pay_Reverts_ZeroAmountZeroRecipientVault() public {
        vm.startPrank(agent);
        vm.expectRevert(AgentVault.InvalidAmount.selector);
        vault.requestPayment(alice, 0);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvalidRecipient.selector, address(0)));
        vault.requestPayment(address(0), 1);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvalidRecipient.selector, address(vault)));
        vault.requestPayment(address(vault), 1);
        vm.stopPrank();
    }

    function test_Pay_InsufficientBalanceRevertsAndDoesNotQueue() public {
        vm.prank(owner);
        vault.withdraw(owner, FUND - 50_000); // leaves 50_000
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InsufficientBalance.selector, 50_000, 100_000));
        vault.requestPayment(alice, 100_000);
        assertEq(vault.requestCount(), 0);
        assertEq(vault.pendingCount(), 0);
        assertEq(vault.spentToday(), 0);
    }

    function test_Pay_ZeroLimitsQueueEverything() public {
        vm.prank(owner);
        vault.setLimits(0, 0);
        (bool executed, uint256 id) = _pay(alice, 1);
        assertFalse(executed);
        assertEq(_reasons(id), 5);
    }
}
