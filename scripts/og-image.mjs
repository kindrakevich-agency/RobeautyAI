/**
 * Генерація og-зображення 1200×630 у фірмовому стилі.
 *
 * Малюємо HTML і знімаємо його — так картинка завжди відповідає поточним
 * кольорам і шрифту стенда, і її можна перегенерувати однією командою
 * замість того, щоб правити png руками.
 *
 * Цифри беруться з /api/health, тобто на картці стоять справжні показники
 * каталогу, а не намальовані.
 *
 * Запуск: node scripts/og-image.mjs [https://robeauty.kindrakevich.com]
 */
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'https://robeauty.kindrakevich.com'
const OUT = new URL('../web/public/og.png', import.meta.url).pathname

let stats = { products: 179, chunks: 1014 }
try {
  const r = await fetch(`${BASE}/api/health`)
  if (r.ok) stats = await r.json()
} catch {
  console.error('    /api/health недоступний — беремо запасні числа')
}

// Шрифт вшиваємо в сторінку: браузер у headless не має Inter,
// а без нього напис поїхав би на системну гарнітуру.
const fontB64 = (w) =>
  readFileSync(new URL(`../web/public/fonts/inter-${w}-latin.woff2`, import.meta.url))
    .toString('base64')
const fontCyr = (w) =>
  readFileSync(new URL(`../web/public/fonts/inter-${w}-cyrillic.woff2`, import.meta.url))
    .toString('base64')

const face = (w) => `
  @font-face { font-family: Inter; font-weight: ${w}; font-display: block;
    src: url(data:font/woff2;base64,${fontB64(w)}) format('woff2');
    unicode-range: U+0000-00FF, U+2000-206F, U+2212; }
  @font-face { font-family: Inter; font-weight: ${w}; font-display: block;
    src: url(data:font/woff2;base64,${fontCyr(w)}) format('woff2');
    unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${face(400)} ${face(600)} ${face(700)}
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #191A1B; color: #FFFFFF;
         font-family: Inter, sans-serif; display: flex; flex-direction: column;
         justify-content: space-between; padding: 68px 72px; position: relative;
         overflow: hidden; }
  /* Тепла пляма у кутку — єдиний кольоровий акцент, узятий із бежу бренду. */
  .glow { position: absolute; right: -180px; top: -180px; width: 620px; height: 620px;
          border-radius: 50%; background: radial-gradient(circle,
          rgba(229,222,211,.16) 0%, rgba(229,222,211,0) 70%); }
  .logo { display: flex; align-items: center; gap: 14px; }
  .word { font-size: 30px; letter-spacing: .02em; line-height: 1; }
  .word b { font-weight: 700; } .word span { font-weight: 400; }
  .bar { width: 1px; height: 24px; background: #545454; }
  .kicker { font-size: 11px; font-weight: 700; letter-spacing: .16em;
            text-transform: uppercase; color: #A6A6A6; line-height: 1.35; }
  h1 { font-size: 66px; line-height: 1.06; font-weight: 700; letter-spacing: -.02em;
       max-width: 15ch; }
  .lede { margin-top: 22px; font-size: 22px; line-height: 1.5; color: #C7C7C7;
          max-width: 34ch; }
  .stats { display: flex; gap: 56px; border-top: 1px solid #3D3D3D; padding-top: 26px; }
  .s .n { font-size: 34px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .s .l { margin-top: 4px; font-size: 12px; font-weight: 700; letter-spacing: .1em;
          text-transform: uppercase; color: #A6A6A6; }
  .host { margin-left: auto; align-self: flex-end; font-size: 14px; color: #8A8A8A; }
</style></head><body>
  <div class="glow"></div>
  <div class="logo">
    <div class="word"><b>RO</b><span>BEAUTY</span></div>
    <div class="bar"></div>
    <div class="kicker">AI<br>CONSULTANT</div>
  </div>
  <div>
    <h1>Консультант, який знає весь каталог</h1>
    <p class="lede">Підбір догляду за типом шкіри й проблемою — з цінами, складом
       і посиланням на кожен засіб.</p>
  </div>
  <div class="stats">
    <div class="s"><div class="n">${stats.products}</div><div class="l">товарів у каталозі</div></div>
    <div class="s"><div class="n">${(stats.chunks ?? 0).toLocaleString('uk-UA')}</div><div class="l">фрагментів знань</div></div>
    <div class="s"><div class="n">UA · PL</div><div class="l">дві мови</div></div>
    <div class="host">robeauty.kindrakevich.com</div>
  </div>
</body></html>`

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(300)
await page.screenshot({ path: OUT })
await browser.close()
console.log(`og-image: ${OUT} (товарів ${stats.products}, фрагментів ${stats.chunks})`)
