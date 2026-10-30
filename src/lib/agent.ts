import { createWalletClient, http, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { chain, RPC_URL } from './chain'

/**
 * Demo-only agent identity. A throwaway Arc Testnet key lives in this browser's
 * localStorage so the review panel can sign real agent transactions without a
 * second wallet. It must never hold more than test funds.
 */
const AGENT_KEY = 'agentvault.demo.agentKey'
const PAYEE_ADDR = 'agentvault.demo.payee'

function loadKey(): Hex {
  const stored = localStorage.getItem(AGENT_KEY)
  if (stored && /^0x[0-9a-fA-F]{64}$/.test(stored)) return stored as Hex
  const fresh = generatePrivateKey()
  localStorage.setItem(AGENT_KEY, fresh)
  return fresh
}

function loadPayee(): Address {
  const stored = localStorage.getItem(PAYEE_ADDR)
  if (stored && /^0x[0-9a-fA-F]{40}$/.test(stored)) return stored as Address
  const fresh = privateKeyToAccount(generatePrivateKey()).address
  localStorage.setItem(PAYEE_ADDR, fresh)
  return fresh
}

export const demoAgent = privateKeyToAccount(loadKey())

/** A locally generated recipient used as the whitelisted demo payee. */
export const demoPayee: Address = loadPayee()

export const agentWallet = createWalletClient({
  account: demoAgent,
  chain,
  transport: http(RPC_URL),
})

/** A fresh address nobody has whitelisted. Its key is discarded immediately. */
export function randomStranger(): Address {
  return privateKeyToAccount(generatePrivateKey()).address
}
