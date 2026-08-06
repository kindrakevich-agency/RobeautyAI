export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: { 50: '#FAF7F4', 100: '#F2EBE4', 200: '#E4D8CC' },
        clay: { 400: '#B08D74', 500: '#9A7458', 600: '#7E5C43', 700: '#63472F' },
        ink: { 400: '#8A8178', 600: '#4A443E', 800: '#2A2622', 900: '#1A1714' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
}
