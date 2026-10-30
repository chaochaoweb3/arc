# Hosted build note

The live app at https://chaochaoweb3.com/agentvault/app/ is built from this
repository with one change set: the deployment configuration is switched
from the Arc Testnet deployment used during the Studio build to the Arc
mainnet deployment.

- Mainnet contract: 0xb0D295774FD38b9473d316E7e06C61EC02439C22 (Arc mainnet, chain ID 5042)
- Testnet deployment (Studio stage): 0xed16d9015ab2677e175ceb3d40181ca0594a18d2

The exact diff is in `live-app-mainnet.patch` in this repository
(14 files: deployment/chain/config switch to mainnet, Vite base path for
the /agentvault/app/ subpath, mainnet wording, removal of the testnet
chain entry from the generated chain registry, and chunked event scanning
in useVault.ts because the mainnet RPC rejects full-range eth_getLogs
from the deploy block).

Apply it to a clean checkout with `git apply live-app-mainnet.patch`,
then `bun install --frozen-lockfile && bun run build`.

A second patch, `live-app-fix2.patch`, is applied on top of the hosted
build. Arc's docs list exactly one keyless public mainnet RPC
(`https://rpc.mainnet.arc.io`), so there is no second endpoint to fail
over to; the patch instead bounds every read: the viem transport gets an
explicit 8s timeout with limited retries, the vault snapshot query gets
a 20s overall deadline and a single react-query retry, the error card
gains a working Retry button, a slow-loading hint appears after 10s,
and a connected wallet on the wrong chain gets a visible banner. All
reads stay on the public RPC client, fully decoupled from the wallet.
Apply with `git apply live-app-fix2.patch` after the mainnet patch.

Following the official round-2 flow, the contract and app were built in
Arc Studio; the mainnet deployment and this hosting were done outside
Studio from the exported code.
