import { useState } from 'react'
import { Send } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { demoAgent, demoPayee } from '@/lib/agent'
import { agentRequestPayment, type AgentOutcome } from '@/lib/agentTx'
import { isAddress40, tryParseUsdc, usd } from '@/lib/format'
import { useUsdcBalance } from '@/hooks/useUsdc'
import type { VaultSnapshot } from '@/hooks/useVault'
import { AddressLink, Badge, Button, Card, Field, Input } from './ui'
import { Outcome } from './Outcome'

export function AgentPanel({ snap }: { snap: VaultSnapshot }) {
  const queryClient = useQueryClient()
  const gas = useUsdcBalance(demoAgent.address)
  const [to, setTo] = useState<string>(demoPayee)
  const [amount, setAmount] = useState('0.10')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<AgentOutcome | null>(null)

  const isAgent = snap.agent.toLowerCase() === demoAgent.address.toLowerCase()
  const raw = tryParseUsdc(amount)
  const valid = isAddress40(to) && raw !== null && raw > 0n

  async function submit(target: string, value: bigint | null) {
    if (!isAddress40(target) || value === null || value <= 0n) return
    setBusy(true)
    setOutcome(null)
    setOutcome(await agentRequestPayment(target.trim() as Address, value))
    await queryClient.invalidateQueries({ queryKey: ['vault'] })
    await queryClient.invalidateQueries({ queryKey: ['usdc'] })
    setBusy(false)
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
      <Card
        title="Request a payment"
        hint="This is everything the agent can do. The vault decides whether the payment pays out now or waits for the owner."
      >
        <div className="flex flex-col gap-3">
          {!isAgent && (
            <p className="rounded-2xl bg-[#fbf1da] p-3 text-sm text-[#8a5a0b]">
              The demo agent is not the vault's agent yet. Ask the owner to run the demo setup, then come back.
            </p>
          )}
          <Field label="Recipient">
            <Input value={to} onChange={(e) => setTo(e.target.value)} aria-label="Recipient" className="font-mono text-xs" />
          </Field>
          <Field label="Amount (USDC)">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setTo(demoPayee)
                setAmount('0.10')
              }}
            >
              0.10 to demo payee
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setTo(demoPayee)
                setAmount('0.50')
              }}
            >
              0.50 to demo payee
            </Button>
          </div>
          <Button disabled={!isAgent || !valid} loading={busy} onClick={() => submit(to, raw)}>
            <Send className="size-4" /> Request payment
          </Button>
          {outcome && <Outcome outcome={outcome} />}
        </div>
      </Card>
      <Card title="Agent identity">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[#5b6b86]">Demo agent key</dt>
            <dd>
              <AddressLink address={demoAgent.address} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[#5b6b86]">Authorized onchain</dt>
            <dd>{isAgent ? <Badge tone="green">yes</Badge> : <Badge tone="amber">no</Badge>}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[#5b6b86]">Gas balance</dt>
            <dd className="tabular-nums">{gas.data === undefined ? '…' : usd(gas.data)} USDC</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[#5b6b86]">Left to spend today</dt>
            <dd className="tabular-nums">{usd(snap.remainingToday)} USDC</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[#7a889f]">
          A throwaway testnet key stored in this browser. A real agent would hold its own key and call the same one function.
        </p>
      </Card>
    </div>
  )
}
