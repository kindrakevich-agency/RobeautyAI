import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { renderMarkdown } from '../markdown'
import { CATEGORY_LABEL, QUESTIONS, type QCategory, type Question } from '../questions'
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { AUTH_FAILED, api, clearAdminCreds, hasAdminCreds, setAdminCreds } from '../api'
import {
  Badge, Button, Card, Empty, Input, Mono, PageHead, SectionTitle, type SortState,
  Stat, Status, Table, Tr, applySort,
} from '../ui'
import Shell from '../Shell'

/* ---------- вхід ---------- */

function Login({ onDone }: { onDone: () => void }) {
  const [u, setU] = useState('admin')
  const [p, setP] = useState('')
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4 dark:bg-ink-950">
      <Card className="w-full max-w-sm animate-rise">
        <div className="font-display text-xl font-semibold tracking-[0.02em] text-ink-950 dark:text-cream-50">
          RoBeauty
        </div>
        <div className="mt-1 mb-5 text-[10px] font-bold tracking-[0.08em] text-ink-900 uppercase dark:text-cream-200">
          AI Operations
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setAdminCreds(u, p); onDone() }} className="space-y-3">
          <Input value={u} onChange={(e) => setU(e.target.value)} placeholder="admin" className="w-full" />
          <Input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="••••••" className="w-full" />
          <Button type="submit" className="w-full">OK</Button>
        </form>
      </Card>
    </div>
  )
}


/** Завантаження даних розділу з видимою помилкою замість вічного «Завантаження…». */
function useAdminData<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = async () => {
    setError(null)
    try {
      setData(await api.admin.get<T>(path))
    } catch (e) {
      setError(String((e as Error).message) === '401' ? '401' : 'error')
    }
  }
  useEffect(() => { void load() }, deps)
  return { data, error, reload: load }
}

function Loading({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useTranslation()
  if (!error) return <p className="text-sm text-ink-600 dark:text-ink-300">{t('common.loading')}</p>
  return (
    <div className="rounded-2xl border border-cream-200/50 bg-cream-200/60 p-4 dark:bg-ink-900 dark:border-ink-500/30 dark:bg-ink-700/10">
      <p className="text-sm text-ink-950 dark:text-cream-200">{t('common.loadError')}</p>
      <Button variant="ghost" className="mt-2" onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  )
}

/* ---------- дашборд ---------- */

type Dash = {
  orders: { total: number; auto_pct: number }
  uah_at_risk: number
  conversations: { by_channel: Record<string, number>; escalated: number }
  identities_linked: number
  localization: { products: number; translated: number; approved: number }
  eval: { p_at_5: number | null; judge_pass_rate: number | null }
  api_costs: { total_usd: number; tokens: number; calls: number; by_purpose: { purpose: string; cost: number }[] }
}

function Dashboard() {
  const { t } = useTranslation()
  const { data: d, error, reload } = useAdminData<Dash>('/api/admin/dashboard')
  if (!d) return <Loading error={error} onRetry={reload} />
  const totalConv = Object.values(d.conversations.by_channel).reduce((a, b) => a + b, 0)
  return (
    <>
      <PageHead title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('dashboard.autoConfirm')} value={`${d.orders.auto_pct}%`}
              hint={`${d.orders.total} ${t('common.total').toLowerCase()}`} />
        <Stat label={t('dashboard.atRisk')} value={`${d.uah_at_risk.toLocaleString('uk')} грн`} />
        <Stat label={t('dashboard.dialogsToday')} value={totalConv}
              hint={`${d.conversations.escalated} ${t('dashboard.escalated')}`} />
        <Stat label={t('dashboard.identities')} value={d.identities_linked}
              hint={t('dashboard.identitiesHint')} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-600 dark:text-ink-300">
            {t('dashboard.plProgress')}
          </div>
          <div className="mt-2 text-2xl font-semibold text-ink-900 dark:text-cream-50">
            {d.localization.approved} / {d.localization.products}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div className="h-full bg-ink-700"
                 style={{ width: `${(d.localization.approved / Math.max(1, d.localization.products)) * 100}%` }} />
          </div>
        </Card>
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-600 dark:text-ink-300">
            {t('dashboard.evalTitle')}
          </div>
          {d.eval.p_at_5 == null ? (
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{t('dashboard.notMeasured')}</p>
          ) : (
            /* Число без пояснення нічого не варте: замість «P@5 0.594» і
               «сліпий суддя 0.588» показуємо, що саме заміряно й у чому
               вимірюється, у відсотках і словами. */
            <div className="mt-3 space-y-3">
              {[
                ['search', d.eval.p_at_5],
                ['answers', d.eval.judge_pass_rate],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl font-bold tabular-nums
                                     text-ink-950 dark:text-cream-50">
                      {Math.round((v as number) * 100)}%
                    </span>
                    <span className="text-sm font-semibold text-ink-800 dark:text-cream-100">
                      {t(`quality.${k}.name`)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">
                    {t(`quality.${k}.what`)}
                  </p>
                </div>
              ))}
              <Link to="/admin/eval"
                    className="inline-block text-[11px] font-semibold text-brand-600
                               hover:underline dark:text-brand-400">
                {t('quality.details')} →
              </Link>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-600 dark:text-ink-300">
          {t('dashboard.costsTitle')}
        </div>
        <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{t('dashboard.costsHint')}</p>
        <div className="mt-3">
          <span className="text-3xl font-semibold tabular-nums text-ink-900 dark:text-cream-50">
            ${d.api_costs.total_usd.toFixed(3)}
          </span>
          <span className="ml-2 text-xs text-ink-600 dark:text-ink-300">
            {d.api_costs.calls} {t('dashboard.calls')} · {d.api_costs.tokens.toLocaleString('uk')} {t('dashboard.tokens')}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {d.api_costs.by_purpose.map((p) => (
            <Badge key={p.purpose}>{p.purpose}: ${p.cost.toFixed(4)}</Badge>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-200 p-4 dark:border-ink-700/60">
            <div className="text-sm font-semibold text-ink-800 dark:text-cream-100">{t('dashboard.buyTitle')}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{t('dashboard.buyItems')}</p>
          </div>
          <div className="rounded-xl border border-ink-700 bg-cream-100 p-4 dark:border-cream-200/40 dark:bg-ink-800">
            <div className="text-sm font-semibold text-ink-950 dark:text-cream-50">{t('dashboard.buildTitle')}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{t('dashboard.buildItems')}</p>
          </div>
        </div>
      </Card>
    </>
  )
}

/* ---------- каталог і картка товару ---------- */

function Products() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const { data: d, error, reload } = useAdminData<any>('/api/admin/products')
  if (!d) return <Loading error={error} onRetry={reload} />
  const items = d.items.filter((p: any) =>
    !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q))
  return (
    <>
      <PageHead title={t('products.title')} subtitle={t('products.subtitle')} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')}
             className="mb-4 w-full max-w-sm rounded-full border border-ink-200 bg-cream-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-ink-700 dark:bg-ink-800 dark:text-cream-100" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p: any) => (
          // Всередині адмінки посилання ведуть на картку товару в адмінці
          <button key={p.id} onClick={() => nav(`/admin/products/${p.id}`)}
                  className="min-w-0 rounded-2xl border border-ink-200 bg-cream-50 p-3 text-left shadow-card transition-colors hover:border-brand-500 dark:border-ink-700/60 dark:bg-ink-900">
            {p.image && (
              <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer"
                   className="mb-2 aspect-square w-full rounded-lg object-cover" />
            )}
            <div className="line-clamp-2 text-xs font-semibold leading-snug text-ink-800 dark:text-cream-100">{p.title}</div>
            <div className="mt-1 text-sm font-semibold text-ink-950 dark:text-cream-50">{Math.round(p.price)} грн</div>
            {p.ingredients?.length ? (
              <div className="mt-1 line-clamp-1 text-[11px] text-ink-600 dark:text-ink-300">
                {p.ingredients.join(' · ')}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </>
  )
}

function ProductDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { data: p, error, reload } = useAdminData<any>(`/api/admin/products/${id}`, [id])
  if (!p) return <Loading error={error} onRetry={reload} />
  const d = p.details || {}
  const row = (label: string, value: any) => value && (
    Array.isArray(value) ? value.length > 0 : true) ? (
      <div className="border-t border-ink-100 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.02em]r text-ink-600 dark:text-ink-300">{label}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-ink-700 dark:text-ink-300">
          {Array.isArray(value) ? value.join(' · ') : value}
        </div>
      </div>
    ) : null

  return (
    <>
      <Link to="/admin/products" className="text-xs font-semibold text-ink-900 dark:text-cream-50 hover:underline">
        ← {t('common.back')}
      </Link>
      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <div className="min-w-0">
          {p.images?.[0] && (
            <img src={p.images[0]} alt="" referrerPolicy="no-referrer"
                 className="w-full rounded-2xl border border-ink-200 object-cover" />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{p.sku}</Badge>
            {p.extraction_confidence && (
              <Badge tone={p.extraction_confidence === 'high' ? 'good' : 'warn'}>
                {t('products.confidence')}: {p.extraction_confidence}
              </Badge>
            )}
          </div>
          {/* Єдиний зовнішній лінк в адмінці — на оригінал сторінки бренду */}
          {p.landing_url && (
            <a href={p.landing_url} target="_blank" rel="noreferrer"
               className="mt-3 block text-xs font-semibold text-ink-900 dark:text-cream-50 hover:underline">
              {t('common.openOnSite')} →
            </a>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900 dark:text-cream-50">
            {p.titles?.uk?.title ?? p.sku}
          </h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-semibold text-ink-950 dark:text-cream-50">{Math.round(p.price)} грн</span>
            {p.old_price ? <span className="text-sm text-ink-600 dark:text-ink-300 line-through">
              {Math.round(p.old_price)} грн</span> : null}
            {p.volume && <Badge>{p.volume}</Badge>}
            {p.variant_label && <Badge>{p.variant_label}</Badge>}
          </div>

          <Card className="mt-4">
            {row(t('products.ingredients'), d.active_ingredients)}
            {row(t('products.skinType'), d.skin_type)}
            {row(t('products.concerns'), d.skin_concerns)}
            {row(t('products.howToUse'), d.how_to_use)}
            {row(t('products.combine'), d.combine_with)}
            {row(t('products.dontCombine'), d.do_not_combine_with)}
            {row(t('products.contra'), d.contraindications)}
          </Card>

          {p.titles && (
            <Card className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-600 dark:text-ink-300">
                {t('products.descriptions')}
              </div>
              {Object.entries(p.titles).map(([lang, v]: any) => (
                <div key={lang} className="mt-3 border-t border-ink-100 pt-3 first:border-0">
                  <div className="flex items-center gap-2">
                    <Badge>{lang}</Badge>
                    <Badge tone={v.status === 'approved' ? 'good' : 'neutral'}>{v.status}</Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink-800 dark:text-cream-100">{v.title}</div>
                  <p className="mt-1 line-clamp-6 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{v.description}</p>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

/* ---------- замовлення ---------- */

function Orders() {
  const { t } = useTranslation()
  const [sort, setSort] = useState<SortState>(null)
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = () => api.admin.get('/api/admin/orders').then(setD).catch((e) => setErr(String(e.message)))
  useEffect(() => { void load() }, [])
  if (!d) return <Loading error={err} onRetry={load} />
  return (
    <>
      <PageHead title={t('orders.title')} subtitle={t('orders.subtitle')}
                actions={<Button disabled={busy} onClick={async () => {
                  setBusy(true); await api.admin.post('/api/admin/orders/run'); await load(); setBusy(false)
                }}>{busy ? t('common.running') : t('common.run')}</Button>} />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stat label={t('orders.autoPct')} value={`${d.auto_pct}%`} />
        <Stat label={t('orders.callsSaved')} value={d.calls_saved_today} />
      </div>
      <Table sort={sort} onSort={setSort}
             head={[{ label: t('orders.number'), sortKey: 'number' },
                    { label: t('common.customer'), sortKey: 'customer' },
                    { label: t('common.total'), sortKey: 'total' },
                    t('orders.payment'),
                    { label: t('orders.decision'), sortKey: 'decision' },
                    t('common.reason')]}>
        {applySort<any>(d.items, sort, (r, k) => r[k]).slice(0, 40).map((o: any) => (
          <tr key={o.id} className="border-b border-ink-100 align-top last:border-0 dark:border-ink-800">
            <td className="px-4 py-3"><Mono>{o.number}</Mono></td>
            <td className="px-4 py-3">
              <div className="text-sm text-ink-800 dark:text-cream-100">{o.customer}</div>
              <div className="text-[11px] text-ink-600 dark:text-ink-300">
                {o.city} · {t('orders.pickupRate')} {Math.round(o.pickup_rate * 100)}%
              </div>
            </td>
            <td className="px-4 py-3 tabular-nums">{Math.round(o.total)} грн</td>
            <td className="px-4 py-3 text-xs">{o.payment === 'cod' ? t('orders.cod') : t('orders.card')}</td>
            <td className="px-4 py-3">
              {o.decision === 'auto' ? <Badge tone="good">{t('orders.auto')}</Badge>
                : o.decision === 'call' ? <Badge tone="warn">{t('orders.call')}</Badge> : '—'}
            </td>
            <td className="px-4 py-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{o.reason}</td>
          </tr>
        ))}
      </Table>
    </>
  )
}

/* ---------- невикупи ---------- */

function Shipments() {
  const { t } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = () => api.admin.get('/api/admin/shipments').then(setD).catch((e) => setErr(String(e.message)))
  useEffect(() => { void load() }, [])
  if (!d) return <Loading error={err} onRetry={load} />
  return (
    <>
      <PageHead title={t('shipments.title')} subtitle={t('shipments.subtitle')}
                actions={<Button disabled={busy} onClick={async () => {
                  setBusy(true); await api.admin.post('/api/admin/shipments/run'); await load(); setBusy(false)
                }}>{busy ? t('common.running') : t('common.run')}</Button>} />
      <div className="mb-4"><Stat label={t('shipments.atRiskTitle')}
                                  value={`${d.uah_at_risk.toLocaleString('uk')} грн`} /></div>
      <div className="space-y-3">
        {d.items.slice(0, 25).map((s: any) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-semibold text-ink-800 dark:text-cream-100">
                {s.customer} · {Math.round(s.total)} грн
              </div>
              <Badge tone={s.days_waiting >= 4 ? 'bad' : s.days_waiting >= 2 ? 'warn' : 'neutral'}>
                {t(`shipments.status.${s.np_status}`, { defaultValue: s.np_status })} · {s.days_waiting} {t('shipments.daysShort')}
              </Badge>
            </div>
            {s.reminders.length ? (
              <ul className="mt-3 space-y-2 border-l-2 border-ink-200 pl-3">
                {s.reminders.map((r: any, i: number) => (
                  <li key={i} className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                    <span className="font-semibold text-ink-900 dark:text-cream-50">#{r.day}</span>{' '}
                    <span className="rb-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.text) }} />
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">{t('shipments.noReminders')}</p>}
          </Card>
        ))}
      </div>
    </>
  )
}

/* ---------- діалоги всіх каналів ---------- */

const CHANNEL_LABEL: Record<string, string> = {
  web: 'Web', instagram: 'Instagram', telegram: 'Telegram', viber: 'Viber', whatsapp: 'WhatsApp',
}

function Dialogs() {
  const { t, i18n } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [sel, setSel] = useState<any>(null)
  const [channel, setChannel] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')

  const [err, setErr] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const PER = 25
  const load = () => api.admin
    .get(`/api/admin/conversations?offset=${page * PER}&limit=${PER}`
         + (channel ? `&channel=${channel}` : ''))
    .then(setD)
    .catch((e) => setErr(String(e.message)))
  useEffect(() => { void load() }, [channel, page])
  useEffect(() => { setPage(0) }, [channel])
  const open = (id: number) => api.admin.get(`/api/admin/conversations/${id}`).then(setSel)

  if (!d) return <Loading error={err} onRetry={load} />
  return (
    <>
      <PageHead title={t('dialogs.title')} subtitle={t('dialogs.subtitle')}
                actions={<Button disabled={busy} onClick={async () => {
                  setBusy(true); await api.admin.post('/api/admin/dialogs/analyze'); await load(); setBusy(false)
                }}>{busy ? t('common.running') : t('dialogs.analyze')}</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setChannel('')}
                className={`inline-flex min-h-[38px] items-center rounded px-3.5 text-xs font-semibold ${
                  !channel ? 'bg-ink-900 text-white' : 'border border-ink-200 text-ink-600 dark:text-ink-300'}`}>
          {t('dialogs.filterAll')}
        </button>
        {Object.entries(d.by_channel).map(([c, n]) => (
          <button key={c} onClick={() => setChannel(c)}
                  className={`inline-flex min-h-[38px] items-center rounded px-3.5 text-xs font-semibold ${
                    channel === c ? 'bg-ink-900 text-white' : 'border border-ink-200 text-ink-600 dark:text-ink-300'}`}>
            {CHANNEL_LABEL[c] ?? c} · {n as number}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {d.items.map((c: any) => (
            <button key={c.id} onClick={() => open(c.id)}
                    className={`block w-full rounded-xl border p-3 text-left shadow-card transition-colors
                                hover:border-brand-500 dark:bg-ink-900 ${
                      sel?.id === c.id ? 'border-brand-500 bg-cream-100 dark:border-brand-400'
                        : 'border-ink-200 bg-cream-50 dark:border-ink-700/60'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{CHANNEL_LABEL[c.channel] ?? c.channel}</Badge>
                <span className="text-xs text-ink-600 dark:text-ink-300">{c.handle ?? '—'}</span>
                {c.escalated && <Badge tone="warn">{t('dialogs.escalated')}</Badge>}
                {c.customer_id && <Badge tone="good">#{c.customer_id}</Badge>}
                <span className="ml-auto text-[11px] text-ink-500 dark:text-ink-400">
                  {c.started_at ? new Date(c.started_at).toLocaleString(
                    i18n.language === 'pl' ? 'pl-PL' : 'uk-UA',
                    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>

              {/* Головне в картці — з чим прийшов клієнт. Раніше тут стояв
                  лише статус аналізу, тож усі розмови виглядали однаково. */}
              <div className="mt-1.5 line-clamp-2 text-sm text-ink-900 dark:text-cream-100">
                {c.preview || <span className="text-ink-500 dark:text-ink-400">{t('dialogs.noPreview')}</span>}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1
                              text-[11px] text-ink-600 dark:text-ink-300">
                <span>{c.messages} {t('dialogs.msgs')}</span>
                {c.products > 0 && <span>{t('dialogs.shown')}: {c.products}</span>}
                <span className="uppercase">{c.lang}</span>
              </div>

              {c.analysis ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.analysis.intent && <Badge>{t(`analysis.intent.${c.analysis.intent}`, { defaultValue: c.analysis.intent })}</Badge>}
                  <Badge tone={c.analysis.sentiment === 'negative' ? 'bad'
                    : c.analysis.sentiment === 'positive' ? 'good' : 'neutral'}>
                    {t(`analysis.sentiment.${c.analysis.sentiment}`, { defaultValue: c.analysis.sentiment })}
                  </Badge>
                  {c.analysis.outcome && <Badge>{t(`analysis.outcome.${c.analysis.outcome}`, { defaultValue: c.analysis.outcome })}</Badge>}
                  {c.analysis.satisfaction
                    ? <Badge tone={c.analysis.satisfaction >= 4 ? 'good'
                        : c.analysis.satisfaction <= 2 ? 'bad' : 'warn'}>
                        {c.analysis.satisfaction}/5
                      </Badge>
                    : null}
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-ink-500 dark:text-ink-400">
                  {t('dialogs.analysisPending')}
                </div>
              )}
            </button>
          ))}

          {/* Розмов накопичуються сотні — без сторінок список неможливо гортати. */}
          {d.total > PER && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}>←</Button>
              <span className="text-[11px] text-ink-600 dark:text-ink-300">
                {page * PER + 1}–{Math.min((page + 1) * PER, d.total)} / {d.total}
              </span>
              <Button variant="ghost" disabled={(page + 1) * PER >= d.total}
                      onClick={() => setPage((p) => p + 1)}>→</Button>
            </div>
          )}
        </div>

        <div className="min-w-0">
          {sel ? (
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge>{CHANNEL_LABEL[sel.channel] ?? sel.channel}</Badge>
                <span className="text-xs text-ink-600 dark:text-ink-300">{sel.handle ?? '—'}</span>
                <span className="text-xs text-ink-600 dark:text-ink-300">
                  {t('dialogs.linkedCustomer')}: {sel.customer_id ? `#${sel.customer_id}` : t('dialogs.notLinked')}
                </span>
              </div>
              {sel.analysis && (
                <div className="mb-3 rounded-xl bg-cream-100 p-3 text-xs dark:bg-ink-800/60 leading-relaxed text-ink-600 dark:text-ink-300">
                  <b>{t('dialogs.summary')}:</b>{' '}
                  <span className="rb-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(sel.analysis.summary) }} />
                  {sel.analysis.satisfaction ? <> · {t('dialogs.satisfaction')}: {sel.analysis.satisfaction}/5</> : null}
                </div>
              )}
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {sel.messages.map((m: any, i: number) => (
                  <div key={i} className={`rounded-xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-cream-100'
                      : m.role === 'human_agent' ? 'bg-good-500/10 text-good-500 dark:bg-good-300/10 dark:text-good-300'
                      : 'border border-ink-200 text-ink-700 dark:border-ink-700/60 dark:text-ink-300'}`}>
                    {m.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : (
                      /* Відповідь асистента приходить із розміткою — у стенограмі
                         вона малювалася сирою, зірочками й дефісами. */
                      <div className="rb-md" dangerouslySetInnerHTML={{
                        __html: renderMarkdown(m.content) }} />
                    )}
                    {m.products?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.products.map((p: any, k: number) => (
                          <a key={k} href={p.url ?? undefined} target="_blank" rel="noreferrer"
                             className="inline-flex max-w-64 items-center gap-1.5 rounded border
                                        border-ink-200 bg-cream-50 px-2 py-1 text-[11px] text-ink-700
                                        hover:border-brand-500 dark:border-ink-700 dark:bg-ink-800
                                        dark:text-ink-300">
                            {p.image ? <img src={p.image} alt="" className="size-5 rounded object-cover" /> : null}
                            <span className="truncate">{p.title}</span>
                            {p.price ? <b className="shrink-0">{Math.round(p.price)} {t('common.uah')}</b> : null}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {m.sources?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.sources.map((sc: any, k: number) => (
                          <a key={k} href={sc.url ?? undefined} target="_blank" rel="noreferrer"
                             className="max-w-56 truncate rounded-full bg-ink-100 px-2 py-0.5
                                        text-[10px] text-ink-600 hover:text-ink-950
                                        dark:bg-ink-800 dark:text-ink-300">
                            {sc.title}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {/* Дописати в розмову можна лише там, де в клієнта лишається
                  адреса: месенджери. Веб-чат анонімний і вже закритий — там
                  поле «надіслати» вело б у нікуди, тому його немає. */}
              {sel.channel === 'web' ? (
                <p className="mt-3 rounded border border-ink-200 bg-cream-100 px-3 py-2 text-xs
                              leading-relaxed text-ink-600 dark:border-ink-700 dark:bg-ink-800
                              dark:text-ink-300">
                  {t('dialogs.webNoReply')}
                </p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input value={reply} onChange={(e) => setReply(e.target.value)}
                         placeholder={t('dialogs.replyPlaceholder')}
                         className="min-w-0 flex-1 rounded-full border border-ink-200 bg-cream-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-ink-700 dark:bg-ink-800 dark:text-cream-100" />
                  <Button onClick={async () => {
                    if (!reply.trim()) return
                    await api.admin.post(`/api/admin/conversations/${sel.id}/reply`, { content: reply })
                    setReply(''); await open(sel.id)
                  }}>{t('common.send')}</Button>
                </div>
              )}
            </Card>
          ) : <Empty text={t('common.empty')} />}
        </div>
      </div>
    </>
  )
}

/* ---------- звернення ---------- */

function Tickets() {
  const { t, i18n } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [digest, setDigest] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = () => api.admin.get('/api/admin/tickets').then(setD).catch((e) => setErr(String(e.message)))
  useEffect(() => { void load() }, [])
  return (
    <>
      <PageHead title={t('tickets.title')} subtitle={t('tickets.subtitle')} actions={<>
        <Button variant="ghost" disabled={busy} onClick={async () => {
          setBusy(true); await api.admin.post('/api/admin/tickets/generate'); await load(); setBusy(false)
        }}>{t('tickets.generate')}</Button>
        <Button disabled={busy} onClick={async () => {
          setBusy(true); await api.admin.post('/api/admin/tickets/run'); await load(); setBusy(false)
        }}>{busy ? t('common.running') : t('common.run')}</Button>
        <Button variant="ghost" onClick={async () => {
          const r = await api.admin.get<{ digest: string }>('/api/admin/tickets/digest')
          setDigest(r.digest)
        }}>{t('tickets.digest')}</Button>
      </>} />
      {digest && (
        <Card className="mb-4">
          <div className="rb-md text-sm leading-relaxed text-ink-700 dark:text-ink-300"
               dangerouslySetInnerHTML={{ __html: renderMarkdown(digest) }} />
        </Card>
      )}
      {!d ? <Loading error={err} onRetry={load} /> : (
        <div className="space-y-3">
          {d.items.map((x: any) => (
            <Card key={x.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={x.category === 'medical' ? 'bad'
                  : x.category === 'handoff' ? 'warn' : 'neutral'}>
                  {t(`tickets.category.${x.category}`, { defaultValue: x.category })}
                </Badge>
                {x.sentiment && <Badge tone={x.sentiment === 'negative' ? 'bad'
                  : x.sentiment === 'positive' ? 'good' : 'neutral'}>
                  {t(`analysis.sentiment.${x.sentiment}`, { defaultValue: x.sentiment })}
                </Badge>}
                {x.priority && <Badge tone={x.priority === 'high' ? 'warn' : 'neutral'}>
                  {t(`tickets.priority.${x.priority}`, { defaultValue: x.priority })}
                </Badge>}
                <Badge>{x.lang}</Badge>
                <span className="ml-auto text-[11px] text-ink-500 dark:text-ink-400">
                  {x.created_at ? new Date(x.created_at).toLocaleString(
                    i18n.language === 'pl' ? 'pl-PL' : 'uk-UA',
                    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>

              {/* Головне в картці — з чим прийшов клієнт. Для звернень від
                  кнопки «покликати людину» текст дістається з розмови:
                  раніше картка показувала лише слово «handoff». */}
              <div className="rb-md mt-2 text-sm text-ink-900 dark:text-cream-100"
                 dangerouslySetInnerHTML={{ __html: renderMarkdown(x.text) }} />

              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                {x.conversation_id && (
                  <Link to={`/admin/dialogs?conv=${x.conversation_id}`}
                        className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                    {t('tickets.openDialog')} →
                  </Link>
                )}
                {x.phone && <span className="text-ink-600 dark:text-ink-300">{x.phone}</span>}
                <span className="text-ink-500 dark:text-ink-400">
                  {t('tickets.source')}: {t(`tickets.sources.${x.source}`, { defaultValue: x.source })}
                </span>
              </div>

              {x.draft_reply ? (
                <div className="mt-3 rounded-xl bg-cream-100 p-3 dark:bg-ink-800/60">
                  <div className="text-[11px] font-bold tracking-display text-brand-600
                                  uppercase dark:text-brand-400">
                    {t('tickets.draft')}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-700 dark:text-ink-300">
                    {x.draft_reply}
                  </p>
                  <button onClick={() => { void navigator.clipboard?.writeText(x.draft_reply) }}
                          className="mt-2 text-[11px] font-semibold text-ink-600 hover:text-ink-950
                                     dark:text-ink-300 dark:hover:text-cream-50">
                    {t('tickets.copyDraft')}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-ink-500 dark:text-ink-400">
                  {t('tickets.noDraft')}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- 1С ---------- */

function Sync() {
  const { t } = useTranslation()
  const [syncSort, setSyncSort] = useState<SortState>(null)
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = () => api.admin.get('/api/admin/sync').then(setD).catch((e) => setErr(String(e.message)))
  useEffect(() => { void load() }, [])
  return (
    <>
      <PageHead title={t('sync.title')} subtitle={t('sync.subtitle')}
                actions={<Button disabled={busy} onClick={async () => {
                  setBusy(true); await api.admin.post('/api/admin/sync/explain'); await load(); setBusy(false)
                }}>{busy ? t('common.running') : t('sync.explain')}</Button>} />
      {!d ? <Loading error={err} onRetry={load} /> : (
        <Table sort={syncSort} onSort={setSyncSort}
               head={[{ label: t('sync.direction'), sortKey: 'direction' },
                      { label: 'SKU', sortKey: 'sku' },
                      t('sync.action'),
                      { label: t('common.status'), sortKey: 'status' },
                      t('sync.detail'), '']}>
          {applySort<any>(d.items, syncSort, (x, k) => x[k]).map((r: any) => (
            <tr key={r.id} className="border-b border-ink-100 align-top last:border-0 dark:border-ink-800">
              <td className="px-4 py-3 text-xs">{r.direction === 'tilda_to_1c' ? '→ 1С' : '← 1С'}</td>
              <td className="px-4 py-3"><Mono>{r.sku}</Mono></td>
              <td className="px-4 py-3 text-xs">{r.action}</td>
              <td className="px-4 py-3">
                {r.status === 'conflict' ? <Badge tone="bad">{t('sync.conflict')}</Badge>
                  : <Badge tone="good">{t('sync.ok')}</Badge>}
              </td>
              <td className="px-4 py-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{r.detail}</td>
              <td className="px-4 py-3">
                {r.status === 'conflict' && (
                  <div className="flex gap-1.5">
                    <Button variant="ghost" onClick={async () => {
                      await api.admin.post(`/api/admin/sync/${r.id}/resolve`, { action: 'create' }); await load()
                    }}>{t('sync.create')}</Button>
                    <Button variant="ghost" onClick={async () => {
                      await api.admin.post(`/api/admin/sync/${r.id}/resolve`, { action: 'ignore' }); await load()
                    }}>{t('sync.ignore')}</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

/* ---------- локалізація ---------- */

function Localization() {
  const { t } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => api.admin.get('/api/admin/localization').then(setD).catch((e) => setErr(String(e.message)))
  useEffect(() => { void load() }, [])
  if (!d) return <Loading error={err} onRetry={load} />
  return (
    <>
      <PageHead title={t('localization.title')} subtitle={t('localization.subtitle')} />
      <Card className="mb-4">
        <div className="text-sm text-ink-600 dark:text-ink-300">
          {t('localization.progress')}: <b>{d.approved}</b> / {d.total}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
          <div className="h-full bg-ink-700" style={{ width: `${(d.approved / Math.max(1, d.total)) * 100}%` }} />
        </div>
      </Card>
      <div className="space-y-3">
        {d.items.slice(0, 30).map((x: any) => (
          <Card key={x.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-600 dark:text-ink-300">{x.sku}</span>
              <Badge tone={x.status === 'approved' ? 'good' : 'neutral'}>
                {x.status === 'approved' ? t('localization.statusApproved') : t('localization.statusDraft')}
              </Badge>
              {x.note && <Badge tone="warn">{t('localization.flagged')}: {x.note}</Badge>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.02em]r text-ink-600 dark:text-ink-300">
                  {t('localization.sourceUk')}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-800 dark:text-cream-100">{x.uk_title}</div>
                <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{x.uk_description}</p>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.02em]r text-ink-900 dark:text-cream-200">
                  {t('localization.targetPl')}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-800 dark:text-cream-100">{x.pl_title}</div>
                <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{x.pl_description}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={async () => {
                await api.admin.post(`/api/admin/localization/${x.id}`, { action: 'approve' }); await load()
              }}>{t('common.approve')}</Button>
              <Button variant="ghost" onClick={async () => {
                await api.admin.post(`/api/admin/localization/${x.id}`, { action: 'reject' }); await load()
              }}>{t('common.reject')}</Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

/* ---------- аналітика ---------- */

function Analytics() {
  const { t, i18n } = useTranslation()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [showSql, setShowSql] = useState(false)

  const ask = async (question: string) => {
    setBusy(true); setRes(null)
    try {
      setRes(await api.admin.post('/api/admin/analytics/ask', { question, lang: i18n.language }))
    } finally { setBusy(false) }
  }
  const presets = ['atRisk', 'autoPct', 'topProducts', 'channels', 'escalations', 'ltv'] as const

  return (
    <>
      <PageHead title={t('analytics.title')} subtitle={t('analytics.subtitle')} />
      <Card className="mb-4">
        <form onSubmit={(e) => { e.preventDefault(); void ask(q) }} className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('analytics.placeholder')}
                 className="min-w-0 flex-1 rounded-full border border-ink-200 bg-cream-50 px-4 py-2 text-sm outline-none focus:border-brand-500 dark:border-ink-700 dark:bg-ink-800 dark:text-cream-100" />
          <Button type="submit" disabled={busy}>{busy ? t('common.running') : t('analytics.ask')}</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => { const x = t(`analytics.presets.${p}`); setQ(x); void ask(x) }}
                    className="inline-flex min-h-[38px] items-center rounded border border-ink-200 px-3.5 text-left text-xs text-ink-600 transition-colors hover:border-brand-500 dark:border-ink-700/60 dark:text-ink-300 hover:text-ink-950 dark:text-cream-50">
              {t(`analytics.presets.${p}`)}
            </button>
          ))}
        </div>
      </Card>

      {res && (
        <Card>
          {res.error ? <p className="text-sm text-ink-950 dark:text-cream-200">{res.error}</p> : (
            <>
              <div className="rb-md text-base leading-relaxed text-ink-800 dark:text-cream-100"
                 dangerouslySetInnerHTML={{ __html: renderMarkdown(res.answer) }} />
              <button onClick={() => setShowSql((v) => !v)}
                      className="mt-3 text-xs font-semibold text-ink-900 dark:text-cream-50 hover:underline">
                {showSql ? '▾' : '▸'} {t('analytics.showSql')}
              </button>
              {showSql && (
                <pre className="mt-2 overflow-x-auto rounded-xl bg-ink-900 p-3 text-[11px] leading-relaxed text-ink-100">
                  {res.sql}
                </pre>
              )}
            </>
          )}
        </Card>
      )}
    </>
  )
}

/* ---------- eval і прогалини ---------- */


/* ---------- набір перевірочних питань ---------- */

/**
 * Той самий список, що показує головна. Тут його видно повністю й можна
 * поставити будь-яке питання боту, не виходячи з адмінки: менеджер бачить
 * рівно те, що побачить клієнт.
 */
function QuestionsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'pl' ? 'pl' : 'uk'

  const byCat = QUESTIONS.reduce<Record<string, Question[]>>((acc, q) => {
    (acc[q.cat] ||= []).push(q); return acc
  }, {})

  return (
    <>
      <PageHead title={t('questions.title')} subtitle={t('questions.subtitle')} />
      <div className="space-y-5">
        {Object.entries(byCat).map(([cat, items]) => (
          <Card key={cat}>
            <div className="mb-3 text-[11px] font-bold tracking-display text-brand-600 uppercase dark:text-brand-400">
              {CATEGORY_LABEL[cat as QCategory][lang]}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((q) => {
                const text = lang === 'pl' ? q.pl : q.uk
                return (
                  <button key={q.id}
                          onClick={() => window.dispatchEvent(
                            new CustomEvent('rb-open-widget', { detail: text }))}
                          className="group flex items-start gap-2 rounded border border-ink-200
                                     px-3.5 py-3 text-left transition-colors
                                     hover:border-brand-500 dark:border-ink-800
                                     dark:hover:border-brand-400">
                    <span className="min-w-0 flex-1 text-sm text-ink-800 dark:text-cream-100">
                      {text}
                    </span>
                    <span aria-hidden className="mt-0.5 shrink-0 text-ink-400 transition-colors
                                                 group-hover:text-brand-600 dark:group-hover:text-brand-400">→</span>
                  </button>
                )
              })}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

function EvalPage() {
  const { t } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [fixing, setFixing] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const load = () => api.admin.get('/api/admin/eval').then(setD).catch((e) => setErr(String(e.message)))
  useEffect(() => { void load() }, [])
  if (!d) return <Loading error={err} onRetry={load} />
  return (
    <>
      <PageHead title={t('evalPage.title')} subtitle={t('evalPage.subtitle')} />
      <Card className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-600 dark:text-ink-300">
          {t('evalPage.runs')}
        </div>
        {d.runs.length ? (
          <div className="mt-3">
            <Table head={[t('common.created'), t('evalPage.pAt5'), t('evalPage.mrr'), t('evalPage.judge')]}>
              {d.runs.map((r: any, i: number) => (
                <tr key={i} className="border-b border-ink-100 last:border-0 dark:border-ink-800">
                  <td className="px-4 py-2 text-xs">{r.at.slice(0, 16)}</td>
                  <td className="px-4 py-2 tabular-nums">{r.p_at_5}</td>
                  <td className="px-4 py-2 tabular-nums">{r.mrr}</td>
                  <td className="px-4 py-2 tabular-nums">{r.judge_pass_rate}</td>
                </tr>
              ))}
            </Table>
          </div>
        ) : <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{t('dashboard.notMeasured')}</p>}
      </Card>

      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-600 dark:text-ink-300">
          {t('evalPage.gaps')}
        </div>
        <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{t('evalPage.gapsHint')}</p>
        {d.gaps.length ? (
          <div className="mt-3 space-y-3">
            {d.gaps.map((g: any) => (
              <div key={g.id} className="rounded-xl border border-ink-200 p-3 dark:border-ink-700/60">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{g.lang}</Badge>
                  <span className="text-sm text-ink-800 dark:text-cream-100">{g.question}</span>
                </div>
                {fixing === g.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={text} onChange={(e) => setText(e.target.value)}
                           placeholder={t('evalPage.fixPlaceholder')}
                           className="min-w-0 flex-1 rounded-full border border-ink-200 bg-cream-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-ink-700 dark:bg-ink-800 dark:text-cream-100" />
                    <Button onClick={async () => {
                      await api.admin.post(`/api/admin/eval/gaps/${g.id}/fix`, { answer_text: text })
                      setFixing(null); setText(''); await load()
                    }}>{t('common.send')}</Button>
                  </div>
                ) : (
                  <Button variant="ghost" className="mt-2" onClick={() => setFixing(g.id)}>
                    {t('evalPage.fixGap')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : <Empty text={t('evalPage.noGaps')} />}
      </Card>
    </>
  )
}

/* ---------- оболонка ---------- */

export default function Admin() {
  // Екран входу показуємо ЛИШЕ якщо сервер справді вимагає пароль.
  // Раніше він з'являвся до першого запиту — і адмінка просила вхід навіть
  // коли автентифікація вимкнена (ENABLE_PASS=off).
  const [authed, setAuthed] = useState(true)
  useEffect(() => {
    if (hasAdminCreds()) return
    api.admin.get('/api/admin/dashboard')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
  }, [])

  // Будь-який 401 повертає екран входу, а не лишає мовчазне «Завантаження…»
  useEffect(() => {
    const onFail = () => setAuthed(false)
    window.addEventListener(AUTH_FAILED, onFail)
    return () => window.removeEventListener(AUTH_FAILED, onFail)
  }, [])

  if (!authed) return <Login onDone={() => setAuthed(true)} />

  return (
    <Routes>
      <Route element={<Shell onLogout={() => { clearAdminCreds(); setAuthed(false) }} />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="shipments" element={<Shipments />} />
        <Route path="dialogs" element={<Dialogs />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="sync" element={<Sync />} />
        <Route path="localization" element={<Localization />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="eval" element={<EvalPage />} />
        <Route path="questions" element={<QuestionsPage />} />
      </Route>
    </Routes>
  )
}
