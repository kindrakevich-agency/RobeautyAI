import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setLang } from './i18n'

/* ---------- тема ---------- */

export function useDark() {
  const [dark, setDark] = useState(() => localStorage.getItem('rb-theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('rb-theme', dark ? 'dark' : 'light')
  }, [dark])
  return { dark, toggle: () => setDark((v) => !v) }
}

/* ---------- поверхні ---------- */

export function Card({ children, className = '', pad = true }: {
  children: ReactNode; className?: string; pad?: boolean
}) {
  return (
    <div className={`min-w-0 rounded-2xl border border-ink-200/60 bg-white shadow-card
                     dark:border-ink-700/60 dark:bg-ink-900 ${pad ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-lg font-semibold text-ink-950 dark:text-cream-50">
      {children}
    </h2>
  )
}

export function Stat({ label, value, hint, accent = false }: {
  label: string; value: ReactNode; hint?: string; accent?: boolean
}) {
  return (
    <Card className={`animate-rise relative overflow-hidden ${accent ? '' : ''}`}>
      {accent && (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 to-rose-300" />
      )}
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums text-ink-950 dark:text-cream-50">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</div>}
    </Card>
  )
}

/* ---------- елементи керування ---------- */

export function Button({
  children, onClick, variant = 'solid', disabled, type = 'button', className = '',
}: {
  children: ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost'
  disabled?: boolean; type?: 'button' | 'submit'; className?: string
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 ' +
    'text-sm font-semibold transition-all active:scale-[.98] disabled:opacity-50'
  const style = variant === 'solid'
    ? 'bg-rose-600 text-white shadow-sm hover:bg-rose-700'
    : 'border border-ink-200 text-ink-600 hover:border-rose-500 hover:text-rose-700 ' +
      'dark:border-ink-700 dark:text-ink-300 dark:hover:text-rose-300'
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${style} ${className}`}>
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral' }: {
  children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand'
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    brand: 'border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    good: 'bg-mint-100 text-mint-600 dark:bg-mint-600/20 dark:text-mint-400',
    warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    bad: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold
                      tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return (
    <input {...rest}
           className={`min-w-0 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm
                       text-ink-900 outline-none transition-colors placeholder:text-ink-400
                       focus:border-rose-500 dark:border-ink-700 dark:bg-ink-800
                       dark:text-cream-100 ${className}`} />
  )
}

export function PageHead({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-950 dark:text-cream-50">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function LangSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="flex shrink-0 overflow-hidden rounded-full border border-ink-200 text-xs font-bold dark:border-ink-700">
      {(['uk', 'pl'] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)}
                className={`px-2.5 py-1.5 uppercase transition-colors ${
                  i18n.language === l
                    ? 'bg-ink-900 text-cream-50 dark:bg-cream-100 dark:text-ink-900'
                    : 'text-ink-500 hover:text-ink-900 dark:hover:text-cream-100'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function ThemeToggle() {
  const { dark, toggle } = useDark()
  return (
    <button onClick={toggle} aria-label="theme"
            className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-100
                       hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800">
      {dark ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8" /></svg>
      )}
    </button>
  )
}

/* ---------- таблиця ---------- */

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-2xl border border-ink-200/60 bg-white
                    shadow-card dark:border-ink-700/60 dark:bg-ink-900">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200/70 text-left dark:border-ink-700/70">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400">
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

export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-ink-100 align-top transition-colors last:border-0
                   hover:bg-cream-100/60 dark:border-ink-800 dark:hover:bg-ink-800/40">
      {children}
    </tr>
  )
}

export function Disclaimer() {
  const { t } = useTranslation()
  return (
    <p className="mx-auto max-w-3xl px-4 py-8 text-center text-[11px] leading-relaxed text-ink-400">
      {t('disclaimer')}
    </p>
  )
}
