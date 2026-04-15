import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
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
        // Brand palette — Sanchaalan Saathi
        brand: {
          50:  "#F5F6F1",  // cream background
          100: "#E8F5E9",
          200: "#C8E6C9",
          300: "#95C78F",  // pale mint
          400: "#48A15E",  // vibrant leaf green
          500: "#2A8256",  // medium forest green
          600: "#115E54",  // deep teal — PRIMARY
          700: "#0d4a42",
          800: "#0a3832",
          900: "#072921",
        },
        // Neon aliases → remapped to brand-aware semantic colors
        neon: {
          cyan:   "#115E54",  // → brand primary teal
          green:  "#48A15E",  // → brand accent leaf green
          purple: "#2A8256",  // → brand secondary forest green
          orange: "#d97706",  // → amber (urgency/warnings — kept semantic)
          red:    "#dc2626",  // → standard red (errors/critical — kept)
        },
        hud: {
          bg:     "#FFFFFF",
          border: "#E5E7EB",
          panel:  "#FFFFFF",
        },
      },
      animation: {
        "glow-pulse": "glow-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slice-in":   "slice-in 0.3s ease-out",
        "fade-in":    "fade-in 0.4s ease-out",
        "swing":      "swing 2s ease-in-out infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { opacity: "0.7" },
          "50%":      { opacity: "1" },
        },
        "slice-in": {
          "0%":   { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "swing": {
          "0%":   { transform: "rotate(0deg)" },
          "20%":  { transform: "rotate(12deg)" },
          "40%":  { transform: "rotate(-8deg)" },
          "60%":  { transform: "rotate(5deg)" },
          "80%":  { transform: "rotate(-3deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
