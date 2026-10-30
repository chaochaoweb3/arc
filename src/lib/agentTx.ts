import { parseEventLogs, type Address, type Hash } from 'viem'
import { agentVaultAbi } from '@/abi'
import { VAULT_ADDRESS } from '@/deployment'
import { agentWallet, demoAgent, randomStranger } from './agent'
import { publicClient } from './chain'
import { describeRevert } from './errors'

export type AgentOutcome =
  | { kind: 'executed'; hash: Hash; to: Address; amount: bigint }
  | { kind: 'queued'; hash: Hash; to: Address; amount: bigint; id: bigint; reasons: number }
  | { kind: 'reverted'; hash?: Hash; errorName: string | null; message: string }
  | { kind: 'unexpected-success'; message: string }

function vault(): Address {
  if (!VAULT_ADDRESS) throw new Error('Vault not deployed')
  return VAULT_ADDRESS
}

/** The agent's one capability. Simulates first so a rejection carries its exact reason. */
export async function agentRequestPayment(to: Address, amount: bigint): Promise<AgentOutcome> {
  let request
  try {
    const sim = await publicClient.simulateContract({
      account: demoAgent,
      address: vault(),
      abi: agentVaultAbi,
      functionName: 'requestPayment',
      args: [to, amount],
    })
    request = sim.request
  } catch (err) {
    const info = describeRevert(err)
    return { kind: 'reverted', errorName: info.name, message: info.message }
  }

  try {
    const hash = await agentWallet.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      return { kind: 'reverted', hash, errorName: null, message: 'The transaction reverted onchain.' }
    }
    const logs = parseEventLogs({
      abi: agentVaultAbi,
      logs: receipt.logs,
      eventName: ['PaymentExecuted', 'PaymentQueued'],
    })
    for (const log of logs) {
      if (log.eventName === 'PaymentQueued') {
        return { kind: 'queued', hash, to, amount, id: log.args.id, reasons: Number(log.args.reasons) }
      }
      if (log.eventName === 'PaymentExecuted') return { kind: 'executed', hash, to, amount }
    }
    return { kind: 'reverted', hash, errorName: null, message: 'No payment event was emitted.' }
  } catch (err) {
    return { kind: 'reverted', errorName: null, message: describeRevert(err).message }
  }
}

export interface PrivilegedAttempt {
  id: string
  label: string
  run: () => Promise<AgentOutcome>
}

const FAIL_GAS = 200_000n

export const PRIVILEGED_ACTIONS = [
  { id: 'withdraw', label: 'Withdraw funds' },
  { id: 'limits', label: 'Raise the limits' },
  { id: 'whitelist', label: 'Whitelist itself a payee' },
  { id: 'agent', label: 'Replace the agent address' },
  { id: 'approve', label: 'Approve its own pending payment' },
] as const

/**
 * Privileged calls the agent key should never be able to make. Each is simulated
 * first (a call that would succeed is NEVER sent), then broadcast with a fixed gas
 * limit so the rejection lands as a real failed transaction you can open in the explorer.
 */
export function privilegedAttempts(amount: bigint, pendingId: bigint): PrivilegedAttempt[] {
  const address = vault()
  const stranger = randomStranger()
  const base = { account: demoAgent, address, abi: agentVaultAbi } as const

  async function finish(simulate: () => Promise<unknown>, send: () => Promise<Hash>): Promise<AgentOutcome> {
    try {
      await simulate()
      return { kind: 'unexpected-success', message: 'The call would have succeeded. It was NOT sent.' }
    } catch (err) {
      const info = describeRevert(err)
      try {
        const hash = await send()
        await publicClient.waitForTransactionReceipt({ hash })
        return { kind: 'reverted', hash, errorName: info.name, message: info.message }
      } catch {
        return { kind: 'reverted', errorName: info.name, message: info.message }
      }
    }
  }

  return [
    {
      id: 'withdraw',
      label: 'Withdraw funds',
      run: () =>
        finish(
          () => publicClient.simulateContract({ ...base, functionName: 'withdraw', args: [demoAgent.address, amount] }),
          () =>
            agentWallet.writeContract({ ...base, functionName: 'withdraw', args: [demoAgent.address, amount], gas: FAIL_GAS }),
        ),
    },
    {
      id: 'limits',
      label: 'Raise the limits',
      run: () =>
        finish(
          () => publicClient.simulateContract({ ...base, functionName: 'setLimits', args: [10n ** 12n, 10n ** 12n] }),
          () => agentWallet.writeContract({ ...base, functionName: 'setLimits', args: [10n ** 12n, 10n ** 12n], gas: FAIL_GAS }),
        ),
    },
    {
      id: 'whitelist',
      label: 'Whitelist itself a payee',
      run: () =>
        finish(
          () => publicClient.simulateContract({ ...base, functionName: 'setAllowedRecipient', args: [stranger, true] }),
          () => agentWallet.writeContract({ ...base, functionName: 'setAllowedRecipient', args: [stranger, true], gas: FAIL_GAS }),
        ),
    },
    {
      id: 'agent',
      label: 'Replace the agent address',
      run: () =>
        finish(
          () => publicClient.simulateContract({ ...base, functionName: 'setAgent', args: [stranger] }),
          () => agentWallet.writeContract({ ...base, functionName: 'setAgent', args: [stranger], gas: FAIL_GAS }),
        ),
    },
    {
      id: 'approve',
      label: 'Approve its own pending payment',
      run: () =>
        finish(
          () => publicClient.simulateContract({ ...base, functionName: 'approveRequest', args: [pendingId] }),
          () => agentWallet.writeContract({ ...base, functionName: 'approveRequest', args: [pendingId], gas: FAIL_GAS }),
        ),
    },
  ]
}
