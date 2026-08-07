import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity, BadgeCheck, BarChart3, Boxes, Languages, LayoutDashboard, Menu,
  MessageCircleQuestion, MessagesSquare, PackageCheck, RefreshCw, ShoppingBag, Truck, X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clearAdminCreds } from './api'
import SystemInsights from './SystemInsights'
import Widget from './Widget'
import { Badge, Disclaimer, LangSwitch, ThemeToggle } from './ui'

type Item = { to: string; key: string; icon: typeof LayoutDashboard }

const groups: { title: string; items: Item[] }[] = [
  {
    title: 'nav.groupOverview',
    items: [
      { to: '/admin', key: 'dashboard', icon: LayoutDashboard },
      { to: '/admin/dialogs', key: 'dialogs', icon: MessagesSquare },
    ],
  },
  {
    title: 'nav.groupOperations',
    items: [
      { to: '/admin/orders', key: 'orders', icon: PackageCheck },
      { to: '/admin/shipments', key: 'shipments', icon: Truck },
      { to: '/admin/tickets', key: 'tickets', icon: BadgeCheck },
    ],
  },
  {
    title: 'nav.groupContent',
    items: [
      { to: '/admin/products', key: 'products', icon: Boxes },
      { to: '/admin/localization', key: 'localization', icon: Languages },
    ],
  },
  {
    title: 'nav.groupInsights',
    items: [
      { to: '/admin/analytics', key: 'analytics', icon: BarChart3 },
      { to: '/admin/questions', key: 'questions', icon: MessageCircleQuestion },
      { to: '/admin/sync', key: 'sync', icon: RefreshCw },
    ],
  },
]

function Sidebar({ onNavigate, onLogout }: { onNavigate?: () => void; onLogout: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Локап логотипа robeauty.me: «RO» жирним + «BEAUTY» тонким, вертикальна
          риска, дрібний підпис — там на цьому місці «науковий ANTI-AGE». */}
      <div className="flex items-center gap-2.5 px-6 pt-7 pb-8">
        <div className="font-display text-[19px] leading-none tracking-[0.02em] text-ink-950 dark:text-cream-50">
          <span className="font-bold">RO</span><span className="font-normal">BEAUTY</span>
        </div>
        <div className="h-[15px] w-px bg-ink-300 dark:bg-ink-700" />
        <div className="text-[8px] font-bold leading-[1.3] tracking-[0.07em] text-ink-700 uppercase dark:text-ink-300">
          AI<br />OPERATIONS
        </div>
      </div>

      <nav className="flex-1 space-y-5 px-3 pb-6">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.08em] text-ink-700 uppercase dark:text-ink-300">
              {t(g.title)}
            </div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === '/admin'} onClick={onNavigate}
                       className={({ isActive }) =>
                         `mb-0.5 flex items-center gap-3 rounded px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${
                           isActive
                             ? 'bg-ink-900 text-white dark:bg-cream-100 dark:text-ink-950 dark:text-cream-50'
                             : 'text-ink-600 hover:bg-cream-200 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-cream-50'
                         }`}>
                <it.icon size={17} strokeWidth={2} />
                <span className="flex-1">{t(`nav.${it.key}`)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-200 px-6 py-4 text-[10px] leading-relaxed text-ink-600 dark:border-ink-700/60 dark:text-ink-300">
        <button onClick={onLogout} className="font-semibold hover:text-ink-800 dark:hover:text-cream-100">
          {t('common.logout')}
        </button>
        <br />robeauty.kindrakevich.com
      </div>
    </div>
  )
}

export default function Shell({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation()
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div className="min-h-screen bg-cream-200 dark:bg-ink-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-ink-200 bg-cream-50 lg:block dark:border-ink-700/60 dark:bg-ink-900">
        <Sidebar onLogout={onLogout} />
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-lg" onClick={() => setMobileNav(false)} />
          <aside className="animate-rise absolute inset-y-0 left-0 w-72 bg-cream-50 shadow-pop dark:bg-ink-900">
            <button className="absolute top-5 right-4 text-ink-600 dark:text-ink-300" onClick={() => setMobileNav(false)} aria-label="close">
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setMobileNav(false)} onLogout={onLogout} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200 bg-cream-200/90 px-4 backdrop-blur-md sm:px-6 dark:border-ink-700/60 dark:bg-ink-950/85">
          <button className="rounded-lg p-2 text-ink-600 dark:text-ink-300 hover:bg-ink-100 lg:hidden dark:hover:bg-ink-800"
                  onClick={() => setMobileNav(true)} aria-label="menu">
            <Menu size={20} />
          </button>

          <div className="min-w-0 max-w-md flex-1">
            <SystemInsights />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <a href="/" className="mr-1 hidden items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-950 sm:flex dark:text-ink-300">
              <ShoppingBag size={14} /> {t('nav.backToChat')}
            </a>
            <LangSwitch />
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
          <Outlet />
        </main>
        <Disclaimer />
      </div>
      <Widget />
    </div>
  )
}

export { clearAdminCreds }
