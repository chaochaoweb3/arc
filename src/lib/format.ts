import { formatUnitsFixed, parseUsdc } from '@/onchain-money'

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** USDC (6-decimal ERC-20 view) with two decimals. */
export const usd = (raw: bigint) => formatUnitsFixed(raw, 6, 2)

/** Parses a user-typed USDC amount, returning null when invalid. */
export function tryParseUsdc(value: string): bigint | null {
  try {
    const v = value.trim()
    if (!v) return null
    return parseUsdc(v)
  } catch {
    return null
  }
}

export const isAddress40 = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim())

export function timeAgo(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
