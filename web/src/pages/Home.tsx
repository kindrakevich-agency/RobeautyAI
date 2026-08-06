import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Badge, Card, Disclaimer, LangSwitch, ThemeToggle } from '../ui'
import Widget from '../Widget'

/**
 * Публічна сторона стенда: коротко пояснює, що це, і дає чат.
 * Сам консультант — плаваючий віджет, як він і стоятиме на сайті бренду.
 */
export default function Home() {
  const { t } = useTranslation()
  const points = ['sources', 'grounding', 'cards', 'handoff'] as const

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-ink-950">
      <header className="border-b border-ink-200/60 dark:border-ink-700/60">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-semibold tracking-wide text-ink-950 dark:text-cream-50">
              RoBeauty
            </div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-rose-600 uppercase dark:text-rose-300">
              AI Consultant
            </div>
          </div>
          <Badge tone="brand">{t('demoBadge')}</Badge>
          <LangSwitch />
          <ThemeToggle />
          <Link to="/admin" className="hidden text-xs font-semibold text-rose-600 hover:underline sm:block dark:text-rose-300">
            {t('chat.openAdmin')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-14">
        <h1 className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight text-ink-950 sm:text-4xl dark:text-cream-50">
          {t('home.title')}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-600 dark:text-ink-300">
          {t('home.lede')}
        </p>
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-rose-500/40
                      bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
          {t('home.cta')} →
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {points.map((k) => (
            <Card key={k} className="animate-rise">
              <div className="text-sm font-semibold text-ink-900 dark:text-cream-50">
                {t(`home.points.${k}.title`)}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                {t(`home.points.${k}.text`)}
              </p>
            </Card>
          ))}
        </div>
      </main>

      <Disclaimer />
      <Widget />
    </div>
  )
}
