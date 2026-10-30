# AgentVault

A controlled USDC vault for an AI agent on Arc Testnet. The owner funds the vault, sets spending limits and a recipient whitelist, and approves anything unusual. The agent can only ask to pay: small whitelisted payments go through instantly, everything else waits for the owner.

Built with [Arc Studio](https://studio.arc.io)

## What it does

- Owner panel: fund the vault, set per-payment and daily limits, manage the whitelist, set or revoke the agent, approve or reject pending payments.
- Agent panel: request a payment. Within limits it pays at once; otherwise it is queued with the reason shown.
- "Try to break it" panel: runs an over-limit payment, a payment to a non-whitelisted address and privileged owner calls (such as withdrawing) as the agent, against the live contract, and shows each result.

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit. Solidity 0.8.28 with Foundry and OpenZeppelin.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

```bash
bun install
bun run dev            # start the app
bun run contracts:build
bun run contracts:test # contract tests
bun run check          # lint and typecheck
```

Environment variables: None.

The deployed vault address is set in `src/deployment.ts`. Use a wallet with Arc Testnet USDC to try the owner flow.
