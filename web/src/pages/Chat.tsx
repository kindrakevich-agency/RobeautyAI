import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api, type ChatResponse, type ProductCard, type Source } from '../api'
import { Badge, Button, Disclaimer, LangSwitch } from '../ui'

type Msg = {
  role: 'user' | 'assistant'
  text: string
  sources?: Source[]
  products?: ProductCard[]
  offerHuman?: boolean
}

/**
 * Скролер карток товару. Горизонтальний, бо в чаті висота дорожча за ширину:
 * три картки в ряд на мобільному не читаються, а вертикальний список
 * відсуває саму відповідь за екран.
 * Зображення — прямі лінки на CDN бренду, нічого не копіюємо до себе.
 * Посилання ведуть на оригінальний сайт: у чаті клієнт має купувати там.
 */
function ProductScroller({ items }: { items: ProductCard[] }) {
  const { t } = useTranslation()
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const railRef = useRef<HTMLDivElement>(null)
  if (!items.length) return null

  const scrollBy = (dir: 1 | -1) => {
    railRef.current?.scrollBy({ left: dir * 260, behavior: 'smooth' })
  }

  return (
    <div className="relative mt-3">
      <div ref={railRef}
           className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1">
        {items.map((p) => (
          <div key={p.sku}
               className="flex w-[220px] shrink-0 snap-start flex-col rounded-xl border border-sand-200 bg-white p-2.5">
            {p.image && !broken[p.sku] && (
              <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer"
                   onError={() => setBroken((b) => ({ ...b, [p.sku]: true }))}
                   className="mb-2 aspect-square w-full rounded-lg object-cover" />
            )}
            <div className="line-clamp-2 min-h-[2.5rem] text-xs font-semibold leading-snug text-ink-800">
              {p.title}
            </div>

            <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
              <span className="text-sm font-semibold text-clay-700">{Math.round(p.price)} ₴</span>
              {p.old_price ? (
                <span className="text-[11px] text-ink-400 line-through">
                  {Math.round(p.old_price)} ₴
                </span>
              ) : null}
              {p.volume && <span className="text-[11px] text-ink-400">{p.volume}</span>}
            </div>

            {p.ingredients?.length ? (
              <div className="mt-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                  {t('chat.ingredients')}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-600">
                  {p.ingredients.join(' · ')}
                </div>
              </div>
            ) : null}

            <a href={p.url ?? '#'} target="_blank" rel="noreferrer"
               className="mt-auto pt-2.5 text-[11px] font-semibold text-clay-600 hover:underline">
              {t('chat.more')} →
            </a>
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button onClick={() => scrollBy(-1)} aria-label="←"
                  className="rounded-full border border-sand-200 px-2.5 py-1 text-xs text-ink-400 hover:border-clay-400 hover:text-clay-700">
            ←
          </button>
          <button onClick={() => scrollBy(1)} aria-label="→"
                  className="rounded-full border border-sand-200 px-2.5 py-1 text-xs text-ink-400 hover:border-clay-400 hover:text-clay-700">
            →
          </button>
        </div>
      )}
    </div>
  )
}

function Sources({ items }: { items: Source[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)}
              className="text-[11px] font-semibold text-clay-600 hover:underline">
        {open ? '▾' : '▸'} {t('chat.sources')} ({items.length})
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l-2 border-sand-200 pl-3">
          {items.map((s, i) => (
            <li key={i} className="text-[11px] leading-relaxed">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer"
                   className="text-ink-600 underline decoration-sand-200 hover:text-clay-700">
                  {s.title}
                </a>
              ) : <span className="text-ink-600">{s.title}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const QUICK_TEXT: Record<string, Record<string, string>> = {
  uk: {
    care: 'Підбери мені догляд — комбінована шкіра, помітні пори',
    delivery: 'Як довго їде доставка і скільки коштує?',
    compare: 'Порівняй сироватку з бакучіолом і з ніацинамідом',
    eyes: 'Що є для догляду навколо очей?',
  },
  pl: {
    care: 'Dobierz pielęgnację — cera mieszana, widoczne pory',
    delivery: 'Jak długo trwa dostawa i ile kosztuje?',
    compare: 'Porównaj serum z bakuchiolem i z niacynamidem',
    eyes: 'Co macie do pielęgnacji okolic oczu?',
  },
}

export default function Chat() {
  const { t, i18n } = useTranslation()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [convId, setConvId] = useState<number | null>(null)
  const [leadSent, setLeadSent] = useState(false)
  const [phone, setPhone] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const ask = async (text: string) => {
    if (!text.trim() || busy) return
    setInput('')
    setMsgs((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const r: ChatResponse = await api.chat({
        text, conversation_id: convId, lang: i18n.language,
      })
      setConvId(r.conversation_id)
      setMsgs((m) => [...m, {
        role: 'assistant', text: r.reply, sources: r.sources,
        products: r.products, offerHuman: r.offer_human || r.escalate,
      }])
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: '⚠️ ' + t('common.empty') }])
    } finally {
      setBusy(false)
    }
  }

  const callHuman = async () => {
    if (!convId) return
    await api.escalate({ conversation_id: convId })
    setMsgs((m) => [...m, { role: 'assistant', text: t('chat.humanCalled') }])
  }

  const sendLead = async () => {
    if (!convId || !phone.trim()) return
    await api.escalate({ conversation_id: convId, phone })
    setLeadSent(true)
  }

  const quick = ['care', 'delivery', 'compare', 'eyes'] as const

  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      <header className="sticky top-0 z-10 border-b border-sand-200 bg-sand-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-ink-900">{t('chat.title')}</h1>
              <Badge>{t('demoBadge')}</Badge>
            </div>
            <p className="truncate text-xs text-ink-400">{t('chat.subtitle')}</p>
          </div>
          <LangSwitch />
          <Link to="/admin" className="hidden shrink-0 text-xs font-semibold text-clay-600 hover:underline sm:block">
            {t('chat.openAdmin')}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        {!msgs.length && (
          <div className="rounded-2xl border border-sand-200 bg-white p-5">
            <p className="text-sm text-ink-600">{t('chat.sourcesHint')}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quick.map((k) => (
                <button key={k} onClick={() => ask(QUICK_TEXT[i18n.language]?.[k] ?? k)}
                        className="rounded-xl border border-sand-200 px-3 py-2.5 text-left text-sm text-ink-600 transition-colors hover:border-clay-400 hover:text-clay-700">
                  {t(`chat.quick.${k}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div className={`min-w-0 max-w-full rounded-2xl px-4 py-3 ${
                m.role === 'user'
                  ? 'bg-clay-600 text-white'
                  : 'border border-sand-200 bg-white text-ink-800'}`}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>
                {m.role === 'assistant' && (
                  <>
                    {m.products?.length ? <ProductScroller items={m.products} /> : null}
                    {m.sources?.length ? <Sources items={m.sources} /> : null}
                    {m.offerHuman && (
                      <div className="mt-3">
                        <Button variant="ghost" onClick={callHuman}>{t('chat.callHuman')}</Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-sm text-ink-400">{t('chat.thinking')}</div>}
          <div ref={endRef} />
        </div>

        {msgs.length >= 6 && !leadSent && convId && (
          <div className="mt-5 rounded-2xl border border-sand-200 bg-white p-4">
            <p className="text-sm text-ink-600">{t('chat.leadPrompt')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                     placeholder={t('chat.leadPlaceholder')}
                     className="min-w-0 flex-1 rounded-full border border-sand-200 px-4 py-2 text-sm outline-none focus:border-clay-400" />
              <Button onClick={sendLead}>{t('chat.leadSend')}</Button>
            </div>
          </div>
        )}
        {leadSent && <p className="mt-4 text-sm text-emerald-700">{t('chat.leadThanks')}</p>}
      </main>

      <div className="sticky bottom-0 border-t border-sand-200 bg-sand-50/95 backdrop-blur">
        <form onSubmit={(e) => { e.preventDefault(); void ask(input) }}
              className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <input value={input} onChange={(e) => setInput(e.target.value)}
                 placeholder={t('chat.placeholder')}
                 className="min-w-0 flex-1 rounded-full border border-sand-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-clay-400" />
          <Button type="submit" disabled={busy}>{t('chat.send')}</Button>
        </form>
        <p className="pb-2 text-center text-[11px] text-ink-400">{t('chat.aiNotice')}</p>
      </div>

      <Disclaimer />
    </div>
  )
}
