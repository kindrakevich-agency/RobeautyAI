import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Disclaimer, LangSwitch, ThemeToggle } from '../ui'
import Widget from '../Widget'

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
 * на демо-стенді підроблена цифра коштувала б довіри до всього іншого.
 */

type Health = { chunks: number; products: number; translated_pl: number }

export default function Home() {
  const { t } = useTranslation()
  const [h, setH] = useState<Health | null>(null)

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setH).catch(() => {})
  }, [])

  const points = ['sources', 'grounding', 'cards', 'handoff'] as const
  const num = (v?: number) => (v == null ? '—' : v.toLocaleString('uk-UA'))

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-ink-950">
      <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-cream-100/90 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          {/* Локап логотипа robeauty.me: «RO» жирним + «BEAUTY» тонким, риска,
              дрібний підпис — на сайті там «науковий ANTI-AGE». */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="font-display text-[19px] leading-none tracking-[0.02em] text-ink-950 dark:text-cream-50">
              <span className="font-bold">RO</span><span className="font-normal">BEAUTY</span>
            </div>
            <div className="h-[15px] w-px bg-ink-300 dark:bg-ink-700" />
            <div className="text-[8px] font-bold leading-[1.3] tracking-[0.16em] text-ink-600 uppercase dark:text-ink-400">
              AI<br />CONSULTANT
            </div>
          </div>
          <LangSwitch />
          <ThemeToggle />
          <Link to="/admin"
                className="hidden text-[10px] font-bold tracking-display text-ink-600 uppercase
                           hover:text-ink-950 sm:block dark:text-ink-400 dark:hover:text-cream-50">
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
              <span className="text-[10px] font-bold tracking-[0.2em] text-ink-600 uppercase dark:text-ink-400">
                {t('home.eyebrow')}
              </span>
            </div>

            <h1 className="mt-6 font-display text-[clamp(1.9rem,5.2vw,3.1rem)] leading-[1.06]
                           font-bold tracking-[-0.01em] text-ink-950 uppercase text-balance
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
                                 dark:bg-cream-100 dark:text-ink-950 dark:hover:bg-white">
                {t('home.ctaButton')}
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </button>
              <span className="text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                {t('home.ctaHint')}
              </span>
            </div>
          </div>

          {/* Панель специфікації — той самий жанр, що й склад на звороті банки. */}
          <aside className="animate-rise-1 min-w-0 self-start border border-ink-200 bg-white
                            dark:border-ink-800 dark:bg-ink-900">
            <div className="border-b border-ink-200 px-5 py-3 dark:border-ink-800">
              <div className="text-[9px] font-bold tracking-[0.2em] text-ink-500 uppercase dark:text-ink-400">
                {t('home.spec.title')}
              </div>
            </div>
            <dl className="divide-y divide-ink-100 dark:divide-ink-800">
              {[
                ['catalog', num(h?.products)],
                ['chunks', num(h?.chunks)],
                ['langs', `UA · PL — ${num(h?.translated_pl)}`],
                ['sources', t('home.spec.sourcesValue')],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
                  <dt className="text-[10px] font-bold tracking-[0.14em] text-ink-500 uppercase dark:text-ink-400">
                    {t(`home.spec.${k}`)}
                  </dt>
                  <dd className="shrink-0 font-display text-[15px] font-semibold tabular-nums
                                 text-ink-950 dark:text-cream-50">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-ink-200 px-5 py-3 dark:border-ink-800">
              <p className="text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">
                {t('home.spec.note')}
              </p>
            </div>
          </aside>
        </section>

        {/* ---------- склад ---------- */}
        <section className="border-t border-ink-200 py-14 dark:border-ink-800">
          <h2 className="rb-display text-[11px] text-ink-500 dark:text-ink-400">
            {t('home.compositionTitle')}
          </h2>

          <div className="mt-7 divide-y divide-ink-200 border-y border-ink-200 dark:divide-ink-800 dark:border-ink-800">
            {points.map((k, i) => (
              <div key={k} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr_1.15fr] sm:gap-8">
                <div className="font-display text-[13px] font-bold tabular-nums text-ink-300 dark:text-ink-600">
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

        {/* ---------- спробуйте самі ---------- */}
        <section className="pb-20">
          <h2 className="rb-display text-[11px] text-ink-500 dark:text-ink-400">
            {t('home.tryTitle')}
          </h2>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
            {(['dry', 'retinol', 'gift'] as const).map((k) => (
              <button key={k} type="button"
                      onClick={() => window.dispatchEvent(
                        new CustomEvent('rb-open-widget', { detail: t(`home.try.${k}`) }))}
                      className="group border border-ink-200 bg-white px-4 py-4 text-left transition-colors
                                 hover:border-ink-900 dark:border-ink-800 dark:bg-ink-900
                                 dark:hover:border-cream-200">
                <span className="block text-[13px] leading-snug text-ink-800 dark:text-cream-100">
                  {t(`home.try.${k}`)}
                </span>
                <span className="mt-2.5 block text-[10px] font-bold tracking-display text-ink-400
                                 uppercase transition-colors group-hover:text-ink-900
                                 dark:group-hover:text-cream-200">
                  {t('home.tryAsk')} →
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <Disclaimer />
      <Widget />
    </div>
  )
}
