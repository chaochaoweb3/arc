import { reasonLabels } from '@/lib/errors'
import { shortAddr, usd } from '@/lib/format'
import type { VaultEvent } from '@/hooks/useVault'
import { Badge, Card, TxLink } from './ui'

function describe(e: VaultEvent): { tone: 'green' | 'amber' | 'red' | 'blue' | 'neutral'; tag: string; text: string } {
  const amt = e.amount !== undefined ? `${usd(e.amount)} USDC` : ''
  const to = e.to ? shortAddr(e.to) : ''
  switch (e.kind) {
    case 'executed':
      return { tone: 'green', tag: 'Paid instantly', text: `${amt} to ${to}` }
    case 'queued':
      return { tone: 'amber', tag: 'Queued', text: `#${e.id} ${amt} to ${to}: ${reasonLabels(e.reasons ?? 0).join(', ')}` }
    case 'approved':
      return { tone: 'green', tag: 'Approved', text: `#${e.id} ${amt} to ${to}` }
    case 'rejected':
      return { tone: 'red', tag: 'Rejected', text: `Request #${e.id}` }
    case 'deposit':
      return { tone: 'blue', tag: 'Funded', text: amt }
    case 'withdraw':
      return { tone: 'blue', tag: 'Withdrawn', text: `${amt} to ${to}` }
    case 'recipient':
      return { tone: 'neutral', tag: e.allowed ? 'Whitelisted' : 'Removed', text: to }
    case 'agent':
      return { tone: 'neutral', tag: 'Agent set', text: e.agent ? shortAddr(e.agent) : '' }
    case 'limits':
      return { tone: 'neutral', tag: 'Limits changed', text: '' }
  }
}

export function ActivityFeed({ events }: { events: VaultEvent[] | undefined }) {
  const recent = [...(events ?? [])].reverse().slice(0, 14)
  return (
    <Card title="Onchain activity" hint="Read straight from the vault's event log on Arc Testnet.">
      <ul className="flex flex-col gap-2">
        {recent.length === 0 && <li className="text-sm text-[#7a889f]">No activity yet.</li>}
        {recent.map((e) => {
          const d = describe(e)
          return (
            <li key={e.key} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={d.tone}>{d.tag}</Badge>
                <span className="tabular-nums text-pretty">{d.text}</span>
              </span>
              <TxLink hash={e.tx} label="Tx" />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
