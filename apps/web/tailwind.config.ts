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
      // The type scale lives here, not in globals.css.
      //
      // These sizes used to be imposed by a block of `!important` rules that
      // redefined Tailwind's own utilities (`.text-xs { font-size: .875rem
      // !important }` and so on). That made every size unpredictable and
      // impossible to override locally -- `text-xs` silently rendered at
      // `text-sm`, and no component could opt out. Declaring the scale as a
      // design token renders identically with no specificity war, and
      // arbitrary values like `text-[13px]` work again.
      fontSize: {
        xs: ["0.875rem", { lineHeight: "1.25rem" }],
        sm: ["1rem", { lineHeight: "1.5rem" }],
        base: ["1.125rem", { lineHeight: "1.75rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        xl: ["1.5rem", { lineHeight: "2rem" }],
        "2xl": ["1.75rem", { lineHeight: "2.25rem" }],
        "3xl": ["2.125rem", { lineHeight: "2.5rem" }],
      },
      colors: {
        // Layer 1 - primitive scale. Mirrors the --brand-* vars in globals.css.
        brand: {
          50:  "#F5F6F1",
          100: "#E8F5E9",
          200: "#C8E6C9",
          300: "#95C78F",
          400: "#48A15E",
          500: "#2A8256",
          600: "#115E54",
          700: "#0d4a42",
          800: "#0a3832",
          900: "#072921",
        },
        // Layer 2 - semantic aliases. Components use THESE, not the numbers
        // and never a raw hex. Literal values rather than var() so Tailwind's
        // opacity modifiers (bg-primary/50) keep working.
        primary:       "#115E54",
        "primary-dim": "#0d4a42",  // hover / pressed
        secondary:     "#2A8256",
        accent:        "#48A15E",
        subtle:        "#95C78F",
        canvas:        "#F5F6F1",
        deep:          "#072921",
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
