import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        neon: {
          cyan: "#00f3ff",
          purple: "#d900ff",
          orange: "#ff4d00",
          green: "#00ff66",
          red: "#ff003c"
        },
        hud: {
          bg: "rgba(2, 6, 23, 0.7)",
          border: "rgba(0, 243, 255, 0.2)",
          panel: "rgba(15, 23, 42, 0.6)"
        }
      },
      animation: {
        'glow-pulse': 'glow-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'typing':     'typing 2s steps(40, end)',
        'scanline':   'scanline 8s linear infinite',
        'slice-in':   'slice-in 0.3s ease-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 10px rgba(0, 243, 255, 0.2)' },
          '50%':      { opacity: '.7', boxShadow: '0 0 20px rgba(0, 243, 255, 0.5)' },
        },
        'typing': {
          'from': { width: '0' },
          'to':   { width: '100%' },
        },
        'scanline': {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'slice-in': {
          '0%':   { opacity: '0', transform: 'translateY(-8px) scaleY(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0)   scaleY(1)' },
        },
      }
    },
  },
  plugins: [],
};
export default config;
