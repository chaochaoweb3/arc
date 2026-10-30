# AgentVault

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

AgentVault is a controlled USDC vault for an AI agent (DoraHacks Arc Microgrants entry). The owner funds it, sets per-payment and daily limits and a recipient whitelist. The single agent address can only call `requestPayment`: payments within every rule pay instantly, others queue for owner approve/reject (once each). The agent has no withdraw, limit, whitelist, agent-change or self-approve path.

### Deployment (Arc Testnet only, never mainnet)

- AgentVault (current): `0xed16d9015ab2677e175ceb3d40181ca0594a18d2` (deploy block 69782983, tx `0x2d72000715bef345fb5ef3ef96f7a3beb9ca2ed335d8423ff8dbb5816d6535ee`). Source is the user-supplied version-aligned `contracts/AgentVault.sol`; do not rewrite it.
- Previous deployment (kept, unused by the app): `0xf8edb917142a60d4cf244c5b2f4669b7a6981eaa`
- Owner: `0x0E78FACFb5B36FFe41898C53b2B9Ffd0CE107873`; agent starts unset; per-tx limit 0.20 USDC, daily 0.50 USDC (raw 200000 / 500000).
- Address and deploy block live in `src/deployment.ts`; ABI in `src/abi.ts` (regenerate from `contracts/out` after contract edits).
- Design decisions: owner approvals do not consume the agent's daily limit; fixed UTC-day window; queue capped at 50; immutable (no proxy).
- Demo: a throwaway agent key and demo payee are generated in browser localStorage (`src/lib/agent.ts`). Owner runs "Run demo setup" to fund 1.00 USDC, set limits, whitelist the payee, set the agent and send it gas.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
