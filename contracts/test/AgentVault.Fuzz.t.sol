// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentVault} from "../AgentVault.sol";
import {AgentVaultTestBase} from "./AgentVault.Base.t.sol";

contract AgentVaultFuzzTest is AgentVaultTestBase {
    /// amount <= perTx, whitelisted, within daily => executes; tokens conserved.
    function testFuzz_AllowedWithinLimitsExecutes(uint256 amount) public {
        amount = bound(amount, 1, PER_TX);
        uint256 vaultBefore = vault.balance();
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 supplyBefore = usdc.totalSupply();

        (bool executed, uint256 id) = _pay(alice, amount);

        assertTrue(executed);
        assertEq(id, 0);
        assertEq(vault.balance(), vaultBefore - amount);
        assertEq(usdc.balanceOf(alice), aliceBefore + amount);
        assertEq(vault.balance() + usdc.balanceOf(alice), vaultBefore + aliceBefore); // conservation
        assertEq(usdc.totalSupply(), supplyBefore);
        assertEq(vault.spentToday(), amount);
        assertEq(vault.pendingCount(), 0);
    }

    /// Any amount > perTx is never transferred immediately (even to a whitelisted recipient).
    function testFuzz_AbovePerTxNeverTransfers(uint256 perTx, uint256 extra, bool whitelisted) public {
        perTx = bound(perTx, 0, 1e12);
        extra = bound(extra, 1, type(uint128).max);
        uint256 amount = perTx + extra;
        address to = whitelisted ? alice : bob;
        vm.prank(owner);
        vault.setLimits(perTx, type(uint128).max); // daily is not the binding constraint

        uint256 vaultBefore = vault.balance();
        (bool executed, uint256 id) = _pay(to, amount);

        assertFalse(executed);
        assertGt(id, 0);
        assertEq(_reasons(id) & 1, 1);
        assertEq(vault.balance(), vaultBefore);
        assertEq(usdc.balanceOf(to), 0);
        assertEq(vault.spentToday(), 0);
        assertEq(vault.pendingCount(), 1);
    }

    /// Per UTC day, the sum of agent-executed payments never exceeds dailyLimit.
    function testFuzz_DailySumNeverExceedsLimit(uint256[16] memory amounts, uint8 warpMask) public {
        // plenty of funds so balance is never the binding constraint
        usdc.mint(owner, 100e6);
        vm.prank(owner);
        vault.deposit(100e6);

        uint256 daySum;
        uint256 currentDay = block.timestamp / 1 days;
        for (uint256 i; i < 16; ++i) {
            // occasionally roll into a later day (sometimes several days)
            if (i % 4 == 3 && (warpMask >> (i / 4)) & 1 == 1) {
                vm.warp(block.timestamp + 1 days + (amounts[i] % 6 hours));
            }
            uint256 today = block.timestamp / 1 days;
            if (today != currentDay) {
                currentDay = today;
                daySum = 0;
            }
            uint256 amount = bound(amounts[i], 1, PER_TX);
            (bool executed,) = _pay(alice, amount);
            if (executed) daySum += amount;
            assertLe(daySum, DAILY);
            assertEq(vault.spentToday(), daySum);
        }
    }
}
