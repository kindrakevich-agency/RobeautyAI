import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { api, hasAdminCreds, setAdminCreds } from '../api'
import { Badge, Button, Card, Disclaimer, LangSwitch, PageHead, Stat, Table } from '../ui'

/* ---------- вхід ---------- */

function Login({ onDone }: { onDone: () => void }) {
  const [u, setU] = useState('admin')
  const [p, setP] = useState('')
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-4">
      <form onSubmit={(e) => { e.preventDefault(); setAdminCreds(u, p); onDone() }}
            className="w-full max-w-sm space-y-3 rounded-2xl border border-sand-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-ink-900">RoBeauty AI Operations</h1>
        <input value={u} onChange={(e) => setU(e.target.value)} placeholder="admin"
               className="w-full rounded-xl border border-sand-200 px-3 py-2 text-sm outline-none focus:border-clay-400" />
        <input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="••••••"
               className="w-full rounded-xl border border-sand-200 px-3 py-2 text-sm outline-none focus:border-clay-400" />
        <Button type="submit" className="w-full">OK</Button>
      </form>
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
  const [d, setD] = useState<Dash | null>(null)
  useEffect(() => { void api.admin.get<Dash>('/api/admin/dashboard').then(setD) }, [])
  if (!d) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
  const totalConv = Object.values(d.conversations.by_channel).reduce((a, b) => a + b, 0)
  return (
    <>
      <PageHead title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('dashboard.autoConfirm')} value={`${d.orders.auto_pct}%`}
              hint={`${d.orders.total} ${t('common.total').toLowerCase()}`} />
        <Stat label={t('dashboard.atRisk')} value={`${d.uah_at_risk.toLocaleString('uk')} ₴`} />
        <Stat label={t('dashboard.dialogsToday')} value={totalConv}
              hint={`${d.conversations.escalated} ${t('dashboard.escalated')}`} />
        <Stat label={t('dashboard.identities')} value={d.identities_linked}
              hint={t('dashboard.identitiesHint')} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">
            {t('dashboard.plProgress')}
          </div>
          <div className="mt-2 text-2xl font-semibold text-ink-900">
            {d.localization.approved} / {d.localization.products}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-100">
            <div className="h-full bg-clay-500"
                 style={{ width: `${(d.localization.approved / Math.max(1, d.localization.products)) * 100}%` }} />
          </div>
        </Card>
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">
            {t('dashboard.evalTitle')}
          </div>
          {d.eval.p_at_5 == null ? (
            <p className="mt-2 text-sm text-ink-400">{t('dashboard.notMeasured')}</p>
          ) : (
            <div className="mt-2 flex gap-6">
              <div><div className="text-2xl font-semibold tabular-nums">{d.eval.p_at_5}</div>
                <div className="text-xs text-ink-400">P@5</div></div>
              <div><div className="text-2xl font-semibold tabular-nums">{d.eval.judge_pass_rate}</div>
                <div className="text-xs text-ink-400">{t('evalPage.judge')}</div></div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">
          {t('dashboard.costsTitle')}
        </div>
        <p className="mt-1 text-xs text-ink-400">{t('dashboard.costsHint')}</p>
        <div className="mt-3">
          <span className="text-3xl font-semibold tabular-nums text-ink-900">
            ${d.api_costs.total_usd.toFixed(3)}
          </span>
          <span className="ml-2 text-xs text-ink-400">
            {d.api_costs.calls} {t('dashboard.calls')} · {d.api_costs.tokens.toLocaleString('uk')} {t('dashboard.tokens')}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {d.api_costs.by_purpose.map((p) => (
            <Badge key={p.purpose}>{p.purpose}: ${p.cost.toFixed(4)}</Badge>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-sand-200 p-4">
            <div className="text-sm font-semibold text-ink-800">{t('dashboard.buyTitle')}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">{t('dashboard.buyItems')}</p>
          </div>
          <div className="rounded-xl border border-clay-400 bg-sand-50 p-4">
            <div className="text-sm font-semibold text-clay-700">{t('dashboard.buildTitle')}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">{t('dashboard.buildItems')}</p>
          </div>
        </div>
      </Card>
    </>
  )
}

/* ---------- каталог і картка товару ---------- */

function Products() {
  const { t } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [q, setQ] = useState('')
  const nav = useNavigate()
  useEffect(() => { void api.admin.get('/api/admin/products').then(setD) }, [])
  if (!d) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
  const items = d.items.filter((p: any) =>
    !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q))
  return (
    <>
      <PageHead title={t('products.title')} subtitle={t('products.subtitle')} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')}
             className="mb-4 w-full max-w-sm rounded-full border border-sand-200 px-4 py-2 text-sm outline-none focus:border-clay-400" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p: any) => (
          // Всередині адмінки посилання ведуть на картку товару в адмінці
          <button key={p.id} onClick={() => nav(`/admin/products/${p.id}`)}
                  className="min-w-0 rounded-2xl border border-sand-200 bg-white p-3 text-left transition-colors hover:border-clay-400">
            {p.image && (
              <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer"
                   className="mb-2 aspect-square w-full rounded-lg object-cover" />
            )}
            <div className="line-clamp-2 text-xs font-semibold leading-snug text-ink-800">{p.title}</div>
            <div className="mt-1 text-sm font-semibold text-clay-700">{Math.round(p.price)} ₴</div>
            {p.ingredients?.length ? (
              <div className="mt-1 line-clamp-1 text-[11px] text-ink-400">
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
  const [p, setP] = useState<any>(null)
  useEffect(() => { void api.admin.get(`/api/admin/products/${id}`).then(setP) }, [id])
  if (!p) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
  const d = p.details || {}
  const row = (label: string, value: any) => value && (
    Array.isArray(value) ? value.length > 0 : true) ? (
      <div className="border-t border-sand-100 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-ink-700">
          {Array.isArray(value) ? value.join(' · ') : value}
        </div>
      </div>
    ) : null

  return (
    <>
      <Link to="/admin/products" className="text-xs font-semibold text-clay-600 hover:underline">
        ← {t('common.back')}
      </Link>
      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <div className="min-w-0">
          {p.images?.[0] && (
            <img src={p.images[0]} alt="" referrerPolicy="no-referrer"
                 className="w-full rounded-2xl border border-sand-200 object-cover" />
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
               className="mt-3 block text-xs font-semibold text-clay-600 hover:underline">
              {t('common.openOnSite')} →
            </a>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900">
            {p.titles?.uk?.title ?? p.sku}
          </h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-semibold text-clay-700">{Math.round(p.price)} ₴</span>
            {p.old_price ? <span className="text-sm text-ink-400 line-through">
              {Math.round(p.old_price)} ₴</span> : null}
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
              <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">
                {t('products.descriptions')}
              </div>
              {Object.entries(p.titles).map(([lang, v]: any) => (
                <div key={lang} className="mt-3 border-t border-sand-100 pt-3 first:border-0">
                  <div className="flex items-center gap-2">
                    <Badge>{lang}</Badge>
                    <Badge tone={v.status === 'approved' ? 'good' : 'neutral'}>{v.status}</Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink-800">{v.title}</div>
                  <p className="mt-1 line-clamp-6 text-xs leading-relaxed text-ink-400">{v.description}</p>
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
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const load = () => api.admin.get('/api/admin/orders').then(setD)
  useEffect(() => { void load() }, [])
  if (!d) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
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
      <Table head={[t('orders.number'), t('common.customer'), t('common.total'),
                    t('orders.payment'), t('orders.decision'), t('common.reason')]}>
        {d.items.slice(0, 40).map((o: any) => (
          <tr key={o.id} className="border-b border-sand-100 align-top last:border-0">
            <td className="px-4 py-3 font-mono text-xs">{o.number}</td>
            <td className="px-4 py-3">
              <div className="text-sm text-ink-800">{o.customer}</div>
              <div className="text-[11px] text-ink-400">
                {o.city} · {t('orders.pickupRate')} {Math.round(o.pickup_rate * 100)}%
              </div>
            </td>
            <td className="px-4 py-3 tabular-nums">{Math.round(o.total)} ₴</td>
            <td className="px-4 py-3 text-xs">{o.payment === 'cod' ? t('orders.cod') : t('orders.card')}</td>
            <td className="px-4 py-3">
              {o.decision === 'auto' ? <Badge tone="good">{t('orders.auto')}</Badge>
                : o.decision === 'call' ? <Badge tone="warn">{t('orders.call')}</Badge> : '—'}
            </td>
            <td className="px-4 py-3 text-xs leading-relaxed text-ink-400">{o.reason}</td>
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
  const load = () => api.admin.get('/api/admin/shipments').then(setD)
  useEffect(() => { void load() }, [])
  if (!d) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
  return (
    <>
      <PageHead title={t('shipments.title')} subtitle={t('shipments.subtitle')}
                actions={<Button disabled={busy} onClick={async () => {
                  setBusy(true); await api.admin.post('/api/admin/shipments/run'); await load(); setBusy(false)
                }}>{busy ? t('common.running') : t('common.run')}</Button>} />
      <div className="mb-4"><Stat label={t('shipments.atRiskTitle')}
                                  value={`${d.uah_at_risk.toLocaleString('uk')} ₴`} /></div>
      <div className="space-y-3">
        {d.items.slice(0, 25).map((s: any) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-semibold text-ink-800">
                {s.customer} · {Math.round(s.total)} ₴
              </div>
              <Badge tone={s.days_waiting >= 4 ? 'bad' : s.days_waiting >= 2 ? 'warn' : 'neutral'}>
                {s.np_status} · {s.days_waiting} {t('shipments.daysWaiting').toLowerCase()}
              </Badge>
            </div>
            {s.reminders.length ? (
              <ul className="mt-3 space-y-2 border-l-2 border-sand-200 pl-3">
                {s.reminders.map((r: any, i: number) => (
                  <li key={i} className="text-xs leading-relaxed text-ink-600">
                    <span className="font-semibold text-clay-600">#{r.day}</span> {r.text}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-ink-400">{t('shipments.noReminders')}</p>}
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
  const { t } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [sel, setSel] = useState<any>(null)
  const [channel, setChannel] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')

  const load = () => api.admin.get(`/api/admin/conversations${channel ? `?channel=${channel}` : ''}`).then(setD)
  useEffect(() => { void load() }, [channel])
  const open = (id: number) => api.admin.get(`/api/admin/conversations/${id}`).then(setSel)

  if (!d) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
  return (
    <>
      <PageHead title={t('dialogs.title')} subtitle={t('dialogs.subtitle')}
                actions={<Button disabled={busy} onClick={async () => {
                  setBusy(true); await api.admin.post('/api/admin/dialogs/analyze'); await load(); setBusy(false)
                }}>{busy ? t('common.running') : t('dialogs.analyze')}</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setChannel('')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  !channel ? 'bg-ink-900 text-white' : 'border border-sand-200 text-ink-400'}`}>
          {t('dialogs.filterAll')}
        </button>
        {Object.entries(d.by_channel).map(([c, n]) => (
          <button key={c} onClick={() => setChannel(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    channel === c ? 'bg-ink-900 text-white' : 'border border-sand-200 text-ink-400'}`}>
            {CHANNEL_LABEL[c] ?? c} · {n as number}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {d.items.map((c: any) => (
            <button key={c.id} onClick={() => open(c.id)}
                    className="block w-full rounded-xl border border-sand-200 bg-white p-3 text-left transition-colors hover:border-clay-400">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{CHANNEL_LABEL[c.channel] ?? c.channel}</Badge>
                <span className="text-xs text-ink-400">{c.handle ?? '—'}</span>
                {c.escalated && <Badge tone="warn">esc</Badge>}
                {c.customer_id && <Badge tone="good">#{c.customer_id}</Badge>}
              </div>
              <div className="mt-1.5 text-sm text-ink-800">
                {c.analysis?.topic ?? <span className="text-ink-400">{t('dialogs.analysisPending')}</span>}
              </div>
              {c.analysis && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>{c.analysis.intent}</Badge>
                  <Badge tone={c.analysis.sentiment === 'negative' ? 'bad'
                    : c.analysis.sentiment === 'positive' ? 'good' : 'neutral'}>
                    {c.analysis.sentiment}
                  </Badge>
                  <Badge>{c.analysis.outcome}</Badge>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="min-w-0">
          {sel ? (
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge>{CHANNEL_LABEL[sel.channel] ?? sel.channel}</Badge>
                <span className="text-xs text-ink-400">{sel.handle ?? '—'}</span>
                <span className="text-xs text-ink-400">
                  {t('dialogs.linkedCustomer')}: {sel.customer_id ? `#${sel.customer_id}` : t('dialogs.notLinked')}
                </span>
              </div>
              {sel.analysis && (
                <div className="mb-3 rounded-xl bg-sand-50 p-3 text-xs leading-relaxed text-ink-600">
                  <b>{t('dialogs.summary')}:</b> {sel.analysis.summary}
                  {sel.analysis.satisfaction ? <> · {t('dialogs.satisfaction')}: {sel.analysis.satisfaction}/5</> : null}
                </div>
              )}
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {sel.messages.map((m: any, i: number) => (
                  <div key={i} className={`rounded-xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-sand-100 text-ink-800'
                      : m.role === 'human_agent' ? 'bg-emerald-50 text-emerald-900'
                      : 'border border-sand-200 text-ink-600'}`}>
                    {m.content}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value)}
                       placeholder={t('dialogs.replyPlaceholder')}
                       className="min-w-0 flex-1 rounded-full border border-sand-200 px-3 py-2 text-sm outline-none focus:border-clay-400" />
                <Button onClick={async () => {
                  if (!reply.trim()) return
                  await api.admin.post(`/api/admin/conversations/${sel.id}/reply`, { content: reply })
                  setReply(''); await open(sel.id)
                }}>{t('common.send')}</Button>
              </div>
            </Card>
          ) : <p className="text-sm text-ink-400">{t('common.empty')}</p>}
        </div>
      </div>
    </>
  )
}

/* ---------- звернення ---------- */

function Tickets() {
  const { t } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [digest, setDigest] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api.admin.get('/api/admin/tickets').then(setD)
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
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{digest}</div>
        </Card>
      )}
      {!d ? <p className="text-sm text-ink-400">{t('common.loading')}</p> : (
        <div className="space-y-3">
          {d.items.map((x: any) => (
            <Card key={x.id}>
              <div className="flex flex-wrap items-center gap-2">
                {x.category && <Badge>{x.category}</Badge>}
                {x.sentiment && <Badge tone={x.sentiment === 'negative' ? 'bad'
                  : x.sentiment === 'positive' ? 'good' : 'neutral'}>{x.sentiment}</Badge>}
                {x.priority && <Badge tone={x.priority === 'high' ? 'warn' : 'neutral'}>{x.priority}</Badge>}
                <Badge>{x.lang}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-800">{x.text}</p>
              {x.draft_reply && (
                <div className="mt-2 rounded-xl bg-sand-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                    {t('tickets.draft')}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{x.draft_reply}</p>
                </div>
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
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const load = () => api.admin.get('/api/admin/sync').then(setD)
  useEffect(() => { void load() }, [])
  return (
    <>
      <PageHead title={t('sync.title')} subtitle={t('sync.subtitle')}
                actions={<Button disabled={busy} onClick={async () => {
                  setBusy(true); await api.admin.post('/api/admin/sync/explain'); await load(); setBusy(false)
                }}>{busy ? t('common.running') : t('sync.explain')}</Button>} />
      {!d ? <p className="text-sm text-ink-400">{t('common.loading')}</p> : (
        <Table head={[t('sync.direction'), 'SKU', t('sync.action'), t('common.status'), t('sync.detail'), '']}>
          {d.items.map((r: any) => (
            <tr key={r.id} className="border-b border-sand-100 align-top last:border-0">
              <td className="px-4 py-3 text-xs">{r.direction === 'tilda_to_1c' ? '→ 1С' : '← 1С'}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
              <td className="px-4 py-3 text-xs">{r.action}</td>
              <td className="px-4 py-3">
                {r.status === 'conflict' ? <Badge tone="bad">{t('sync.conflict')}</Badge>
                  : <Badge tone="good">{t('sync.ok')}</Badge>}
              </td>
              <td className="px-4 py-3 text-xs leading-relaxed text-ink-600">{r.detail}</td>
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
  const load = () => api.admin.get('/api/admin/localization').then(setD)
  useEffect(() => { void load() }, [])
  if (!d) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
  return (
    <>
      <PageHead title={t('localization.title')} subtitle={t('localization.subtitle')} />
      <Card className="mb-4">
        <div className="text-sm text-ink-600">
          {t('localization.progress')}: <b>{d.approved}</b> / {d.total}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-100">
          <div className="h-full bg-clay-500" style={{ width: `${(d.approved / Math.max(1, d.total)) * 100}%` }} />
        </div>
      </Card>
      <div className="space-y-3">
        {d.items.slice(0, 30).map((x: any) => (
          <Card key={x.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-400">{x.sku}</span>
              <Badge tone={x.status === 'approved' ? 'good' : 'neutral'}>
                {x.status === 'approved' ? t('localization.statusApproved') : t('localization.statusDraft')}
              </Badge>
              {x.note && <Badge tone="warn">{t('localization.flagged')}: {x.note}</Badge>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  {t('localization.sourceUk')}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-800">{x.uk_title}</div>
                <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-ink-400">{x.uk_description}</p>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-clay-600">
                  {t('localization.targetPl')}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-800">{x.pl_title}</div>
                <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-ink-400">{x.pl_description}</p>
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
                 className="min-w-0 flex-1 rounded-full border border-sand-200 px-4 py-2 text-sm outline-none focus:border-clay-400" />
          <Button type="submit" disabled={busy}>{busy ? t('common.running') : t('analytics.ask')}</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => { const x = t(`analytics.presets.${p}`); setQ(x); void ask(x) }}
                    className="rounded-full border border-sand-200 px-3 py-1.5 text-xs text-ink-600 transition-colors hover:border-clay-400 hover:text-clay-700">
              {t(`analytics.presets.${p}`)}
            </button>
          ))}
        </div>
      </Card>

      {res && (
        <Card>
          {res.error ? <p className="text-sm text-rose-700">{res.error}</p> : (
            <>
              <p className="text-base leading-relaxed text-ink-800">{res.answer}</p>
              <button onClick={() => setShowSql((v) => !v)}
                      className="mt-3 text-xs font-semibold text-clay-600 hover:underline">
                {showSql ? '▾' : '▸'} {t('analytics.showSql')}
              </button>
              {showSql && (
                <pre className="mt-2 overflow-x-auto rounded-xl bg-ink-900 p-3 text-[11px] leading-relaxed text-sand-100">
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

function EvalPage() {
  const { t } = useTranslation()
  const [d, setD] = useState<any>(null)
  const [fixing, setFixing] = useState<number | null>(null)
  const [text, setText] = useState('')
  const load = () => api.admin.get('/api/admin/eval').then(setD)
  useEffect(() => { void load() }, [])
  if (!d) return <p className="text-sm text-ink-400">{t('common.loading')}</p>
  return (
    <>
      <PageHead title={t('evalPage.title')} subtitle={t('evalPage.subtitle')} />
      <Card className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">
          {t('evalPage.runs')}
        </div>
        {d.runs.length ? (
          <div className="mt-3">
            <Table head={[t('common.created'), t('evalPage.pAt5'), t('evalPage.mrr'), t('evalPage.judge')]}>
              {d.runs.map((r: any, i: number) => (
                <tr key={i} className="border-b border-sand-100 last:border-0">
                  <td className="px-4 py-2 text-xs">{r.at.slice(0, 16)}</td>
                  <td className="px-4 py-2 tabular-nums">{r.p_at_5}</td>
                  <td className="px-4 py-2 tabular-nums">{r.mrr}</td>
                  <td className="px-4 py-2 tabular-nums">{r.judge_pass_rate}</td>
                </tr>
              ))}
            </Table>
          </div>
        ) : <p className="mt-2 text-sm text-ink-400">{t('dashboard.notMeasured')}</p>}
      </Card>

      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">
          {t('evalPage.gaps')}
        </div>
        <p className="mt-1 text-xs text-ink-400">{t('evalPage.gapsHint')}</p>
        {d.gaps.length ? (
          <div className="mt-3 space-y-3">
            {d.gaps.map((g: any) => (
              <div key={g.id} className="rounded-xl border border-sand-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{g.lang}</Badge>
                  <span className="text-sm text-ink-800">{g.question}</span>
                </div>
                {fixing === g.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={text} onChange={(e) => setText(e.target.value)}
                           placeholder={t('evalPage.fixPlaceholder')}
                           className="min-w-0 flex-1 rounded-full border border-sand-200 px-3 py-2 text-sm outline-none focus:border-clay-400" />
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
        ) : <p className="mt-2 text-sm text-ink-400">{t('evalPage.noGaps')}</p>}
      </Card>
    </>
  )
}

/* ---------- оболонка ---------- */

const NAV = [
  ['', 'dashboard'], ['orders', 'orders'], ['shipments', 'shipments'],
  ['dialogs', 'dialogs'], ['tickets', 'tickets'], ['products', 'products'],
  ['sync', 'sync'], ['localization', 'localization'],
  ['analytics', 'analytics'], ['eval', 'eval'],
] as const

export default function Admin() {
  const { t } = useTranslation()
  const [authed, setAuthed] = useState(hasAdminCreds())
  if (!authed) return <Login onDone={() => setAuthed(true)} />
  return (
    <div className="min-h-screen bg-sand-50">
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-ink-900">RoBeauty AI Operations</span>
          <Badge>{t('demoBadge')}</Badge>
          <div className="ml-auto flex items-center gap-3">
            <LangSwitch />
            <Link to="/" className="text-xs font-semibold text-clay-600 hover:underline">
              {t('nav.backToChat')}
            </Link>
          </div>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map(([path, key]) => (
            <NavLink key={key} to={`/admin/${path}`} end={path === ''}
                     className={({ isActive }) =>
                       `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                         isActive ? 'bg-ink-900 text-white' : 'text-ink-400 hover:text-ink-800'}`}>
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
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
        </Routes>
      </main>
      <Disclaimer />
    </div>
  )
}
