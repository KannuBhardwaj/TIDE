/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aurora Tide tokens — keep in sync with src/render/palette.ts
        abyss: '#04141A',
        deep: '#072028',
        teal: '#4FE3C1',
        rose: '#FF8FB0',
        gold: '#FFC24B', // Team A
        crimson: '#FF3B5C', // Team B
        pearl: '#EAF6F2',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        label: '0.28em',
      },
    },
  },
  plugins: [],
};
