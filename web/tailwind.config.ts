/**
 * Палітра стенда = палітра robeauty.me.
 *
 * Значення зняті з живої сторінки бренду (computed styles), не підібрані на око:
 *   #FFFFFF  основна поверхня          #2E2E2E  графіт: кнопка «ДО КОШИКУ»
 *   #FAF8F2  тепле кремове тло         #191A1B  найтемніша поверхня
 *   #F2EEE9  беж (блоки категорій)     #D9D9D9  межі
 *   #F7F7F7  нейтральний світлий       #F0F0F0  роздільники
 *
 * Бренд ахроматичний: жодного кольорового акценту на сайті немає. Ієрархію
 * тримають контраст, вага шрифту і ВЕЛИКІ літери з розрядкою — так само, як у
 * них. Кольором позначаємо лише стан (успіх/увага/помилка), і ці відтінки
 * ніколи не використовуються як акцент.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { 50: '#FFFFFF', 100: '#FAF8F2', 200: '#F2EEE9', 300: '#E5DED3' },
        ink: {
          950: '#191A1B', 900: '#2E2E2E', 800: '#3D3D3D', 700: '#545454',
          600: '#6E6E6E', 500: '#8A8A8A', 400: '#A6A6A6', 300: '#C7C7C7',
          200: '#D9D9D9', 100: '#F0F0F0',
        },
        // Стан — зарезервовано. Не для оформлення.
        good: { 500: '#4A7C59', 300: '#86B694' },
        warn: { 500: '#9A7318', 300: '#E0BC6B' },
        crit: { 500: '#A33A3A', 300: '#E08585' },
      },
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // Радіус кнопок на robeauty.me — 5px. Картки трохи більші, не більше.
        DEFAULT: '5px', md: '5px', lg: '6px', xl: '8px', '2xl': '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(25 26 27 / 0.04), 0 4px 16px -6px rgb(25 26 27 / 0.08)',
        pop: '0 4px 12px -2px rgb(25 26 27 / 0.10), 0 16px 44px -10px rgb(25 26 27 / 0.20)',
      },
      letterSpacing: { display: '0.06em' },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { rise: 'rise .35s cubic-bezier(.22,1,.36,1) both' },
    },
  },
}
