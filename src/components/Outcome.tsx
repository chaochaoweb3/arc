import { CheckCircle2, Clock, ShieldAlert, ShieldX } from 'lucide-react'
import { reasonLabels } from '@/lib/errors'
import { shortAddr, usd } from '@/lib/format'
import type { AgentOutcome } from '@/lib/agentTx'
import { Badge, TxLink } from './ui'

export function Outcome({ outcome }: { outcome: AgentOutcome }) {
  if (outcome.kind === 'executed') {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl border border-[#1f7a52]/25 bg-[#e3f4ec] p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-[#17623f]">
          <CheckCircle2 className="size-4" /> Paid instantly
        </div>
        <p className="tabular-nums">
          {usd(outcome.amount)} USDC sent to {shortAddr(outcome.to)}. It was inside every limit.
        </p>
        <TxLink hash={outcome.hash} />
      </div>
    )
  }
  if (outcome.kind === 'queued') {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl border border-[#b7791f]/30 bg-[#fbf1da] p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-[#8a5a0b]">
          <Clock className="size-4" /> Queued for owner approval (request #{outcome.id.toString()})
        </div>
        <p className="tabular-nums">
          {usd(outcome.amount)} USDC to {shortAddr(outcome.to)} did not move.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {reasonLabels(outcome.reasons).map((r) => (
            <Badge key={r} tone="amber">
              {r}
            </Badge>
          ))}
        </div>
        <TxLink hash={outcome.hash} />
      </div>
    )
  }
  if (outcome.kind === 'reverted') {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl border border-[#b4372f]/25 bg-[#fbe9e7] p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-[#8a2b24]">
          <ShieldX className="size-4" /> Rejected by the contract
          {outcome.errorName && <Badge tone="red">{outcome.errorName}</Badge>}
        </div>
        <p className="text-pretty">{outcome.message}</p>
        {outcome.hash && <TxLink hash={outcome.hash} label="Failed transaction onchain" />}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#b4372f] bg-[#fbe9e7] p-3 text-sm font-semibold text-[#8a2b24]">
      <ShieldAlert className="size-4" /> {outcome.message}
    </div>
  )
}
