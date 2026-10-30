import { useState } from 'react'
import { Bomb, Play } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { parseUnits } from 'viem'
import { agentVaultAbi } from '@/abi'
import { VAULT_ADDRESS } from '@/deployment'
import { demoAgent, demoPayee, randomStranger } from '@/lib/agent'
import { publicClient } from '@/lib/chain'
import { agentRequestPayment, privilegedAttempts, PRIVILEGED_ACTIONS, type AgentOutcome } from '@/lib/agentTx'
import { usd } from '@/lib/format'
import { useUsdcBalance } from '@/hooks/useUsdc'
import { REQUEST_PENDING, type VaultSnapshot } from '@/hooks/useVault'
import { Badge, Button, Card } from './ui'
import { Outcome } from './Outcome'

interface Result {
  outcome: AgentOutcome
  before: bigint
  after: bigint
}

type AttackId = 'overLimit' | 'stranger' | 'admin'

async function vaultBalance(): Promise<bigint> {
  if (!VAULT_ADDRESS) return 0n
  return publicClient.readContract({ address: VAULT_ADDRESS, abi: agentVaultAbi, functionName: 'balance' })
}

function AttackCard({
  n,
  title,
  attempt,
  expect,
  result,
  running,
  onRun,
  disabled,
  children,
}: {
  n: number
  title: string
  attempt: string
  expect: string
  result?: Result
  running: boolean
  onRun: () => unknown
  disabled: boolean
  children?: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#1b3158] font-display text-sm font-bold text-white">{n}</span>
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="text-pretty text-sm text-[#5b6b86]">{attempt}</p>
        </div>
      </div>
      <p className="text-xs uppercase tracking-[0.08em] text-[#7a889f]">Expected: {expect}</p>
      {children}
      <Button variant="danger" disabled={disabled} loading={running} onClick={onRun}>
        <Bomb className="size-4" /> Try it
      </Button>
      {result && (
        <div className="flex flex-col gap-2">
          <Outcome outcome={result.outcome} />
          <p className="text-xs tabular-nums text-[#5b6b86]">
            Vault balance: {usd(result.before)} USDC before, {usd(result.after)} USDC after.{' '}
            {result.before === result.after ? <Badge tone="green">no funds moved</Badge> : <Badge tone="amber">balance changed</Badge>}
          </p>
        </div>
      )}
    </Card>
  )
}

export function BreakPanel({ snap }: { snap: VaultSnapshot }) {
  const queryClient = useQueryClient()
  const gas = useUsdcBalance(demoAgent.address)
  const [results, setResults] = useState<Partial<Record<AttackId, Result>>>({})
  const [running, setRunning] = useState<AttackId | 'all' | null>(null)
  const [privilegedId, setPrivilegedId] = useState('withdraw')

  const isAgent = snap.agent.toLowerCase() === demoAgent.address.toLowerCase()
  const hasGas = (gas.data ?? 0n) >= parseUnits('0.02', 6)
  const ready = isAgent && hasGas
  const pendingId = snap.requests.find((r) => r.status === REQUEST_PENDING)?.id ?? 1n

  async function attack(id: AttackId): Promise<void> {
    const before = await vaultBalance()
    let outcome: AgentOutcome
    if (id === 'overLimit') {
      outcome = await agentRequestPayment(demoPayee, parseUnits('0.5', 6))
    } else if (id === 'stranger') {
      outcome = await agentRequestPayment(randomStranger(), parseUnits('0.05', 6))
    } else {
      const list = privilegedAttempts(parseUnits('0.1', 6), pendingId)
      const pick = list.find((a) => a.id === privilegedId) ?? list[0]
      outcome = await pick.run()
    }
    const after = await vaultBalance()
    setResults((r) => ({ ...r, [id]: { outcome, before, after } }))
    await queryClient.invalidateQueries({ queryKey: ['vault'] })
    await queryClient.invalidateQueries({ queryKey: ['usdc'] })
  }

  async function runOne(id: AttackId) {
    setRunning(id)
    await attack(id)
    setRunning(null)
  }

  async function runAll() {
    setRunning('all')
    for (const id of ['overLimit', 'stranger', 'admin'] as const) await attack(id)
    setRunning(null)
  }

  const locked = !ready || running !== null

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Try to break it"
        hint="Three attacks, signed by the agent key against the live contract on Arc Testnet. Every result below is a real transaction or a real onchain rejection."
        action={
          <Button disabled={locked} loading={running === 'all'} onClick={runAll}>
            <Play className="size-4" /> Run all three
          </Button>
        }
      >
        {!ready && (
          <p className="rounded-2xl bg-[#fbf1da] p-3 text-sm text-[#8a5a0b]">
            {!isAgent
              ? 'The demo agent is not authorized yet. Connect the owner wallet and run the demo setup on the Owner tab.'
              : 'The demo agent needs a little USDC for gas. Send it from the Owner tab.'}
          </p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <AttackCard
          n={1}
          title="Pay over the limit"
          attempt="The agent asks to send 0.50 USDC, more than the 0.20 per-payment limit, to the whitelisted payee."
          expect="queued, not paid"
          result={results.overLimit}
          running={running === 'overLimit' || running === 'all'}
          disabled={locked}
          onRun={() => runOne('overLimit')}
        />
        <AttackCard
          n={2}
          title="Pay a stranger"
          attempt="The agent asks to send 0.05 USDC to a brand-new address that is not on the whitelist."
          expect="queued, not paid"
          result={results.stranger}
          running={running === 'stranger' || running === 'all'}
          disabled={locked}
          onRun={() => runOne('stranger')}
        />
        <AttackCard
          n={3}
          title="Take over the vault"
          attempt="The agent calls an owner-only function directly. Withdrawing the funds to itself is the default."
          expect="reverted by the contract"
          result={results.admin}
          running={running === 'admin' || running === 'all'}
          disabled={locked}
          onRun={() => runOne('admin')}
        >
          <select
            aria-label="Privileged action"
            value={privilegedId}
            onChange={(e) => setPrivilegedId(e.target.value)}
            className="min-h-11 rounded-2xl border border-[#1b3158]/15 bg-white/80 px-3 text-sm"
          >
            {PRIVILEGED_ACTIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </AttackCard>
      </div>
    </div>
  )
}
