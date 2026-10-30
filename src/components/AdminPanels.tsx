import { useState } from 'react'
import { erc20Abi, zeroAddress, type Address } from 'viem'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { agentVaultAbi } from '@/abi'
import { VAULT_ADDRESS } from '@/deployment'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/chain'
import { demoAgent, demoPayee } from '@/lib/agent'
import { isAddress40, tryParseUsdc, usd } from '@/lib/format'
import { allowedFromEvents } from '@/hooks/useVault'
import { useUsdcBalance } from '@/hooks/useUsdc'
import { AddressLink, Badge, Button, Card, Input } from './ui'
import type { OwnerProps } from './ownerTypes'

export function WhitelistPanel({ snap: _snap, events, run, busy, canAct }: OwnerProps) {
  const [value, setValue] = useState('')
  const allowed = allowedFromEvents(events)
  const valid = isAddress40(value)

  const setAllowed = (to: Address, on: boolean) =>
    run(on ? 'Whitelist recipient' : 'Remove recipient', (w) => {
      if (!VAULT_ADDRESS) throw new Error('Vault not deployed')
      return w({ address: VAULT_ADDRESS, abi: agentVaultAbi, functionName: 'setAllowedRecipient', args: [to, on], chainId: CHAIN_ID })
    })

  return (
    <Card title="Recipient whitelist" hint="Only these addresses can receive instant agent payments. Anything else waits for your approval.">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input placeholder="0x recipient address" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Recipient address" />
          <Button
            disabled={!canAct || busy || !valid}
            onClick={async () => {
              if (await setAllowed(value.trim() as Address, true)) setValue('')
            }}
          >
            Add
          </Button>
        </div>
        <Button variant="ghost" disabled={!canAct || busy} onClick={() => setAllowed(demoPayee, true)}>
          <ShieldCheck className="size-4" /> Whitelist the demo payee
        </Button>
        <ul className="flex flex-col gap-2">
          {allowed.length === 0 && <li className="text-sm text-[#7a889f]">No recipients whitelisted yet.</li>}
          {allowed.map((a) => (
            <li key={a} className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2">
              <span className="flex items-center gap-2">
                <AddressLink address={a} />
                {a.toLowerCase() === demoPayee.toLowerCase() && <Badge tone="blue">demo payee</Badge>}
              </span>
              <button
                aria-label={`Remove ${a}`}
                disabled={!canAct || busy}
                onClick={() => void setAllowed(a, false)}
                className="grid size-11 place-items-center rounded-xl text-[#9b2c24] hover:bg-[#f9dedb] disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

export function AgentSettingsPanel({ snap, run, busy, canAct }: OwnerProps) {
  const [value, setValue] = useState('')
  const gas = useUsdcBalance(demoAgent.address)
  const isDemo = snap.agent.toLowerCase() === demoAgent.address.toLowerCase()
  const revoked = snap.agent === zeroAddress

  const setAgent = (a: Address) =>
    run(a === zeroAddress ? 'Revoke agent' : 'Set agent', (w) => {
      if (!VAULT_ADDRESS) throw new Error('Vault not deployed')
      return w({ address: VAULT_ADDRESS, abi: agentVaultAbi, functionName: 'setAgent', args: [a], chainId: CHAIN_ID })
    })

  const sendGas = () => {
    const amount = tryParseUsdc('0.30')
    if (amount === null) return Promise.resolve(false)
    return run('Fund demo agent gas', (w) =>
      w({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [demoAgent.address, amount], chainId: CHAIN_ID }),
    )
  }

  return (
    <Card title="Agent" hint="Exactly one address may request payments. The agent has no other power over the vault.">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#5b6b86]">Current agent</span>
          {revoked ? <Badge tone="amber">revoked</Badge> : <AddressLink address={snap.agent} />}
          {isDemo && <Badge tone="blue">demo agent</Badge>}
        </div>
        <div className="flex gap-2">
          <Input placeholder="0x new agent address" value={value} onChange={(e) => setValue(e.target.value)} aria-label="New agent address" />
          <Button disabled={!canAct || busy || !isAddress40(value)} onClick={() => setAgent(value.trim() as Address)}>
            Set
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!canAct || busy || isDemo} onClick={() => setAgent(demoAgent.address)}>
            Use the demo agent
          </Button>
          <Button variant="danger" disabled={!canAct || busy || revoked} onClick={() => setAgent(zeroAddress)}>
            Revoke agent
          </Button>
        </div>
        <div className="rounded-2xl bg-[#e8eff9] p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Demo agent <AddressLink address={demoAgent.address} /> holds{' '}
              <strong className="tabular-nums">{gas.data === undefined ? '…' : usd(gas.data)} USDC</strong> for gas
            </span>
            <Button variant="ghost" disabled={!canAct || busy} onClick={sendGas}>
              Send 0.30 USDC
            </Button>
          </div>
          <p className="mt-1 text-xs text-[#5b6b86]">
            The demo agent is a throwaway testnet key stored in this browser. Arc pays gas in USDC, so it needs a little to sign.
          </p>
        </div>
      </div>
    </Card>
  )
}
