import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Bot, KeyRound, ShieldAlert, Vault } from 'lucide-react'
import { clsx } from 'clsx'
import { VAULT_ADDRESS } from '@/deployment'
import { useVaultEvents, useVaultSnapshot, type VaultSnapshot } from '@/hooks/useVault'
import { useWalletTx } from '@/hooks/useOwnerTx'
import { usd } from '@/lib/format'
import { AddressLink, Badge, Card, TxStatus } from '@/components/ui'
import { DemoSetup, FundAndLimits } from '@/components/OwnerPanel'
import { AgentSettingsPanel, WhitelistPanel } from '@/components/AdminPanels'
import { QueuePanel } from '@/components/QueuePanel'
import { ActivityFeed } from '@/components/ActivityFeed'
import { AgentPanel } from '@/components/AgentPanel'
import { BreakPanel } from '@/components/BreakPanel'

type Tab = 'owner' | 'agent' | 'break'

const TABS: { id: Tab; label: string; icon: typeof Vault }[] = [
  { id: 'owner', label: 'Owner', icon: KeyRound },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'break', label: 'Try to break it', icon: ShieldAlert },
]

function Hero({ snap }: { snap: VaultSnapshot }) {
  const pct = snap.dailyLimit === 0n ? 0 : Number((snap.spentToday * 100n) / snap.dailyLimit)
  return (
    <Card className="bg-gradient-to-br from-white/90 to-[#e3ecf8]/80">
      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5b6b86]">Vault balance</p>
          <p className="font-display text-5xl font-bold tracking-[-0.03em] tabular-nums">
            {usd(snap.balance)} <span className="text-2xl text-[#5b6b86]">USDC</span>
          </p>
          <p className="mt-1 text-sm text-[#5b6b86]">
            Owner <AddressLink address={snap.owner} /> · Agent{' '}
            {snap.agent === '0x0000000000000000000000000000000000000000' ? 'revoked' : <AddressLink address={snap.agent} />}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Per payment" value={`${usd(snap.perTxLimit)} USDC`} />
          <Stat label="Per day" value={`${usd(snap.dailyLimit)} USDC`} />
          <div className="col-span-2">
            <div className="mb-1 flex justify-between text-xs text-[#5b6b86]">
              <span>Agent spent today</span>
              <span className="tabular-nums">
                {usd(snap.spentToday)} / {usd(snap.dailyLimit)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#1b3158]/10">
              <div className="h-full rounded-full bg-[#1b3158]" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-2">
      <p className="text-xs uppercase tracking-[0.08em] text-[#7a889f]">{label}</p>
      <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Dashboard({ snap }: { snap: VaultSnapshot }) {
  const [tab, setTab] = useState<Tab>('owner')
  const { address, isConnected } = useAccount()
  const events = useVaultEvents()
  const { state, run, busy } = useWalletTx()
  const canAct = isConnected && address?.toLowerCase() === snap.owner.toLowerCase()
  const ownerProps = { snap, events: events.data, run, busy, canAct }

  return (
    <div className="flex flex-col gap-4">
      <Hero snap={snap} />
      <nav className="flex gap-1 rounded-3xl bg-white/60 p-1.5" aria-label="Sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id}
            className={clsx(
              'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold transition',
              tab === id ? 'bg-[#1b3158] text-white' : 'text-[#3c4b66] hover:bg-white',
            )}
          >
            <Icon className="size-4" /> {label}
            {id === 'owner' && snap.pendingCount > 0n && <Badge tone="amber">{snap.pendingCount.toString()}</Badge>}
          </button>
        ))}
      </nav>

      {tab === 'owner' && (
        <div className="flex flex-col gap-4">
          {!isConnected && (
            <Card>
              <p className="text-sm">Connect the owner wallet to act on the vault.</p>
            </Card>
          )}
          {isConnected && !canAct && (
            <Card>
              <p className="text-sm text-[#8a5a0b]">
                The connected wallet is not the vault owner. Connect <AddressLink address={snap.owner} /> to use these controls.
              </p>
            </Card>
          )}
          <TxStatus state={state} />
          <DemoSetup {...ownerProps} />
          <QueuePanel {...ownerProps} />
          <FundAndLimits {...ownerProps} />
          <div className="grid gap-4 md:grid-cols-2">
            <WhitelistPanel {...ownerProps} />
            <AgentSettingsPanel {...ownerProps} />
          </div>
        </div>
      )}
      {tab === 'agent' && <AgentPanel snap={snap} />}
      {tab === 'break' && <BreakPanel snap={snap} />}
      <ActivityFeed events={events.data} />
    </div>
  )
}

function Body() {
  const snapshot = useVaultSnapshot()
  if (!VAULT_ADDRESS) {
    return (
      <Card title="Vault not deployed yet">
        <p className="text-sm text-[#5b6b86]">Set the deployed vault address in src/deployment.ts to enable the app.</p>
      </Card>
    )
  }
  if (snapshot.isLoading) return <Card>Reading the vault from Arc Testnet…</Card>
  if (snapshot.isError || !snapshot.data) {
    return (
      <Card title="Could not read the vault">
        <p className="text-sm text-[#9b2c24]">Check your connection to Arc Testnet and try again.</p>
      </Card>
    )
  }
  return <Dashboard snap={snapshot.data} />
}

export default function App() {
  return (
    <div className="min-h-dvh font-body">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-24 pt-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#1b3158] text-white">
              <Vault className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">AgentVault</h1>
              <p className="text-sm text-[#5b6b86]">A USDC vault your AI agent can spend from, but never abuse.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="blue">Arc Testnet</Badge>
            <ConnectKitButton />
          </div>
        </header>
        <Body />
      </div>
    </div>
  )
}
