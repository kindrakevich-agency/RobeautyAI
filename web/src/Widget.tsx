import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ChatResponse, type ProductCard, type Source } from './api'
import { renderMarkdown } from './markdown'

/**
 * Плаваючий консультант — той самий, що в DEMAX: кнопка з пульсуючими
 * кільцями, докована панель праворуч знизу, розгортання на весь екран.
 * Живе на кожній сторінці, і в адмінці теж: менеджер має бачити продукт
 * очима клієнта.
 */

type Msg = {
  role: 'user' | 'assistant'
  text: string
  sources?: Source[]
  products?: ProductCard[]
  offerHuman?: boolean
}

const LOOP = 'M4 16 C4 7 13 7 16 16 C19 25 28 25 28 16 C28 7 19 7 16 16 C13 25 4 25 4 16 Z'

function Fab({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={open ? 'close chat' : 'open chat'}
            className="fixed right-5 bottom-5 z-[95] grid size-14 place-items-center rounded-full
                       bg-ink-900 text-white shadow-pop dark:bg-cream-100 dark:text-ink-950 outline-none transition-transform
                       hover:scale-105 dark:bg-ink-800 dark:text-cream-100">
      {!open && (
        <>
          <span aria-hidden className="rb-ring" />
          <span aria-hidden className="rb-ring rb-ring--delay" />
        </>
      )}
      {open ? (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
             strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      ) : (
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
          <defs>
            <linearGradient id="rb-loop" x1="0" y1="16" x2="32" y2="16" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#8A8A8A" />
              <stop offset="55%" stopColor="#F2EEE9" />
              <stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>
          </defs>
          <path d={LOOP} stroke="url(#rb-loop)" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}

function Cards({ items }: { items: ProductCard[] }) {
  const { t } = useTranslation()
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const rail = useRef<HTMLDivElement>(null)
  if (!items.length) return null
  return (
    <div className="mt-2.5">
      <div ref={rail} className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
        {items.map((p) => (
          <div key={p.sku} className="flex w-[168px] shrink-0 snap-start flex-col rounded-xl
                                      border border-ink-200/70 bg-white p-2 dark:border-ink-700 dark:bg-ink-800">
            {p.image && !broken[p.sku] && (
              <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer"
                   onError={() => setBroken((b) => ({ ...b, [p.sku]: true }))}
                   className="mb-1.5 aspect-square w-full rounded-lg object-cover" />
            )}
            <div className="line-clamp-2 text-[11px] font-semibold leading-snug text-ink-800 dark:text-cream-100">
              {p.title}
            </div>
            <div className="mt-1 text-[13px] font-semibold text-ink-950 dark:text-cream-200">
              {Math.round(p.price).toLocaleString('uk-UA')} {t('common.uah')}
            </div>
            {p.ingredients?.length ? (
              <div className="mt-0.5 line-clamp-1 text-[10px] text-ink-400">
                {p.ingredients.join(' · ')}
              </div>
            ) : null}
            <a href={p.url ?? '#'} target="_blank" rel="noreferrer"
               className="mt-auto pt-1.5 text-[10px] font-semibold text-ink-900 hover:underline dark:text-cream-200">
              {t('chat.more')} →
            </a>
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mt-1 flex justify-end gap-1">
          {([-1, 1] as const).map((d) => (
            <button key={d} onClick={() => rail.current?.scrollBy({ left: d * 180, behavior: 'smooth' })}
                    aria-label={d < 0 ? '←' : '→'}
                    className="rounded-full border border-ink-200 px-2 py-0.5 text-[10px] text-ink-400
                               hover:border-ink-700 hover:text-ink-950 dark:border-ink-700">
              {d < 0 ? '←' : '→'}
            </button>
          ))}
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
    <div className="mt-1.5">
      <button onClick={() => setOpen((v) => !v)}
              className="text-[10px] font-semibold text-ink-900 hover:underline dark:text-cream-200">
        {open ? '▾' : '▸'} {t('chat.sources')} ({items.length})
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l-2 border-ink-200 pl-2 dark:border-ink-700">
          {items.map((s, i) => (
            <li key={i} className="text-[10px] leading-relaxed">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer"
                   className="text-ink-500 underline decoration-ink-200 hover:text-ink-950 dark:text-ink-400">
                  {s.title}
                </a>
              ) : <span className="text-ink-500">{s.title}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const QUICK: Record<string, string[]> = {
  uk: [
    'Підбери догляд — комбінована шкіра, помітні пори',
    'Що є для догляду навколо очей?',
    'Порівняй сироватку з бакучіолом і з ніацинамідом',
  ],
  pl: [
    'Dobierz pielęgnację — cera mieszana, widoczne pory',
    'Co macie do pielęgnacji okolic oczu?',
    'Porównaj serum z bakuchiolem i z niacynamidem',
  ],
}

export default function Widget() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [convId, setConvId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const askRef = useRef<((t: string) => void) | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  // Головна відкриває консультанта своїми кнопками й може одразу підставити
  // питання — щоб перший крок коштував один клік, а не набирання тексту.
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true)
      const q = (e as CustomEvent<string>).detail
      if (q) setTimeout(() => void askRef.current?.(q), 260)
    }
    window.addEventListener('rb-open-widget', onOpen)
    return () => window.removeEventListener('rb-open-widget', onOpen)
  }, [])

  const ask = async (text: string) => {
    if (!text.trim() || busy) return
    setInput('')
    setMsgs((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const r: ChatResponse = await api.chat({ text, conversation_id: convId, lang: i18n.language })
      setConvId(r.conversation_id)
      setMsgs((m) => [...m, {
        role: 'assistant', text: r.reply, sources: r.sources,
        products: r.products, offerHuman: r.offer_human || r.escalate,
      }])
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: '⚠️ ' + t('chat.failed') }])
    } finally {
      setBusy(false)
    }
  }
  askRef.current = ask

  // До sm — завжди на весь екран: вузька панель на телефоні не поміщається.
  const docked = 'fixed inset-0 h-dvh w-screen rounded-none border-0 ' +
    'sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(680px,calc(100dvh-7rem))] ' +
    'sm:w-[min(390px,calc(100vw-2.5rem))] sm:rounded-lg sm:border sm:border-ink-200 ' +
    'sm:shadow-pop sm:dark:border-ink-700'
  const fullscreen = 'fixed inset-0 h-dvh w-screen rounded-none border-0'

  return (
    <>
      <div className={open ? 'hidden sm:block' : undefined}>
        <Fab open={open} onClick={() => setOpen((v) => !v)} />
      </div>
      {open && (
        <section role="dialog" aria-label={t('chat.title')}
                 className={`z-[94] flex flex-col overflow-hidden bg-cream-100 dark:bg-ink-950
                             ${full ? fullscreen : docked}`}>
          <header className="flex items-center gap-1 border-b border-ink-200/70 bg-cream-50/80 px-4 py-3
                             backdrop-blur-md dark:border-ink-700 dark:bg-ink-900/80">
            <button onClick={() => setFull((v) => !v)} aria-label="expand"
                    className="rounded-lg p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round">{full
                     ? <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /></>
                     : <><rect x="3" y="4" width="18" height="16" rx="2.5" /><line x1="9.5" y1="4" x2="9.5" y2="20" /></>}
              </svg>
            </button>
            <div className="flex-1 truncate px-1 text-center text-sm font-semibold text-ink-800 dark:text-cream-100">
              {t('chat.title')}
            </div>
            <button onClick={() => { setMsgs([]); setConvId(null) }} aria-label="new"
                    className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            </button>
            <button onClick={() => setOpen(false)} aria-label="close"
                    className="grid size-8 place-items-center rounded-full bg-ink-100 text-ink-500
                               hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </header>

          <div className="flex items-center gap-2 border-b border-ink-100 bg-cream-50 px-4 py-1.5
                          text-[11px] text-ink-400 dark:border-ink-800 dark:bg-ink-900" role="note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="7.6" r="1" fill="currentColor" />
            </svg>
            {t('chat.aiNotice')}
          </div>

          {!msgs.length ? (
            <div className="grid flex-1 place-items-center px-6">
              <div className="text-center">
                <h2 className="text-[20px] leading-snug font-bold tracking-tight text-ink-900 dark:text-cream-50">
                  {t('chat.greeting')}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-ink-400">{t('chat.sourcesHint')}</p>
                <div className="mt-5 space-y-2">
                  {(QUICK[i18n.language] ?? QUICK.uk).map((q) => (
                    <button key={q} onClick={() => ask(q)}
                            className="w-full rounded-xl border border-ink-200/70 px-3 py-2.5 text-left
                                       text-xs leading-snug text-ink-600 transition-colors
                                       hover:border-ink-700 hover:text-ink-950
                                       dark:border-ink-700 dark:text-ink-300">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                  <div className={`min-w-0 max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-ink-900 text-white'
                      : 'border border-ink-200/70 bg-white text-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:text-cream-100'}`}>
                    {m.role === 'assistant' ? (
                      <div className="rb-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                    ) : (
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    )}
                    {m.role === 'assistant' && (
                      <>
                        {m.products?.length ? <Cards items={m.products} /> : null}
                        {m.sources?.length ? <Sources items={m.sources} /> : null}
                        {m.offerHuman && convId && (
                          <button onClick={async () => {
                            await api.escalate({ conversation_id: convId })
                            setMsgs((x) => [...x, { role: 'assistant', text: t('chat.humanCalled') }])
                          }} className="mt-2 rounded-full border border-ink-200 px-3 py-1 text-[11px]
                                        font-semibold text-ink-600 hover:border-ink-700 hover:text-ink-950
                                        dark:border-ink-700 dark:text-ink-300">
                            {t('chat.callHuman')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex gap-1 px-1 py-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-bounce rounded-full bg-ink-300"
                          style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); void ask(input) }}
                className="flex items-center gap-2 border-t border-ink-200/70 bg-cream-50 px-3 py-2.5
                           dark:border-ink-700 dark:bg-ink-900">
            <input value={input} onChange={(e) => setInput(e.target.value)}
                   placeholder={t('chat.placeholder')}
                   className="min-w-0 flex-1 rounded border border-ink-200 bg-white px-3.5 py-2 dark:border-ink-700 dark:bg-ink-800
                              text-[13px] outline-none focus:border-ink-700 dark:border-ink-700
                              dark:bg-ink-800 dark:text-cream-100" />
            <button type="submit" disabled={busy} aria-label={t('chat.send')}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-900 text-white
                               transition-colors hover:bg-ink-950 disabled:opacity-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </form>
        </section>
      )}
    </>
  )
}
