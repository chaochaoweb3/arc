import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import { formatUnitsFixed } from '@/onchain-money'

export const REASON_PER_TX = 1
export const REASON_RECIPIENT = 2
export const REASON_DAILY = 4

export function reasonLabels(mask: number): string[] {
  const out: string[] = []
  if (mask & REASON_PER_TX) out.push('Over the per-transaction limit')
  if (mask & REASON_RECIPIENT) out.push('Recipient is not whitelisted')
  if (mask & REASON_DAILY) out.push('Over the daily limit')
  return out
}

export function isUserRejection(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false
  return err.walk((e) => e instanceof UserRejectedRequestError) !== null
}

export interface RevertInfo {
  /** Solidity custom error name when it could be decoded. */
  name: string | null
  /** Plain-language explanation. */
  message: string
}

const usd = (v: unknown) => (typeof v === 'bigint' ? `${formatUnitsFixed(v, 6, 2)} USDC` : String(v))

export function describeRevert(err: unknown): RevertInfo {
  if (err instanceof BaseError) {
    const hit = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (hit instanceof ContractFunctionRevertedError) {
      const name = hit.data?.errorName ?? null
      const args = hit.data?.args ?? []
      switch (name) {
        case 'OwnableUnauthorizedAccount':
          return {
            name,
            message: `Rejected: only the owner can do this. ${String(args[0])} is not the owner.`,
          }
        case 'NotAgent':
          return { name, message: 'Rejected: the caller is not the registered agent.' }
        case 'InsufficientBalance':
          return {
            name,
            message: `Rejected: the vault holds ${usd(args[0])} but ${usd(args[1])} is needed.`,
          }
        case 'QueueFull':
          return { name, message: 'Rejected: the pending queue is full. The owner must clear requests first.' }
        case 'NotPending':
          return { name, message: 'Rejected: this request was already processed or does not exist.' }
        case 'InvalidRecipient':
          return { name, message: 'Rejected: invalid recipient address.' }
        case 'InvalidAmount':
          return { name, message: 'Rejected: amount must be greater than zero.' }
        case 'AgentIsOwner':
          return { name, message: 'Rejected: the agent cannot be the owner.' }
        case 'OwnershipRenunciationDisabled':
          return { name, message: 'Rejected: ownership can never be renounced.' }
        default:
          return { name, message: hit.reason ?? hit.shortMessage }
      }
    }
    return { name: null, message: err.shortMessage }
  }
  return { name: null, message: err instanceof Error ? err.message : 'Unknown error' }
}
