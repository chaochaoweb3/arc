import { Check, X } from 'lucide-react'
import { agentVaultAbi } from '@/abi'
import { VAULT_ADDRESS } from '@/deployment'
import { CHAIN_ID } from '@/lib/chain'
import { reasonLabels } from '@/lib/errors'
import { timeAgo, usd } from '@/lib/format'
import { REQUEST_APPROVED, REQUEST_PENDING, REQUEST_REJECTED, type VaultRequest } from '@/hooks/useVault'
import { AddressLink, Badge, Button, Card } from './ui'
import type { OwnerProps } from './ownerTypes'

function ReasonBadges({ mask }: { mask: number }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {reasonLabels(mask).map((r) => (
        <Badge key={r} tone="amber">
          {r}
        </Badge>
      ))}
    </span>
  )
}

function Row({ r, children }: { r: VaultRequest; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-white/75 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs text-[#5b6b86]">#{r.id.toString()}</span>
          <strong className="font-display text-base tabular-nums">{usd(r.amount)} USDC</strong>
          <span className="text-[#5b6b86]">to</span>
          <AddressLink address={r.to} />
          <span className="text-xs text-[#7a889f]">{timeAgo(Number(r.createdAt))}</span>
        </div>
        <ReasonBadges mask={r.reasons} />
      </div>
      {children}
    </li>
  )
}

export function QueuePanel({ snap, run, busy, canAct }: OwnerProps) {
  const pending = snap.requests.filter((r) => r.status === REQUEST_PENDING)
  const done = snap.requests.filter((r) => r.status !== REQUEST_PENDING).slice(0, 8)

  const decide = (id: bigint, fn: 'approveRequest' | 'rejectRequest') =>
    run(fn === 'approveRequest' ? `Approve #${id}` : `Reject #${id}`, (w) => {
      if (!VAULT_ADDRESS) throw new Error('Vault not deployed')
      return w({ address: VAULT_ADDRESS, abi: agentVaultAbi, functionName: fn, args: [id], chainId: CHAIN_ID })
    })

  return (
    <Card
      title="Pending approvals"
      hint="Payments that broke a rule wait here. Each request can be approved or rejected exactly once."
      action={<Badge tone={pending.length ? 'amber' : 'neutral'}>{snap.pendingCount.toString()} pending</Badge>}
    >
      <ul className="flex flex-col gap-2">
        {pending.length === 0 && <li className="text-sm text-[#7a889f]">Nothing is waiting for you.</li>}
        {pending.map((r) => (
          <Row key={r.id.toString()} r={r}>
            <div className="flex gap-2">
              <Button variant="success" disabled={!canAct || busy} onClick={() => decide(r.id, 'approveRequest')}>
                <Check className="size-4" /> Approve
              </Button>
              <Button variant="ghost" disabled={!canAct || busy} onClick={() => decide(r.id, 'rejectRequest')}>
                <X className="size-4" /> Reject
              </Button>
            </div>
          </Row>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#3c4b66]">Processed requests</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {done.map((r) => (
              <Row key={r.id.toString()} r={r}>
                {r.status === REQUEST_APPROVED && <Badge tone="green">Approved and paid</Badge>}
                {r.status === REQUEST_REJECTED && <Badge tone="red">Rejected</Badge>}
              </Row>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
