import { useCallback, useState } from 'react'
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import type { Hash } from 'viem'
import { CHAIN_ID, publicClient } from '@/lib/chain'
import { describeRevert, isUserRejection } from '@/lib/errors'

export interface TxState {
  label: string
  phase: 'idle' | 'wallet' | 'confirming' | 'success' | 'error'
  hash?: Hash
  error?: string
}

const IDLE: TxState = { label: '', phase: 'idle' }

type WriteAsync = ReturnType<typeof useWriteContract>['writeContractAsync']

/** Runs a transaction signed by the connected wallet and tracks its real state. */
export function useWalletTx() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  const [state, setState] = useState<TxState>(IDLE)

  const run = useCallback(
    async (label: string, send: (write: WriteAsync) => Promise<Hash>): Promise<boolean> => {
      setState({ label, phase: 'wallet' })
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        const hash = await send(writeContractAsync)
        setState({ label, phase: 'confirming', hash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') {
          setState({ label, phase: 'error', hash, error: 'The transaction reverted onchain.' })
          return false
        }
        setState({ label, phase: 'success', hash })
        await queryClient.invalidateQueries({ queryKey: ['vault'] })
        await queryClient.invalidateQueries({ queryKey: ['usdc'] })
        return true
      } catch (err) {
        if (isUserRejection(err)) {
          setState(IDLE)
        } else {
          setState({ label, phase: 'error', error: describeRevert(err).message })
        }
        return false
      }
    },
    [chainId, switchChainAsync, writeContractAsync, queryClient],
  )

  const reset = useCallback(() => setState(IDLE), [])
  return { state, run, reset, busy: state.phase === 'wallet' || state.phase === 'confirming' }
}
