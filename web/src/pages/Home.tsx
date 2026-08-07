import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Disclaimer, LangSwitch, ThemeToggle } from '../ui'
import Widget from '../Widget'
import { CATEGORY_LABEL, QUESTIONS, type QCategory } from '../questions'

// Порядок розділів на сторінці: від того, що питають найчастіше,
// до перевірки меж — щоб було видно, де консультант зупиняється.
const ORDER: QCategory[] = ['skin', 'concern', 'ingredient', 'combine',
  'routine', 'price', 'brand', 'logistics', 'boundary']

/**
 * Публічна сторона стенда.
 *
 * Композиція взята з мови бренду, а не з шаблону лендінга. RoBeauty — це
 * «науковий ANTI-AGE»: на упаковці й на сторінках товарів названі активи з
 * відсотками (Argireline® 3%, AHA 30% + BHA 2%, ектоїн 0,5%). Тому сторінка
 * зроблена як специфікація на звороті упаковки: волосяні лінійки, поля
 * ВЕЛИКИМИ літерами з розрядкою, моноширинні числа в колонку.
 *
 * Усі числа в панелі — живі, з /api/health. Нічого не намальовано «для краси»:
 * підроблена цифра коштувала б довіри до всього іншого.
 */

type Health = { chunks: number; products: number; translated_pl: number }
type Item = { sku: string; title: string; price: number; volume: string | null
              image: string; url: string | null }

export default function Home() {
  const { t, i18n } = useTranslation()
  const [h, setH] = useState<Health | null>(null)
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setH).catch(() => {})
  }, [])

  // Фото — прямими посиланнями з robeauty.me, нічого не перезаливаємо.
  useEffect(() => {
    fetch(`/api/showcase?lang=${i18n.language}&limit=7`)
      .then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => {})
  }, [i18n.language])

  const points = ['sources', 'grounding', 'cards', 'handoff'] as const
  const num = (v?: number) => (v == null ? '—' : v.toLocaleString('uk-UA'))

  return (
    <div className="min-h-screen bg-cream-200 dark:bg-ink-950">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-cream-200/90 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          {/* Локап логотипа robeauty.me: «RO» жирним + «BEAUTY» тонким, риска,
              дрібний підпис — на сайті там «науковий ANTI-AGE». */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="font-display text-[19px] leading-none tracking-[0.02em] text-ink-950 dark:text-cream-50">
              <span className="font-bold">RO</span><span className="font-normal">BEAUTY</span>
            </div>
            <div className="h-[15px] w-px bg-ink-300 dark:bg-ink-700" />
            <div className="text-[8px] font-bold leading-[1.3] tracking-[0.07em] text-ink-700 uppercase dark:text-ink-300">
              AI<br />CONSULTANT
            </div>
          </div>
          <LangSwitch />
          <ThemeToggle />
          <Link to="/admin"
                className="hidden text-[10px] font-bold tracking-display text-ink-700 uppercase
                           hover:text-ink-950 sm:block dark:text-ink-300 dark:hover:text-cream-50">
            {t('chat.openAdmin')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        {/* ---------- обкладинка ---------- */}
        <section className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
          <div className="animate-rise min-w-0">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-ink-900 dark:bg-cream-200" />
              <span className="text-[10px] font-bold tracking-[0.08em] text-ink-700 uppercase dark:text-ink-300">
                {t('home.eyebrow')}
              </span>
            </div>

            {/* Без капслока: він лишався від попереднього напрямку з
                геометричним шрифтом. Inter у великому кеглі читається краще
                звичайним регістром. */}
            <h1 className="mt-6 font-display text-[clamp(2rem,4.6vw,3.05rem)] leading-[1.12]
                           font-bold tracking-[-0.022em] text-balance text-ink-950
                           dark:text-cream-50">
              {t('home.title')}
            </h1>

            <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.7] text-ink-600 dark:text-ink-300">
              {t('home.lede')}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('rb-open-widget'))}
                      className="group inline-flex items-center gap-3 rounded bg-ink-900 px-6 py-3.5
                                 text-[11px] font-bold tracking-display text-white uppercase
                                 transition-colors hover:bg-ink-950 active:scale-[.99]
                                 dark:bg-cream-100 dark:text-ink-950 dark:text-cream-50 dark:hover:bg-cream-50">
                {t('home.ctaButton')}
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </button>
              <span className="text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">
                {t('home.ctaHint')}
              </span>
            </div>
          </div>

          {/* Фото товару бренду на бежі — та сама подача, що й плитки категорій
              на robeauty.me. Без знімка ахроматична палітра читається як бланк:
              у них колір тримає саме фотографія, а не акцентний відтінок. */}
          <div className="animate-rise-1 min-w-0 self-stretch">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-cream-200 dark:bg-ink-900">
              {items[0]?.image && (
                <img src={items[0].image} alt={items[0].title} loading="eager"
                     className="size-full object-cover" />
              )}
              {items[0] && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 via-ink-950/55 to-transparent p-4 pt-12">
                  <div className="text-[11px] leading-snug font-semibold text-white line-clamp-2">
                    {items[0].title}
                  </div>
                  <div className="mt-1 text-[11px] font-bold tabular-nums text-white/85">
                    {Math.round(items[0].price).toLocaleString('uk-UA')} {t('common.uah')}
                    {items[0].volume ? ` · ${items[0].volume}` : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---------- специфікація стенда ---------- */}
        <section className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-px border-y border-ink-200
                            bg-ink-200 sm:grid-cols-[repeat(4,minmax(0,1fr))]
                            dark:border-ink-800 dark:bg-ink-800">
          {[
            ['catalog', num(h?.products)],
            ['chunks', num(h?.chunks)],
            ['langs', `UA · PL — ${num(h?.translated_pl)}`],
            ['sources', t('home.spec.sourcesValue')],
          ].map(([k, v]) => (
            <div key={String(k)} className="min-w-0 bg-cream-100 px-4 py-5 dark:bg-ink-950">
              <div className="text-[9px] font-bold tracking-[0.07em] text-ink-700 uppercase dark:text-ink-300">
                {t(`home.spec.${k}`)}
              </div>
              <div className="mt-2 font-display text-[16px] leading-tight font-bold tabular-nums
                              text-balance text-ink-950 dark:text-cream-50">
                {v}
              </div>
            </div>
          ))}
        </section>

        {/* ---------- склад ---------- */}
        <section className="border-t border-ink-200 py-14 dark:border-ink-800">
          <h2 className="rb-display text-[11px] text-ink-600 dark:text-ink-300">
            {t('home.compositionTitle')}
          </h2>

          <div className="mt-7 divide-y divide-ink-200 border-t border-ink-200 dark:divide-ink-800 dark:border-ink-800">
            {points.map((k, i) => (
              <div key={k} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr_1.15fr] sm:gap-8">
                <div className="font-display text-[13px] font-bold tabular-nums text-ink-600 dark:text-ink-400">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="text-[13px] font-bold tracking-[0.02em] text-ink-950 uppercase dark:text-cream-50">
                  {t(`home.points.${k}.title`)}
                </h3>
                <p className="text-[13px] leading-[1.7] text-ink-600 dark:text-ink-300">
                  {t(`home.points.${k}.text`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Каталог, на якому все це працює: справжні фото, назви й ціни.
            Заразом це доказ, що стенд стоїть поверх реальних даних. */}
        {items.length > 1 && (
          <section className="border-t border-ink-200 py-14 dark:border-ink-800">
            <h2 className="rb-display text-[11px] text-ink-600 dark:text-ink-300">
              {t('home.catalogTitle')}
            </h2>
            {/* Смуга тримається спільної сітки: раніше вона виривалася на всю
                ширину через -mx-5, і сусідні блоки поруч читалися вужчими. */}
            <div className="no-scrollbar mt-6 flex snap-x snap-mandatory gap-3
                            overflow-x-auto pb-1">
              {items.slice(1).map((it) => (
                <a key={it.sku} href={it.url || '#'} target="_blank" rel="noreferrer"
                   className="group w-[46%] shrink-0 snap-start sm:w-[23%]">
                  <div className="aspect-square w-full overflow-hidden bg-cream-200 dark:bg-ink-900">
                    <img src={it.image} alt={it.title} loading="lazy"
                         className="size-full object-cover transition-transform duration-500
                                    group-hover:scale-[1.04]" />
                  </div>
                  <div className="mt-2.5 line-clamp-2 text-[12px] leading-snug text-ink-800 dark:text-cream-100">
                    {it.title}
                  </div>
                  <div className="mt-1 text-[12px] font-bold tabular-nums text-ink-950 dark:text-cream-50">
                    {Math.round(it.price).toLocaleString('uk-UA')} {t('common.uah')}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ---------- спробуйте самі ---------- */}
        <section className="pb-20">
          <h2 className="rb-display text-[11px] text-ink-600 dark:text-ink-300">
            {t('home.tryTitle')}
          </h2>
          {/* Усі 30 питань, згруповані за категоріями: видно, що саме
              перевіряється, і будь-яке можна поставити одним кліком. */}
          <div className="mt-6 space-y-6">
            {ORDER.map((cat) => {
              const items = QUESTIONS.filter((q) => q.cat === cat)
              if (!items.length) return null
              return (
                <div key={cat}>
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className="text-[10px] font-bold tracking-display text-brand-600
                                     uppercase dark:text-brand-400">
                      {CATEGORY_LABEL[cat][i18n.language === 'pl' ? 'pl' : 'uk']}
                    </span>
                    <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((q) => {
                      const text = i18n.language === 'pl' ? q.pl : q.uk
                      return (
                        <button key={q.id} type="button"
                                onClick={() => window.dispatchEvent(
                                  new CustomEvent('rb-open-widget', { detail: text }))}
                                className="group flex items-start gap-2 rounded border border-ink-200
                                           bg-cream-50 px-3.5 py-3 text-left transition-colors
                                           hover:border-brand-500 dark:border-ink-800
                                           dark:bg-ink-900 dark:hover:border-brand-400">
                          <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-800
                                           dark:text-cream-100">{text}</span>
                          <span aria-hidden className="mt-0.5 shrink-0 text-ink-400 transition-colors
                                                       group-hover:text-brand-600 dark:group-hover:text-brand-400">→</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      <Disclaimer />
      <Widget />
    </div>
  )
}
