import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { addressUrl, txUrl } from '@/lib/chain'
import { shortAddr } from '@/lib/format'
import type { TxState } from '@/hooks/useOwnerTx'

export function Card({
  title,
  hint,
  children,
  className,
  action,
}: {
  title?: string
  hint?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section className={clsx('rounded-3xl border border-white/70 bg-white/70 p-5 shadow-[0_8px_32px_rgba(27,49,88,0.06)] backdrop-blur', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-lg font-semibold tracking-tight text-[#14213d]">{title}</h2>}
            {hint && <p className="mt-0.5 max-w-prose text-pretty text-sm text-[#5b6b86]">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

type Variant = 'primary' | 'ghost' | 'danger' | 'success'

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  onClick,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  variant?: Variant
  loading?: boolean
  onClick?: () => unknown
}) {
  const styles: Record<Variant, string> = {
    primary: 'bg-[#1b3158] text-white hover:bg-[#14213d]',
    ghost: 'border border-[#1b3158]/20 bg-white/60 text-[#1b3158] hover:bg-white',
    danger: 'bg-[#b4372f] text-white hover:bg-[#962d26]',
    success: 'bg-[#1f7a52] text-white hover:bg-[#186241]',
  }
  return (
    <button
      {...rest}
      onClick={() => {
        void onClick?.()
      }}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
        styles[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#7a889f]">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'min-h-11 w-full rounded-2xl border border-[#1b3158]/15 bg-white/80 px-3 text-sm tabular-nums text-[#14213d] outline-none placeholder:text-[#9aa7bc] focus:border-[#1b3158]/50 focus:ring-2 focus:ring-[#acc6e9]',
        props.className,
      )}
    />
  )
}

type Tone = 'neutral' | 'green' | 'red' | 'amber' | 'blue'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-[#e9edf3] text-[#3c4b66]',
    green: 'bg-[#dcf2e6] text-[#17623f]',
    red: 'bg-[#f9dedb] text-[#9b2c24]',
    amber: 'bg-[#faecd0] text-[#8a5a0b]',
    blue: 'bg-[#dbe7f7] text-[#1b3158]',
  }
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      href={addressUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-[#1b3158] underline decoration-[#1b3158]/25 underline-offset-2 hover:decoration-[#1b3158]"
      title={address}
    >
      {label ?? shortAddr(address)}
      <ExternalLink className="size-3" />
    </a>
  )
}

export function TxLink({ hash, label = 'View transaction' }: { hash: string; label?: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b3158] underline underline-offset-2"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  )
}

export function TxStatus({ state }: { state: TxState }) {
  if (state.phase === 'idle') return null
  const tone =
    state.phase === 'error'
      ? 'border-[#b4372f]/30 bg-[#fbe9e7] text-[#8a2b24]'
      : state.phase === 'success'
        ? 'border-[#1f7a52]/30 bg-[#e3f4ec] text-[#17623f]'
        : 'border-[#1b3158]/20 bg-[#e8eff9] text-[#1b3158]'
  const text =
    state.phase === 'wallet'
      ? 'Confirm in your wallet'
      : state.phase === 'confirming'
        ? 'Waiting for confirmation'
        : state.phase === 'success'
          ? 'Confirmed'
          : 'Failed'
  return (
    <div role="status" className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 text-sm', tone)}>
      {(state.phase === 'wallet' || state.phase === 'confirming') && <Loader2 className="size-4 animate-spin" />}
      <span className="font-semibold">
        {state.label}: {text}
      </span>
      {state.error && <span className="text-pretty">{state.error}</span>}
      {state.hash && <TxLink hash={state.hash} />}
    </div>
  )
}
