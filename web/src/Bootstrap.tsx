import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Input } from './ui'

/**
 * Онбординг першого запуску.
 *
 * Після `git clone` даних немає — каталог замовника свідомо не зберігається
 * в репозиторії. Цей екран пояснює, що саме зараз відбувається: які сторінки
 * парсяться, що лягає в базу, навіщо потрібні ембедінги. Людина не має
 * дивитися в порожній екран і гадати, чи воно взагалі працює.
 */

type Step = { key: string; status: 'pending' | 'running' | 'done' | 'failed'; detail: string; count: number | null }
type State = {
  running: boolean
  finished: boolean
  error: string | null
  steps: Step[]
  db: { products: number; chunks: number; pl_translations: number }
  ready: boolean
  has_llm_key: boolean
}

const ICON: Record<Step['status'], string> = {
  pending: '○', running: '◐', done: '●', failed: '✕',
}

export default function Bootstrap({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation()
  const [s, setS] = useState<State | null>(null)
  const [key, setKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    let stop = false
    const poll = async () => {
      try {
        const r = await fetch('/api/bootstrap').then((x) => x.json() as Promise<State>)
        if (stop) return
        setS(r)
        if (r.ready && !r.running) { onReady(); return }
      } catch { /* API ще піднімається */ }
      if (!stop) setTimeout(poll, 1200)
    }
    void poll()
    return () => { stop = true }
  }, [onReady])

  const saveKey = async () => {
    await fetch('/api/bootstrap/key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key }),
    })
    setKeySaved(true)
  }

  const start = () => fetch('/api/bootstrap/start', { method: 'POST' })

  const needKey = s && !s.has_llm_key && !keySaved

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4 py-10 dark:bg-ink-950">
      <Card className="w-full max-w-xl animate-rise">
        <div className="mb-4 flex items-center gap-2">
          <div className="font-display text-xl font-semibold tracking-wide text-ink-950 dark:text-cream-50">
            RoBeauty
          </div>
          <Badge tone="brand">{t('demoBadge')}</Badge>
        </div>
        <h1 className="font-display text-lg font-semibold text-ink-950 dark:text-cream-50">{t('boot.title')}</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{t('boot.intro')}</p>

        {needKey ? (
          <div className="mt-5 rounded-xl border border-ink-200/60 bg-cream-100 p-4 dark:border-ink-700/60 dark:bg-ink-800/50">
            <div className="text-sm font-semibold text-ink-800 dark:text-cream-100">{t('boot.keyTitle')}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{t('boot.keyHint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input value={key} onChange={(e) => setKey(e.target.value)} type="password"
                     placeholder="sk-…" className="flex-1" />
              <Button onClick={saveKey} disabled={key.trim().length < 20}>{t('boot.keySave')}</Button>
            </div>
          </div>
        ) : null}

        <ol className="mt-5 space-y-3">
          {(s?.steps ?? []).map((st) => (
            <li key={st.key} className="flex gap-3">
              <span className={`mt-0.5 text-sm ${
                st.status === 'done' ? 'text-mint-600'
                  : st.status === 'running' ? 'animate-pulse text-rose-600'
                  : st.status === 'failed' ? 'text-rose-600' : 'text-ink-400'}`}>
                {ICON[st.status]}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-800 dark:text-cream-100">
                  {t(`boot.steps.${st.key}.title`)}
                  {st.count != null && <span className="ml-2 tabular-nums text-rose-700 dark:text-rose-300">{st.count}</span>}
                </div>
                <div className="text-xs leading-relaxed text-ink-400">
                  {st.detail || t(`boot.steps.${st.key}.hint`)}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {s && (
          <div className="mt-5 flex flex-wrap gap-4 border-t border-ink-100 pt-4 dark:border-ink-800 text-xs text-ink-400">
            <span>{t('boot.db.products')}: <b className="tabular-nums text-ink-800 dark:text-cream-100">{s.db.products}</b></span>
            <span>{t('boot.db.chunks')}: <b className="tabular-nums text-ink-800 dark:text-cream-100">{s.db.chunks}</b></span>
            <span>{t('boot.db.pl')}: <b className="tabular-nums text-ink-800 dark:text-cream-100">{s.db.pl_translations}</b></span>
          </div>
        )}

        {s?.error && (
          <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{s.error}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!s?.running && !s?.ready && (
            <Button onClick={start} disabled={Boolean(needKey)}>{t('boot.start')}</Button>
          )}
          {s?.running && <span className="text-sm text-ink-400">{t('boot.running')}</span>}
          {s?.ready && <Button onClick={onReady}>{t('boot.openDemo')}</Button>}
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-ink-400">{t('boot.note')}</p>
      </Card>
    </div>
  )
}
