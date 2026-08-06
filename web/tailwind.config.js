export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Палітра стенда: нюдово-рожева гама під бренд RoBeauty.
        // Фірмовий стиль не копіюємо — беремо лише напрям кольору.
        cream: { 50: '#FDFBFA', 100: '#F9F4F1', 200: '#F1E8E3', 300: '#E5D6CE' },
        rose: { 300: '#E3B9AC', 400: '#D49C8B', 500: '#BE7F6C', 600: '#A06455', 700: '#7E4E42' },
        ink: {
          950: '#0F0C0B', 900: '#171312', 800: '#231D1B', 700: '#372E2A',
          600: '#574A45', 500: '#7A6A63', 400: '#A0908A', 300: '#C7B8B2',
          200: '#DFD3CD', 100: '#EFE7E3',
        },
        mint: { 100: '#E7F0EA', 400: '#7FA890', 600: '#4C7761' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(23 18 16 / 0.04), 0 4px 16px -4px rgb(23 18 16 / 0.06)',
        pop: '0 4px 12px -2px rgb(23 18 16 / 0.12), 0 12px 40px -8px rgb(23 18 16 / 0.18)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { rise: 'rise .35s cubic-bezier(.22,1,.36,1) both' },
    },
  },
}
