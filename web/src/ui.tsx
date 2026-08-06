import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { setLang } from './i18n'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border border-sand-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-ink-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </Card>
  )
}

export function Button({
  children, onClick, variant = 'solid', disabled, type = 'button', className = '',
}: {
  children: ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost'
  disabled?: boolean; type?: 'button' | 'submit'; className?: string
}) {
  const base = 'rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50'
  const style = variant === 'solid'
    ? 'bg-clay-600 text-white hover:bg-clay-700'
    : 'border border-sand-200 text-ink-600 hover:border-clay-400 hover:text-clay-700'
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${style} ${className}`}>
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral' }: {
  children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const tones = {
    neutral: 'bg-sand-100 text-ink-600',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-rose-50 text-rose-700',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function PageHead({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function LangSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="flex shrink-0 overflow-hidden rounded-full border border-sand-200 text-xs font-bold">
      {(['uk', 'pl'] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1.5 uppercase transition-colors ${
                  i18n.language === l ? 'bg-ink-900 text-white' : 'text-ink-400 hover:text-ink-800'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-2xl border border-sand-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-sand-200 text-left">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Disclaimer() {
  const { t } = useTranslation()
  return (
    <p className="mx-auto max-w-3xl px-4 py-6 text-center text-xs leading-relaxed text-ink-400">
      {t('disclaimer')}
    </p>
  )
}
