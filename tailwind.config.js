/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        flood: {
          light: '#38bdf8',
          moderate: '#f59e0b',
          severe: '#ef4444',
          deep: '#7f1d1d'
        },
        traffic: {
          light: '#22c55e',
          moderate: '#eab308',
          heavy: '#ef4444'
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}
