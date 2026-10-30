// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentVault} from "../AgentVault.sol";
import {AgentVaultTestBase} from "./AgentVault.Base.t.sol";

/// Approve/reject lifecycle, queue bound, agent rotation, ownership guards, pagination.
contract AgentVaultRequestsTest is AgentVaultTestBase {
    // ---------------- approve ----------------
    function test_Approve_PaysOnceAndEmits() public {
        uint256 id = _queueSmall(300_000);
        vm.expectEmit(true, true, true, true, address(vault));
        emit AgentVault.RequestApproved(id, owner, bob, 300_000);
        vm.prank(owner);
        vault.approveRequest(id);
        assertEq(usdc.balanceOf(bob), 300_000);
        assertEq(vault.balance(), FUND - 300_000);
        assertEq(uint8(_status(id)), uint8(AgentVault.Status.Approved));
        assertEq(vault.pendingCount(), 0);
    }

    function test_Approve_SecondApproveOrRejectRevertsNotPending() public {
        uint256 id = _queueSmall(1_000);
        vm.startPrank(owner);
        vault.approveRequest(id);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotPending.selector, id));
        vault.approveRequest(id);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotPending.selector, id));
        vault.rejectRequest(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(bob), 1_000);
    }

    function test_Approve_DoesNotChangeSpentToday() public {
        _pay(alice, 100_000);
        uint256 id = _queueSmall(250_000);
        uint256 spentBefore = vault.spentToday();
        vm.prank(owner);
        vault.approveRequest(id);
        assertEq(vault.spentToday(), spentBefore);
        assertEq(vault.remainingToday(), DAILY - spentBefore);
    }

    function test_Approve_InsufficientBalanceRevertsAndStaysPending() public {
        uint256 id = _queueSmall(500_000);
        vm.startPrank(owner);
        vault.withdraw(owner, FUND - 100_000); // leaves 100_000
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InsufficientBalance.selector, 100_000, 500_000));
        vault.approveRequest(id);
        vm.stopPrank();
        assertEq(uint8(_status(id)), uint8(AgentVault.Status.Pending));
        assertEq(vault.pendingCount(), 1);
        assertEq(usdc.balanceOf(bob), 0);
    }

    function test_Approve_UnknownIdReverts() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotPending.selector, 0));
        vault.approveRequest(0);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotPending.selector, 99));
        vault.approveRequest(99);
        vm.stopPrank();
    }

    function test_Approve_SucceedsAfterAgentRevoked() public {
        uint256 id = _queueSmall(1_000);
        vm.startPrank(owner);
        vault.setAgent(address(0));
        vault.approveRequest(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(bob), 1_000);
    }

    // ---------------- reject ----------------
    function test_Reject_NoTransferAndEmits() public {
        uint256 id = _queueSmall(300_000);
        vm.expectEmit(true, true, false, false, address(vault));
        emit AgentVault.RequestRejected(id, owner);
        vm.prank(owner);
        vault.rejectRequest(id);
        assertEq(uint8(_status(id)), uint8(AgentVault.Status.Rejected));
        assertEq(vault.pendingCount(), 0);
        assertEq(vault.balance(), FUND);
        assertEq(usdc.balanceOf(bob), 0);
    }

    function test_Reject_ThenApproveOrRejectRevertsNotPending() public {
        uint256 id = _queueSmall(1_000);
        vm.startPrank(owner);
        vault.rejectRequest(id);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotPending.selector, id));
        vault.approveRequest(id);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotPending.selector, id));
        vault.rejectRequest(id);
        vm.stopPrank();
    }

    function test_Reject_UnknownIdReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotPending.selector, 7));
        vault.rejectRequest(7);
    }

    // ---------------- queue bound ----------------
    function test_QueueFull_At50ThenFreedByReject() public {
        for (uint256 i; i < 50; ++i) {
            _queueSmall(1);
        }
        assertEq(vault.pendingCount(), 50);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.QueueFull.selector, 50, 50));
        vault.requestPayment(bob, 1);

        vm.prank(owner);
        vault.rejectRequest(17);
        assertEq(vault.pendingCount(), 49);
        uint256 id = _queueSmall(1);
        assertEq(id, 51);
        assertEq(vault.pendingCount(), 50);
    }

    function test_QueueFull_DoesNotBlockExecutableAndApproveFrees() public {
        for (uint256 i; i < 50; ++i) {
            _queueSmall(1);
        }
        // an allowed payment never touches the queue, so it still executes
        (bool executed,) = _pay(alice, 1_000);
        assertTrue(executed);
        vm.prank(owner);
        vault.approveRequest(1);
        assertEq(vault.pendingCount(), 49);
    }

    // ---------------- agent management ----------------
    function test_SetAgent_ZeroRevokesAndEmits() public {
        vm.expectEmit(true, true, false, false, address(vault));
        emit AgentVault.AgentUpdated(agent, address(0));
        vm.prank(owner);
        vault.setAgent(address(0));
        assertEq(vault.agent(), address(0));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotAgent.selector, agent, address(0)));
        vault.requestPayment(alice, 1);
    }

    function test_SetAgent_OwnerReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.AgentIsOwner.selector, owner));
        vault.setAgent(owner);
    }

    function test_SetAgent_RotationSwitchesAuthority() public {
        address newAgent = makeAddr("newAgent");
        vm.prank(owner);
        vault.setAgent(newAgent);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotAgent.selector, agent, newAgent));
        vault.requestPayment(alice, 1);
        vm.prank(newAgent);
        (bool executed,) = vault.requestPayment(alice, 1);
        assertTrue(executed);
    }

    // ---------------- ownership ----------------
    function test_TransferOwnership_ToAgentReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.AgentIsOwner.selector, agent));
        vault.transferOwnership(agent);
    }

    function test_TransferOwnership_TwoStepHappyPath() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        vault.transferOwnership(newOwner);
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), newOwner);
        vm.prank(newOwner);
        vault.acceptOwnership();
        assertEq(vault.owner(), newOwner);
        // old owner lost rights
        vm.prank(owner);
        vm.expectRevert(_unauthorized(owner));
        vault.setLimits(0, 0);
    }

    function test_TransferOwnership_ZeroCancelsPending() public {
        address newOwner = makeAddr("newOwner");
        vm.startPrank(owner);
        vault.transferOwnership(newOwner);
        vault.transferOwnership(address(0));
        vm.stopPrank();
        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, newOwner));
        vault.acceptOwnership();
    }

    function test_AcceptOwnership_BlockedIfPendingOwnerBecomesAgent() public {
        address newOwner = makeAddr("newOwner");
        vm.startPrank(owner);
        vault.transferOwnership(newOwner);
        vault.setAgent(newOwner); // allowed: newOwner is not (yet) the owner
        vm.stopPrank();

        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.AgentIsOwner.selector, newOwner));
        vault.acceptOwnership();
        assertEq(vault.owner(), owner);

        // owner revokes the agent -> acceptance now succeeds
        vm.prank(owner);
        vault.setAgent(address(0));
        vm.prank(newOwner);
        vault.acceptOwnership();
        assertEq(vault.owner(), newOwner);
    }

    function test_RenounceOwnership_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(AgentVault.OwnershipRenunciationDisabled.selector);
        vault.renounceOwnership();
        assertEq(vault.owner(), owner);
    }

    // ---------------- pagination ----------------
    function _queueFive() internal {
        for (uint256 i = 1; i <= 5; ++i) {
            _queueSmall(i * 10);
        }
    }

    function test_GetRequests_FullAndClipped() public {
        _queueFive();
        AgentVault.RequestWithId[] memory p = vault.getRequests(1, 100);
        assertEq(p.length, 5);
        for (uint256 i; i < 5; ++i) {
            assertEq(p[i].id, i + 1);
            assertEq(p[i].request.amount, (i + 1) * 10);
            assertEq(p[i].request.to, bob);
            assertEq(p[i].request.agent, agent);
            assertEq(p[i].request.reasons, 2);
            assertEq(uint8(p[i].request.status), uint8(AgentVault.Status.Pending));
            assertEq(p[i].request.createdAt, uint64(block.timestamp));
        }
        p = vault.getRequests(4, 10);
        assertEq(p.length, 2);
        assertEq(p[0].id, 4);
        assertEq(p[1].id, 5);
    }

    function test_GetRequests_ZeroFromStartsAtOneAndPages() public {
        _queueFive();
        AgentVault.RequestWithId[] memory p = vault.getRequests(0, 2);
        assertEq(p.length, 2);
        assertEq(p[0].id, 1);
        p = vault.getRequests(3, 2);
        assertEq(p.length, 2);
        assertEq(p[0].id, 3);
        assertEq(p[1].id, 4);
    }

    function test_GetRequests_EmptyCases() public {
        assertEq(vault.getRequests(0, 10).length, 0); // no requests
        _queueFive();
        assertEq(vault.getRequests(1, 0).length, 0); // zero count
        assertEq(vault.getRequests(6, 1).length, 0); // past the end
        assertEq(vault.getRequests(type(uint256).max, 5).length, 0);
    }

    function test_GetRequests_IncludesProcessedRequests() public {
        _queueFive();
        vm.startPrank(owner);
        vault.approveRequest(1);
        vault.rejectRequest(2);
        vm.stopPrank();
        AgentVault.RequestWithId[] memory p = vault.getRequests(1, 3);
        assertEq(uint8(p[0].request.status), uint8(AgentVault.Status.Approved));
        assertEq(uint8(p[1].request.status), uint8(AgentVault.Status.Rejected));
        assertEq(uint8(p[2].request.status), uint8(AgentVault.Status.Pending));
    }

    // ---------------- queued event semantics ----------------
    function test_Queued_EmitsEventWithReasons() public {
        vm.expectEmit(true, true, true, true, address(vault));
        emit AgentVault.PaymentQueued(1, agent, bob, 300_000, 3);
        _pay(bob, 300_000);
    }
}
