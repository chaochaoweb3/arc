import { useQuery } from '@tanstack/react-query'
import type { Address, Hash } from 'viem'
import { agentVaultAbi } from '@/abi'
import { publicClient } from '@/lib/chain'
import { VAULT_ADDRESS, VAULT_DEPLOY_BLOCK } from '@/deployment'

export const REQUEST_PENDING = 1
export const REQUEST_APPROVED = 2
export const REQUEST_REJECTED = 3

export interface VaultRequest {
  id: bigint
  agent: Address
  to: Address
  amount: bigint
  createdAt: bigint
  reasons: number
  status: number
}

export interface VaultSnapshot {
  owner: Address
  agent: Address
  perTxLimit: bigint
  dailyLimit: bigint
  balance: bigint
  spentToday: bigint
  remainingToday: bigint
  pendingCount: bigint
  requestCount: bigint
  requests: VaultRequest[]
}

const WINDOW = 40n

async function fetchSnapshot(vault: Address): Promise<VaultSnapshot> {
  const base = { address: vault, abi: agentVaultAbi } as const
  const [owner, agent, perTxLimit, dailyLimit, balance, spentToday, remainingToday, pendingCount, requestCount] =
    await Promise.all([
      publicClient.readContract({ ...base, functionName: 'owner' }),
      publicClient.readContract({ ...base, functionName: 'agent' }),
      publicClient.readContract({ ...base, functionName: 'perTxLimit' }),
      publicClient.readContract({ ...base, functionName: 'dailyLimit' }),
      publicClient.readContract({ ...base, functionName: 'balance' }),
      publicClient.readContract({ ...base, functionName: 'spentToday' }),
      publicClient.readContract({ ...base, functionName: 'remainingToday' }),
      publicClient.readContract({ ...base, functionName: 'pendingCount' }),
      publicClient.readContract({ ...base, functionName: 'requestCount' }),
    ])

  let requests: VaultRequest[] = []
  if (requestCount > 0n) {
    const from = requestCount > WINDOW ? requestCount - WINDOW + 1n : 1n
    const page = await publicClient.readContract({
      ...base,
      functionName: 'getRequests',
      args: [from, WINDOW],
    })
    requests = page
      .map((p) => ({
        id: p.id,
        agent: p.request.agent,
        to: p.request.to,
        amount: p.request.amount,
        createdAt: BigInt(p.request.createdAt),
        reasons: Number(p.request.reasons),
        status: Number(p.request.status),
      }))
      .reverse()
  }

  return { owner, agent, perTxLimit, dailyLimit, balance, spentToday, remainingToday, pendingCount, requestCount, requests }
}

export function useVaultSnapshot() {
  return useQuery({
    queryKey: ['vault', 'snapshot', VAULT_ADDRESS],
    enabled: VAULT_ADDRESS !== null,
    refetchInterval: 4000,
    queryFn: () => {
      if (!VAULT_ADDRESS) throw new Error('Vault not deployed')
      return fetchSnapshot(VAULT_ADDRESS)
    },
  })
}

export interface VaultEvent {
  key: string
  kind:
    | 'deposit'
    | 'withdraw'
    | 'executed'
    | 'queued'
    | 'approved'
    | 'rejected'
    | 'recipient'
    | 'limits'
    | 'agent'
  block: bigint
  tx: Hash
  to?: Address
  amount?: bigint
  id?: bigint
  reasons?: number
  allowed?: boolean
  agent?: Address
}

async function fetchEvents(vault: Address): Promise<VaultEvent[]> {
  const logs = await publicClient.getContractEvents({
    address: vault,
    abi: agentVaultAbi,
    fromBlock: VAULT_DEPLOY_BLOCK,
    toBlock: 'latest',
  })
  const out: VaultEvent[] = []
  for (const log of logs) {
    const common = {
      key: `${log.transactionHash}-${log.logIndex}`,
      block: log.blockNumber,
      tx: log.transactionHash,
    }
    switch (log.eventName) {
      case 'Deposited':
        out.push({ ...common, kind: 'deposit', amount: log.args.amount })
        break
      case 'Withdrawn':
        out.push({ ...common, kind: 'withdraw', to: log.args.to, amount: log.args.amount })
        break
      case 'PaymentExecuted':
        out.push({ ...common, kind: 'executed', to: log.args.to, amount: log.args.amount })
        break
      case 'PaymentQueued':
        out.push({
          ...common,
          kind: 'queued',
          id: log.args.id,
          to: log.args.to,
          amount: log.args.amount,
          reasons: Number(log.args.reasons),
        })
        break
      case 'RequestApproved':
        out.push({ ...common, kind: 'approved', id: log.args.id, to: log.args.to, amount: log.args.amount })
        break
      case 'RequestRejected':
        out.push({ ...common, kind: 'rejected', id: log.args.id })
        break
      case 'AllowedRecipientUpdated':
        out.push({ ...common, kind: 'recipient', to: log.args.to, allowed: log.args.newAllowed })
        break
      case 'AgentUpdated':
        out.push({ ...common, kind: 'agent', agent: log.args.newAgent })
        break
      case 'LimitsUpdated':
        out.push({ ...common, kind: 'limits' })
        break
      default:
        break
    }
  }
  return out
}

export function useVaultEvents() {
  return useQuery({
    queryKey: ['vault', 'events', VAULT_ADDRESS],
    enabled: VAULT_ADDRESS !== null,
    refetchInterval: 6000,
    queryFn: () => {
      if (!VAULT_ADDRESS) throw new Error('Vault not deployed')
      return fetchEvents(VAULT_ADDRESS)
    },
  })
}

/** Current whitelist reconstructed from AllowedRecipientUpdated events. */
export function allowedFromEvents(events: VaultEvent[] | undefined): Address[] {
  const state = new Map<string, boolean>()
  const names = new Map<string, Address>()
  for (const e of events ?? []) {
    if (e.kind === 'recipient' && e.to) {
      state.set(e.to.toLowerCase(), Boolean(e.allowed))
      names.set(e.to.toLowerCase(), e.to)
    }
  }
  return [...state.entries()].filter(([, v]) => v).map(([k]) => names.get(k) as Address)
}
