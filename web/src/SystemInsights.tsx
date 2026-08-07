import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CalendarCheck, CornerDownLeft, Gauge, Languages, Sparkles, X } from 'lucide-react'
import { api } from './api'
import { Button } from './ui'

/**
 * AI-звіт по системі — рядок у шапці замість пошуку.
 *
 * Менеджер питає «що зараз важливо?» звичайною мовою й отримує брифінг.
 * Зріз показників збирається на сервері, тож клієнт не може підмінити цифри.
 */

const PRESETS = [
  { key: 'attention', icon: AlertTriangle },
  { key: 'today', icon: CalendarCheck },
  { key: 'localization', icon: Languages },
  { key: 'quality', icon: Gauge },
] as const

export default function SystemInsights() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 40)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = async (question: string) => {
    if (!question.trim()) return
    setLoading(true); setFailed(false); setReport('')
    try {
      const r = await api.admin.post<{ report: string }>(
        '/api/admin/insights', { question, lang: i18n.language })
      setReport(r.report)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" aria-label={t('insights.trigger')}
              onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 40) }}
              className="group flex min-w-0 shrink-0 items-center justify-center gap-2.5 rounded-full
                         border border-transparent bg-white/70 p-2 dark:bg-ink-800/70 text-left text-sm transition-colors
                         hover:border-ink-700/40 sm:w-full sm:max-w-md sm:shrink sm:justify-start
                         sm:py-2 sm:pr-3 sm:pl-3.5 dark:bg-ink-800/70">
        <Sparkles size={15} className="shrink-0 text-ink-900 dark:text-cream-200" />
        <span className="hidden min-w-0 flex-1 truncate text-ink-600 sm:block dark:text-ink-300">
          {t('insights.trigger')}
        </span>
        <kbd className="hidden shrink-0 rounded border border-ink-200 px-1.5 py-0.5 font-mono
                        text-[10px] text-ink-600 dark:text-ink-300 sm:block dark:border-ink-600">⌘K</kbd>
      </button>

      {/* Портал у body: шапка має backdrop-blur і перехопила б position:fixed */}
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[8vh]"
             role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-lg" onClick={() => setOpen(false)} />
          <div className="animate-rise relative w-full max-w-2xl rounded-[20px] bg-gradient-to-b
                          from-ink-500/40 via-ink-500/10 to-transparent p-px shadow-pop">
            <div className="flex max-h-[78vh] flex-col overflow-hidden rounded-[19px] bg-white dark:bg-ink-900">
              <form onSubmit={(e) => { e.preventDefault(); void run(q) }}
                    className="flex items-center gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
                <Sparkles size={18} className="shrink-0 text-ink-900 dark:text-cream-200" />
                <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder={t('insights.placeholder')}
                       className="flex-1 border-0 bg-transparent p-0 text-[15px] text-ink-900
                                  outline-none placeholder:text-ink-600 dark:text-cream-100" />
                <CornerDownLeft size={15} className="shrink-0 text-ink-300" />
                <button type="button" onClick={() => setOpen(false)} aria-label="close"
                        className="shrink-0 rounded-lg p-1 text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800">
                  <X size={16} />
                </button>
              </form>

              <div className="overflow-y-auto px-5 py-4">
                {!report && !loading && (
                  <>
                    <div className="mb-2.5 text-[11px] font-bold tracking-[0.07em] text-ink-700 dark:text-ink-300 uppercase">
                      {t('insights.quick')}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PRESETS.map((p) => (
                        <button key={p.key} type="button"
                                onClick={() => { const x = t(`insights.presets.${p.key}.q`); setQ(x); void run(x) }}
                                className="group flex items-center gap-3 rounded-xl border border-ink-200
                                           px-3.5 py-3 text-left transition-all hover:-translate-y-0.5
                                           hover:border-ink-700 hover:shadow-card dark:border-ink-700">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg
                                           bg-ink-900/10 text-ink-950 transition-colors
                                           group-hover:bg-ink-900 group-hover:text-white
                                           dark:bg-ink-500/15 dark:text-cream-200">
                            <p.icon size={15} />
                          </span>
                          <span className="flex-1 text-sm font-medium text-ink-700 dark:text-ink-200">
                            {t(`insights.presets.${p.key}.label`)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{t('insights.hint')}</p>
                  </>
                )}

                {loading && <div className="py-6 text-sm text-ink-600 dark:text-ink-300">{t('insights.thinking')}</div>}
                {failed && !loading && (
                  <p className="py-4 text-sm text-ink-950 dark:text-cream-200">{t('insights.failed')}</p>
                )}
                {report && !loading && (
                  <>
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.07em]
                                    text-ink-950 uppercase dark:text-cream-200">
                      <Sparkles size={12} /> {t('insights.briefing')}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800 dark:text-cream-100">
                      {report}
                    </div>
                    <Button variant="ghost" className="mt-4" onClick={() => { setReport(''); setQ('') }}>
                      {t('insights.again')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
