import { createPublicClient, http, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, requireChain, buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'

export const CHAIN_ID = arcTestnet.id

const chainFacts = requireChain(CHAIN_ID)
export const RPC_URL = chainFacts.rpcUrls[0]

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')
export const USDC_ADDRESS = usdcFact.address as Address

export const chain = {
  ...arcTestnet,
  rpcUrls: { default: { http: [RPC_URL] } },
} as const

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })

export const txUrl = (hash: string) => buildTxExplorerUrl(CHAIN_ID, hash)
export const addressUrl = (address: string) => buildAddressExplorerUrl(CHAIN_ID, address)
