/**
 * Motion scale.
 *
 * The app had eight different durations, five hover scales (1.01, 1.02, 1.06,
 * 1.08, 1.12) and four spring configs picked per call site, so nothing moved
 * the same way twice. Three tiers cover every case here:
 *
 *   FEEDBACK  the element answers a pointer      fast, small, no spring
 *   ENTER     content arrives                    one short ease-out
 *   SPATIAL   something moves or changes place   spring, shared-element work
 *
 * Framer resolves these against `MotionConfig reducedMotion="user"` in
 * ThemeProvider, so a reduced-motion visitor gets the end state without the
 * travel. Nothing here needs its own media query.
 */

/** Springs read as physical; a duration reads as mechanical. Use for movement. */
export const SPATIAL = { type: "spring", stiffness: 380, damping: 30 } as const;

/** Panels and sheets: slightly stiffer so a large surface still feels light. */
export const SPATIAL_PANEL = { type: "spring", stiffness: 420, damping: 36 } as const;

/** Content arriving. Ease-out only: fast start, settled finish. */
export const ENTER = { duration: 0.3, ease: [0.16, 1, 0.3, 1] } as const;

/** One hover scale for the whole app. Bigger reads as a toy, smaller as noise. */
export const HOVER_LIFT = { scale: 1.02 } as const;
export const TAP_PRESS = { scale: 0.97 } as const;

/** Icon-only controls are small, so they need a larger ratio to register. */
export const HOVER_LIFT_ICON = { scale: 1.08 } as const;
export const TAP_PRESS_ICON = { scale: 0.93 } as const;

/** Content entering. Absorbed 33 hand-written enters that used y of 10/12/16/20/24. */
export const riseIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: ENTER },
};

/**
 * Cards lift toward the pointer. Card hovers previously used y of -2, -3 and
 * -4 with three different shadows; one distance and one shadow reads as a
 * single surface behaviour instead of four.
 *
 * The border colour stays a literal here rather than var(--brand-300): Framer
 * interpolates between colour values, and this is the one place it is written.
 */
export const CARD_LIFT = {
  y: -3,
  boxShadow: "0 14px 34px rgba(42, 130, 86, 0.14)",
  borderColor: "#95C78F",
} as const;
