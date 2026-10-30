import { useQuery } from '@tanstack/react-query'
import { erc20Abi, type Address } from 'viem'
import { publicClient, USDC_ADDRESS } from '@/lib/chain'
import { VAULT_ADDRESS } from '@/deployment'

/** USDC balance in the 6-decimal ERC-20 view. On Arc this is the same pool as gas. */
export function useUsdcBalance(address: Address | undefined) {
  return useQuery({
    queryKey: ['usdc', 'balance', address],
    enabled: Boolean(address),
    refetchInterval: 5000,
    queryFn: () => {
      if (!address) throw new Error('No address')
      return publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
    },
  })
}

export function useVaultAllowance(owner: Address | undefined) {
  return useQuery({
    queryKey: ['usdc', 'allowance', owner, VAULT_ADDRESS],
    enabled: Boolean(owner) && VAULT_ADDRESS !== null,
    refetchInterval: 5000,
    queryFn: () => {
      if (!owner || !VAULT_ADDRESS) throw new Error('Missing owner or vault')
      return publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, VAULT_ADDRESS],
      })
    },
  })
}
