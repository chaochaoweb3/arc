import { useState } from 'react'
import { erc20Abi, parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import { Check, CircleDashed, Rocket } from 'lucide-react'
import { agentVaultAbi } from '@/abi'
import { VAULT_ADDRESS } from '@/deployment'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/chain'
import { demoAgent, demoPayee } from '@/lib/agent'
import { allowedFromEvents } from '@/hooks/useVault'
import { tryParseUsdc, usd } from '@/lib/format'
import { useUsdcBalance, useVaultAllowance } from '@/hooks/useUsdc'
import { Badge, Button, Card, Field, Input } from './ui'
import type { OwnerProps } from './ownerTypes'

const DEMO_DEPOSIT = parseUnits('1', 6)
const DEMO_PER_TX = parseUnits('0.2', 6)
const DEMO_DAILY = parseUnits('0.5', 6)
const DEMO_GAS = parseUnits('0.3', 6)

type StepState = 'todo' | 'running' | 'done' | 'skipped'

export function DemoSetup({ snap, events, run, busy, canAct }: OwnerProps) {
  const { address } = useAccount()
  const wallet = useUsdcBalance(address)
  const allowance = useVaultAllowance(address)
  const agentGas = useUsdcBalance(demoAgent.address)
  const [steps, setSteps] = useState<{ label: string; state: StepState }[]>([])
  const [running, setRunning] = useState(false)

  async function start() {
    if (!VAULT_ADDRESS) return
    const vault = VAULT_ADDRESS
    const missing = snap.balance < DEMO_DEPOSIT ? DEMO_DEPOSIT - snap.balance : 0n
    const limitsOk = snap.perTxLimit === DEMO_PER_TX && snap.dailyLimit === DEMO_DAILY
    const whitelisted = allowedFromEvents(events).some((a) => a.toLowerCase() === demoPayee.toLowerCase())
    const agentOk = snap.agent.toLowerCase() === demoAgent.address.toLowerCase()
    const needGas = (agentGas.data ?? 0n) < parseUnits('0.15', 6)
    const needApprove = missing > 0n && (allowance.data ?? 0n) < missing

    const plan: { label: string; skip: boolean; go: () => Promise<boolean> }[] = [
      {
        label: 'Approve USDC for the vault',
        skip: !needApprove,
        go: () =>
          run('Approve USDC', (w) =>
            w({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [vault, missing], chainId: CHAIN_ID }),
          ),
      },
      {
        label: `Fund the vault to ${usd(DEMO_DEPOSIT)} USDC`,
        skip: missing === 0n,
        go: () =>
          run('Fund vault', (w) =>
            w({ address: vault, abi: agentVaultAbi, functionName: 'deposit', args: [missing], chainId: CHAIN_ID }),
          ),
      },
      {
        label: 'Set limits: 0.20 per payment, 0.50 per day',
        skip: limitsOk,
        go: () =>
          run('Set limits', (w) =>
            w({ address: vault, abi: agentVaultAbi, functionName: 'setLimits', args: [DEMO_PER_TX, DEMO_DAILY], chainId: CHAIN_ID }),
          ),
      },
      {
        label: 'Whitelist the demo payee',
        skip: whitelisted,
        go: () =>
          run('Whitelist demo payee', (w) =>
            w({ address: vault, abi: agentVaultAbi, functionName: 'setAllowedRecipient', args: [demoPayee, true], chainId: CHAIN_ID }),
          ),
      },
      {
        label: 'Set the demo agent',
        skip: agentOk,
        go: () =>
          run('Set demo agent', (w) =>
            w({ address: vault, abi: agentVaultAbi, functionName: 'setAgent', args: [demoAgent.address], chainId: CHAIN_ID }),
          ),
      },
      {
        label: 'Send gas USDC to the demo agent',
        skip: !needGas,
        go: () =>
          run('Fund demo agent gas', (w) =>
            w({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [demoAgent.address, DEMO_GAS], chainId: CHAIN_ID }),
          ),
      },
    ]

    setRunning(true)
    setSteps(plan.map((p) => ({ label: p.label, state: p.skip ? 'skipped' : 'todo' })))
    for (let i = 0; i < plan.length; i++) {
      if (plan[i].skip) continue
      setSteps((s) => s.map((x, j) => (j === i ? { ...x, state: 'running' } : x)))
      const ok = await plan[i].go()
      if (!ok) {
        setSteps((s) => s.map((x, j) => (j === i ? { ...x, state: 'todo' } : x)))
        break
      }
      setSteps((s) => s.map((x, j) => (j === i ? { ...x, state: 'done' } : x)))
    }
    setRunning(false)
  }

  const short = wallet.data !== undefined && wallet.data < DEMO_DEPOSIT + DEMO_GAS

  return (
    <Card
      title="One-click demo setup"
      hint="Funds the vault with 1.00 USDC, sets 0.20 per-payment and 0.50 daily limits, whitelists a demo payee and authorizes the demo agent. Each step is a real transaction you sign."
    >
      <div className="flex flex-col gap-3">
        <Button disabled={!canAct || busy || running} loading={running} onClick={start}>
          <Rocket className="size-4" /> Run demo setup
        </Button>
        {short && (
          <p className="text-sm text-[#8a5a0b]">
            Your wallet holds {usd(wallet.data ?? 0n)} USDC. Setup needs about 1.30 plus gas: use Get test USDC in the Arc Studio sidebar first.
          </p>
        )}
        {steps.length > 0 && (
          <ol className="flex flex-col gap-1.5 text-sm">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                {s.state === 'done' && <Check className="size-4 text-[#1f7a52]" />}
                {s.state === 'skipped' && <Check className="size-4 text-[#9aa7bc]" />}
                {(s.state === 'todo' || s.state === 'running') && <CircleDashed className="size-4 text-[#1b3158]" />}
                <span className={s.state === 'skipped' ? 'text-[#7a889f]' : ''}>{s.label}</span>
                {s.state === 'skipped' && <Badge>already done</Badge>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  )
}

export function FundAndLimits({ snap, run, busy, canAct }: OwnerProps) {
  const { address } = useAccount()
  const wallet = useUsdcBalance(address)
  const allowance = useVaultAllowance(address)
  const [amount, setAmount] = useState('1.00')
  const [perTx, setPerTx] = useState(usd(snap.perTxLimit))
  const [daily, setDaily] = useState(usd(snap.dailyLimit))
  const [wTo, setWTo] = useState('')
  const [wAmt, setWAmt] = useState('')

  const fundRaw = tryParseUsdc(amount)
  const limitsRaw = [tryParseUsdc(perTx), tryParseUsdc(daily)] as const
  const wRaw = tryParseUsdc(wAmt)

  async function fund() {
    if (!VAULT_ADDRESS || fundRaw === null || fundRaw === 0n) return
    const vault = VAULT_ADDRESS
    if ((allowance.data ?? 0n) < fundRaw) {
      const ok = await run('Approve USDC', (w) =>
        w({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [vault, fundRaw], chainId: CHAIN_ID }),
      )
      if (!ok) return
    }
    await run('Fund vault', (w) => w({ address: vault, abi: agentVaultAbi, functionName: 'deposit', args: [fundRaw], chainId: CHAIN_ID }))
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Fund the vault" hint={`Your wallet: ${wallet.data === undefined ? '…' : usd(wallet.data)} USDC`}>
        <div className="flex flex-col gap-3">
          <Field label="Amount (USDC)">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Button disabled={!canAct || busy || !fundRaw} onClick={fund}>
            Fund vault
          </Button>
          <details className="rounded-2xl bg-white/60 p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Withdraw to an address (owner only)</summary>
            <div className="mt-3 flex flex-col gap-2">
              <Input placeholder="0x destination" value={wTo} onChange={(e) => setWTo(e.target.value)} aria-label="Withdraw destination" />
              <Input inputMode="decimal" placeholder="Amount" value={wAmt} onChange={(e) => setWAmt(e.target.value)} aria-label="Withdraw amount" />
              <Button
                variant="ghost"
                disabled={!canAct || busy || !wRaw || !/^0x[0-9a-fA-F]{40}$/.test(wTo.trim())}
                onClick={() =>
                  run('Withdraw', (w) => {
                    if (!VAULT_ADDRESS || wRaw === null) throw new Error('Invalid input')
                    return w({
                      address: VAULT_ADDRESS,
                      abi: agentVaultAbi,
                      functionName: 'withdraw',
                      args: [wTo.trim() as `0x${string}`, wRaw],
                      chainId: CHAIN_ID,
                    })
                  })
                }
              >
                Withdraw
              </Button>
            </div>
          </details>
        </div>
      </Card>
      <Card title="Spending limits" hint="Both limits bind the agent only. Your own approvals are not limited.">
        <div className="flex flex-col gap-3">
          <Field label="Per payment (USDC)">
            <Input inputMode="decimal" value={perTx} onChange={(e) => setPerTx(e.target.value)} />
          </Field>
          <Field label="Per UTC day (USDC)">
            <Input inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />
          </Field>
          <Button
            disabled={!canAct || busy || limitsRaw[0] === null || limitsRaw[1] === null}
            onClick={() =>
              run('Update limits', (w) => {
                if (!VAULT_ADDRESS || limitsRaw[0] === null || limitsRaw[1] === null) throw new Error('Invalid input')
                return w({
                  address: VAULT_ADDRESS,
                  abi: agentVaultAbi,
                  functionName: 'setLimits',
                  args: [limitsRaw[0], limitsRaw[1]],
                  chainId: CHAIN_ID,
                })
              })
            }
          >
            Update limits
          </Button>
        </div>
      </Card>
    </div>
  )
}
