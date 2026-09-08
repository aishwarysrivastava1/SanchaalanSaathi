/**
 * Chart colour tokens.
 *
 * Every value below was checked with the palette validator against this app's
 * own surfaces (#FFFFFF light, #122622 dark), not a generic one. Dark is a
 * separate set of steps chosen for the dark surface, never an automatic flip
 * of the light values.
 *
 * Do not add a hue here without re-running the validator: the categorical
 * pair is safe for colour-vision deficiency, and a third arbitrary hue is not
 * guaranteed to be.
 */

export interface ChartTheme {
  /** Categorical identity. Assigned in fixed order, never cycled. */
  series: [string, string];
  /** Ordinal severity, least to most severe. */
  urgency: [string, string, string, string];
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  text: string;
  surface: string;
}

// Validated: worst all-pairs CVD ΔE 24.7, normal-vision ΔE 33.6, all ≥3:1.
const LIGHT: ChartTheme = {
  series: ["#2a78d6", "#eb6834"],
  // Ordinal blue ramp, monotone light→dark, light end 2.11:1 on white.
  urgency: ["#86b6ef", "#5598e7", "#256abf", "#104281"],
  grid: "#e5e7eb",
  axis: "#6b7280",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e5e7eb",
  text: "#111827",
  surface: "#ffffff",
};

// Validated: worst all-pairs CVD ΔE 26.8, normal-vision ΔE 31.8, all ≥3:1.
const DARK: ChartTheme = {
  series: ["#3987e5", "#d95926"],
  // Stepped lighter than the reference ramp: #184f95 only reaches 1.95:1 on
  // this surface, below the 2:1 floor. Most severe is the most prominent.
  urgency: ["#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
  grid: "rgba(255,255,255,0.08)",
  axis: "rgba(255,255,255,0.55)",
  tooltipBg: "#0B3D36",
  tooltipBorder: "rgba(255,255,255,0.15)",
  text: "#f1f5f9",
  surface: "#122622",
};

export function chartTheme(isDark: boolean): ChartTheme {
  return isDark ? DARK : LIGHT;
}

export const URGENCY_LEVELS = ["low", "medium", "high", "critical"] as const;
