import type { VaultEvent, VaultSnapshot } from '@/hooks/useVault'
import type { useWalletTx } from '@/hooks/useOwnerTx'

export interface OwnerProps {
  snap: VaultSnapshot
  events: VaultEvent[] | undefined
  run: ReturnType<typeof useWalletTx>['run']
  busy: boolean
  /** True only when the connected wallet is the vault owner. */
  canAct: boolean
}
