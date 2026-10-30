// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentVault} from "../AgentVault.sol";

/// @dev Minimal 6-decimals USDC stand-in (OZ ERC20) with open mint.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Shared fixture. Holds NO test functions (every category file inherits it).
abstract contract AgentVaultTestBase is Test {
    MockUSDC internal usdc;
    AgentVault internal vault;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal stranger = makeAddr("stranger");
    address internal alice = makeAddr("alice"); // whitelisted recipient
    address internal bob = makeAddr("bob"); // NOT whitelisted recipient

    uint256 internal constant FUND = 1_000_000; // 1.00 USDC
    uint256 internal constant PER_TX = 200_000; // 0.20
    uint256 internal constant DAILY = 500_000; // 0.50
    uint256 internal constant DAY0 = 100 days; // start of a UTC day

    function setUp() public virtual {
        vm.warp(DAY0 + 1 hours);
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner, agent, PER_TX, DAILY);

        usdc.mint(owner, FUND);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(FUND);
        vault.setAllowedRecipient(alice, true);
        vm.stopPrank();
    }

    // ---- helpers ----
    function _pay(address to, uint256 amount) internal returns (bool executed, uint256 id) {
        vm.prank(agent);
        return vault.requestPayment(to, amount);
    }

    function _status(uint256 id) internal view returns (AgentVault.Status s) {
        (,,,,, s) = vault.requests(id);
    }

    function _reasons(uint256 id) internal view returns (uint8 r) {
        (,,,, r,) = vault.requests(id);
    }

    /// @dev Queues a request to non-whitelisted bob (reasons == 2).
    function _queueSmall(uint256 amount) internal returns (uint256 id) {
        bool executed;
        (executed, id) = _pay(bob, amount);
        assertFalse(executed);
    }

    function _unauthorized(address caller) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller);
    }
}
