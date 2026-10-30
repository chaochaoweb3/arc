import type { Address } from 'viem'

/**
 * Deployed AgentVault on Arc Testnet. 
 */
export const VAULT_ADDRESS: Address | null = '0xed16d9015ab2677e175ceb3d40181ca0594a18d2'

/** Block the vault was deployed at, used as the start of event queries. */
export const VAULT_DEPLOY_BLOCK = 69782983n
