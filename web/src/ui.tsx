import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
    <div className={`min-w-0 rounded-2xl border border-ink-200 bg-white shadow-card
                     dark:border-ink-700/60 dark:bg-ink-900 ${pad ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="rb-display mb-3 font-display text-[13px] text-ink-950 dark:text-cream-50">
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
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ink-700 to-cream-200" />
      )}
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-600">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums text-ink-950 dark:text-cream-50">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-600 dark:text-ink-400">{hint}</div>}
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
  // Форма кнопки взята з robeauty.me: радіус 5px, ВЕЛИКІ літери, розрядка.
  const base = 'inline-flex items-center justify-center gap-1.5 rounded px-5 py-2.5 ' +
    'text-[11px] font-bold uppercase tracking-display transition-all ' +
    'active:scale-[.98] disabled:opacity-50'
  const style = variant === 'solid'
    ? 'bg-ink-900 text-white shadow-sm hover:bg-ink-950'
    : 'border border-ink-200 text-ink-600 hover:border-ink-700 hover:text-ink-950 ' +
      'dark:border-ink-700 dark:text-ink-300 dark:hover:text-cream-200'
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
    brand: 'border border-ink-700/40 bg-ink-700/10 text-ink-950 dark:text-cream-200',
    good: 'bg-cream-200 text-good-500 dark:bg-good-500/20 dark:text-good-300',
    warn: 'bg-warn-500/10 text-warn-500 dark:bg-warn-300/15 dark:text-warn-300',
    bad: 'bg-crit-500/10 text-crit-500 dark:bg-crit-300/10 dark:text-crit-300',
  }
  return (
    <span className={`inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-bold
                      uppercase tracking-display ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return (
    <input {...rest}
           className={`min-w-0 rounded border border-ink-200 bg-white px-3.5 py-2 text-sm
                       text-ink-900 outline-none transition-colors placeholder:text-ink-600
                       focus:border-ink-700 dark:border-ink-700 dark:bg-ink-800
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
        {subtitle && <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function LangSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="flex shrink-0 overflow-hidden rounded border border-ink-200 text-[11px] font-bold dark:border-ink-700">
      {(['uk', 'pl'] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)}
                className={`min-h-[38px] min-w-[38px] px-3 uppercase transition-colors ${
                  i18n.language === l
                    ? 'bg-ink-900 text-cream-50 dark:bg-cream-100 dark:text-ink-900'
                    : 'text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-cream-100'}`}>
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
            className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-100
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

/* ---------- таблиця з сортуванням ---------- */

export type SortState = { key: string; dir: 'asc' | 'desc' } | null

/** Клік по заголовку: asc → desc → без сортування. */
export function Table({ head, children, sort, onSort }: {
  head: (string | { label: string; sortKey?: string })[]
  children: ReactNode
  sort?: SortState
  onSort?: (s: SortState) => void
}) {
  const toggle = (key: string) => {
    if (!onSort) return
    if (!sort || sort.key !== key) onSort({ key, dir: 'asc' })
    else if (sort.dir === 'asc') onSort({ key, dir: 'desc' })
    else onSort(null)
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-2xl border border-ink-200 bg-white
                    shadow-card dark:border-ink-700/60 dark:bg-ink-900">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left dark:border-ink-700/70">
            {head.map((h, i) => {
              const label = typeof h === 'string' ? h : h.label
              const key = typeof h === 'string' ? undefined : h.sortKey
              const active = key && sort?.key === key
              return (
                <th key={i} className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-600">
                  {key ? (
                    <button onClick={() => toggle(key)}
                            className={`-my-2 inline-flex min-h-[38px] items-center gap-1 transition-colors hover:text-ink-800 dark:hover:text-cream-100 ${
                              active ? 'text-ink-950 dark:text-cream-200' : ''}`}>
                      {label}
                      <span className="text-[9px]">
                        {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  ) : label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** Сортування рядків за поточним станом. `get` дістає значення колонки. */
export function applySort<T>(rows: T[], sort: SortState, get: (row: T, key: string) => unknown): T[] {
  if (!sort) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key)
    const y = get(b, sort.key)
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x).localeCompare(String(y), 'uk') * dir
  })
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
    <p className="mx-auto max-w-3xl px-4 py-8 text-center text-[11px] leading-relaxed text-ink-600">
      {t('disclaimer')}
    </p>
  )
}


/* ---------- діалог ---------- */

/**
 * Модальне вікно. Рендериться порталом у body — інакше будь-який предок із
 * backdrop-filter (у нас це шапка) стає контейнером для position:fixed, і
 * затемнення накриває лише його, а не сторінку.
 */
export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean; onClose: () => void; title: string
  children: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
         role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-lg" onClick={onClose} />
      <div className={`animate-rise relative max-h-[88vh] w-full overflow-y-auto rounded-2xl
                       border border-ink-200 bg-white p-6 shadow-pop dark:border-ink-700
                       dark:bg-ink-900 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-xl font-semibold text-ink-950 dark:text-cream-50">{title}</h3>
          <button onClick={onClose} aria-label="close"
                  className="rounded-full p-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink-800
                             dark:hover:bg-ink-800 dark:hover:text-cream-100 dark:text-cream-100">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- дрібні елементи ---------- */

export function Status({ kind, children }: {
  kind: 'ok' | 'warn' | 'bad' | 'idle'; children: ReactNode
}) {
  const dot = {
    ok: 'bg-good-500 dark:bg-good-300', warn: 'bg-warn-500 dark:bg-warn-300', bad: 'bg-crit-500 dark:bg-crit-300', idle: 'bg-ink-300',
  }[kind]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  )
}

export function Avatar({ name, size = 8 }: { name: string; size?: 8 | 9 | 10 }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('')
  const cls = size === 10 ? 'size-10 text-sm' : size === 9 ? 'size-9 text-sm' : 'size-8 text-xs'
  return (
    <span className={`inline-flex ${cls} shrink-0 items-center justify-center rounded-full
                      bg-ink-900/15 font-display font-semibold text-ink-950
                      dark:bg-ink-500/20 dark:text-cream-200`}>
      {initials}
    </span>
  )
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-ink-600 dark:text-ink-400">{children}</span>
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 px-6 py-10 text-center
                    text-sm text-ink-600 dark:border-ink-700">
      {text}
    </div>
  )
}
