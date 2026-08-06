/**
 * Аудит інтерфейсу: обидві теми × два вьюпорти × усі маршрути.
 *
 * Шукає те, що око пропускає: горизонтальний скрол, текст, який зливається
 * з тлом за контрастом WCAG, порожні розділи, зниклий сайдбар, помилки консолі,
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
      const parse = (c) => (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number)
      const alphaOf = (c) => {
        const m = c.match(/rgba?\(([^)]+)\)/)
        if (!m) return 1
        const parts = m[1].split(',').map((x) => parseFloat(x))
        return parts.length > 3 ? parts[3] : 1
      }
      // Напівпрозорі заливки треба НАКЛАДАТИ, а не читати як суцільний колір:
      // чип із фоном accent/10 має ті самі канали, що й текст accent, і
      // детектор вважав його невидимим, хоча він читається чудово.
      const bgOf = (el) => {
        const stack = []
        let n = el
        while (n && n !== document.documentElement) {
          const c = getComputedStyle(n).backgroundColor
          const a = c ? alphaOf(c) : 0
          if (c && a > 0.001) {
            stack.push([parse(c), a])
            if (a >= 0.999) break
          }
          n = n.parentElement
        }
        let base = parse(getComputedStyle(document.body).backgroundColor)
        for (let i = stack.length - 1; i >= 0; i--) {
          const [c, a] = stack[i]
          base = base.map((v, k) => c[k] * a + v * (1 - a))
        }
        return base
      }
      const overImage = (el) => {
        let n = el
        while (n && n !== document.documentElement) {
          const s = getComputedStyle(n)
          if (s.backgroundImage && s.backgroundImage !== 'none') return true
          n = n.parentElement
        }
        return false
      }
      for (const el of document.querySelectorAll('main *, aside *, header *')) {
        if (!el.textContent?.trim() || el.children.length) continue
        const st = getComputedStyle(el)
        if (st.opacity === '0' || st.visibility === 'hidden') continue
        // Текст поверх фото чи градієнта: колір під ним задає картинка,
        // обчислити контраст із computed styles неможливо.
        if (overImage(el)) continue
        const r0 = el.getBoundingClientRect()
        if (r0.width < 10 || r0.height < 6) continue
        // Контраст за WCAG, а не сира різниця RGB: попередній поріг
        // (сума модулів різниць < 60) пропускав сірий #A6A6A6 на білому —
        // формально «різні» кольори, фактично текст не читається.
        const lum = (c) => {
          const [r, g, bl] = c.map((v) => {
            const x = v / 255
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * bl
        }
        const fg = parse(st.color)
        const bg = bgOf(el)
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a)
        const ratio = (l1 + 0.05) / (l2 + 0.05)
        // Великим вважається текст від 18.66px жирного або 24px звичайного.
        const px = parseFloat(st.fontSize)
        const bold = parseInt(st.fontWeight, 10) >= 700
        const large = px >= 24 || (bold && px >= 18.66)
        const need = large ? 3 : 4.5
        if (ratio < need) {
          out.invisible.push(`${el.tagName} «${el.textContent.trim().slice(0, 28)}» `
            + `${ratio.toFixed(1)}:1 (треба ${need})`)
        }
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
    if (res.invisible.length) issues.push(`слабкий контраст (${res.invisible.length}): `
        + res.invisible.slice(0, 4).join(' | '))
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
