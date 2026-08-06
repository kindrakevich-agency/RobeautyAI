/**
 * Аудит інтерфейсу: обидві теми × два вьюпорти × усі маршрути.
 *
 * Шукає те, що око пропускає: горизонтальний скрол, текст, який зливається
 * з фактичним тлом, порожні розділи, зниклий сайдбар, помилки консолі,
 * запити зі статусом 4xx/5xx і замалі цілі для пальця на мобільному.
 *
 * Мобільний вьюпорт тут не для галочки: вікно Chrome на macOS не звужується
 * менше ~500px, тож руками мобільну верстку не перевірити взагалі.
 *
 * Запуск: ADMIN_PASSWORD=… node scripts/audit.mjs
 */
import { chromium } from 'playwright-core'

const BASE = process.env.AUDIT_BASE ?? 'https://robeauty.kindrakevich.com'
const ROUTES = ['/', '/admin', '/admin/orders', '/admin/shipments', '/admin/dialogs',
  '/admin/tickets', '/admin/products', '/admin/sync', '/admin/localization',
  '/admin/analytics', '/admin/eval']
// Креденшали адмінки — з оточення, у репозиторій не потрапляють.
const CREDS = Buffer.from(
  `${process.env.ADMIN_USER ?? 'admin'}:${process.env.ADMIN_PASSWORD ?? ''}`).toString('base64')

const VIEWPORTS = [
  { name: 'desktop', width: 1400, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },  // iPhone 14
]

const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })

const bugs = []
for (const theme of ['light', 'dark'])
for (const vp of VIEWPORTS) {
  const ctx = await b.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile, hasTouch: vp.isMobile,
    deviceScaleFactor: vp.isMobile ? 3 : 1,
  })
  const page = await ctx.newPage()
  await page.addInitScript(([c, th]) => {
    sessionStorage.setItem('rb-admin', c)
    localStorage.setItem('rb-theme', th)
  }, [CREDS, theme])

  for (const route of ROUTES) {
    const errors = []
    const failed = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
    page.on('requestfailed', (r) => failed.push(r.url().slice(0, 80)))
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 70)}`) })

    await page.goto(`${BASE}${route}?t=${theme}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    const res = await page.evaluate(() => {
      const de = document.documentElement
      const out = { overflow: de.scrollWidth - de.clientWidth, invisible: [], empty: false }
      // Текст, що зливається з ФАКТИЧНИМ тлом: піднімаємось по предках,
      // поки не знайдемо непрозорий фон — інакше активна кнопка з власним
      // світлим тлом хибно вважається невидимою.
      const parse = (c) => (c.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number)
      const bgOf = (el) => {
        let n = el
        while (n && n !== document.documentElement) {
          const c = getComputedStyle(n).backgroundColor
          if (c && !c.includes('rgba(0, 0, 0, 0)') && c !== 'transparent') return parse(c)
          n = n.parentElement
        }
        return parse(getComputedStyle(document.body).backgroundColor)
      }
      for (const el of document.querySelectorAll('main *, aside *, header *')) {
        if (!el.textContent?.trim() || el.children.length) continue
        const st = getComputedStyle(el)
        if (st.opacity === '0' || st.visibility === 'hidden') continue
        const r0 = el.getBoundingClientRect()
        if (r0.width < 10 || r0.height < 6) continue
        const [r, g, bl] = parse(st.color)
        const [br, bgc, bb] = bgOf(el)
        const diff = Math.abs(r - br) + Math.abs(g - bgc) + Math.abs(bl - bb)
        if (diff < 60) out.invisible.push(`${el.tagName}: ${el.textContent.trim().slice(0, 40)}`)
      }
      out.empty = (document.querySelector('main')?.textContent || '').trim().length < 40
      out.hasAside = Boolean(document.querySelector('aside'))

      // Елементи, що вилазять за праву межу екрана — головна причина
      // горизонтального скролу; без винуватця його неможливо полагодити.
      out.wide = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.height < 8) continue
        if (r.right > document.documentElement.clientWidth + 2) {
          const cs = getComputedStyle(el)
          if (cs.position === 'fixed' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue
          out.wide.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]}`
                        + ` +${Math.round(r.right - document.documentElement.clientWidth)}px`)
        }
      }
      out.wide = [...new Set(out.wide)].slice(0, 4)

      // Замалі цілі для пальця: рекомендація 44×44 CSS-пікселі.
      out.small = []
      for (const el of document.querySelectorAll('a[href], button, [role=button], input, select')) {
        const r = el.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) continue
        if (getComputedStyle(el).display === 'contents') continue
        if (r.height < 32 || r.width < 32) {
          out.small.push(`${el.tagName} «${(el.textContent || el.getAttribute('aria-label') || '?')
            .trim().slice(0, 18)}» ${Math.round(r.width)}×${Math.round(r.height)}`)
        }
      }
      out.small = [...new Set(out.small)].slice(0, 5)
      return out
    })

    const issues = []
    if (res.overflow > 2) {
      issues.push(`горизонтальний скрол ${res.overflow}px`
        + (res.wide.length ? ` — винуватці: ${res.wide.join(', ')}` : ''))
    }
    if (vp.isMobile && res.small.length) issues.push(`замалі цілі: ${res.small.join(' | ')}`)
    if (res.invisible.length) issues.push(`невидимий текст: ${res.invisible.slice(0, 3).join(' | ')}`)
    if (res.empty) issues.push('порожній контент')
    if (route.startsWith('/admin') && !res.hasAside) issues.push('немає сайдбару')
    if (errors.length) issues.push(`console: ${errors.slice(0, 2).join(' | ')}`)
    const realFailed = failed.filter((f) => !f.includes('favicon'))
    if (realFailed.length) issues.push(`запити: ${realFailed.slice(0, 2).join(' | ')}`)

    if (issues.length) bugs.push({ theme, vp: vp.name, route, issues })
    page.removeAllListeners()
  }
  await ctx.close()
}
await b.close()

if (!bugs.length) console.log('чисто: помилок не знайдено')
else for (const x of bugs) console.log(`✗ [${x.vp} · ${x.theme}] ${x.route}\n    ${x.issues.join('\n    ')}`)
