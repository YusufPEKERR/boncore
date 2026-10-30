/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edf7ed',
          100: '#d7ebd8',
          200: '#b2d7b4',
          300: '#87bf8b',
          400: '#5da762',
          500: '#338d35',
          DEFAULT: '#338d35',
          600: '#338d35',
          700: '#28702a',
          800: '#1e5420',
          900: '#143815',
          950: '#0a1d0b',
          hover: '#28702a',
          light: '#edf7ed',
          dark: '#0a1d0b',
        },
        pos: {
          bg: '#0f172a',
          card: '#1e293b',
          border: '#334155',
          accent: '#3b82f6',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          tableEmpty: '#10b981',
          tableOccupied: '#338d35',
          tableBill: '#3b82f6',
          tableReserved: '#eab308',
          tableCall: '#a855f7',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-subtle': 'bounce 2s infinite',
      }
    },
  },
  plugins: [],
}
