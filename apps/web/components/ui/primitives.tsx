"use client";

/**
 * Shared UI primitives.
 *
 * Pages previously hand-rolled every card, badge and empty state, so spacing,
 * radius and colour drifted between screens. These are the building blocks
 * every page should reach for.
 */
import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPATIAL } from "../../lib/motion";

type Div = React.HTMLAttributes<HTMLDivElement>;

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ── Surfaces ──────────────────────────────────────────────────────────────────

export function Card({ className, ...rest }: Div) {
  return (
    <div
      className={cx(
        "rounded-2xl border bg-white dark:bg-[#122622]",
        "border-gray-200 dark:border-white/10",
        "shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/10">
      <div className="min-w-0">
        <h3 className="truncate font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-white/50">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-white/55">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

// ── Status ────────────────────────────────────────────────────────────────────

const TONES = {
  neutral: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  danger: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200",
} as const;

export type Tone = keyof typeof TONES;

/** Status is never colour alone: the label always carries the meaning. */
export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export const TASK_TONES: Record<string, Tone> = {
  open: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "neutral",
  assigned: "info",
  accepted: "warning",
  rejected: "danger",
  pending: "warning",
  approved: "success",
};

export const PRIORITY_TONES: Record<string, Tone> = {
  low: "neutral",
  medium: "info",
  high: "danger",
};

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={TASK_TONES[value] ?? "neutral"}>{value.replace(/_/g, " ")}</Badge>;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

/**
 * A single number is a stat tile, not a chart. Charts are reserved for
 * comparison and change over time.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/50">
          {label}
        </p>
        {icon && <span className="text-gray-400 dark:text-white/40">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </p>
      {hint && (
        <div className="mt-2 text-xs text-gray-500 dark:text-white/45">
          {tone === "neutral" ? hint : <Badge tone={tone}>{hint}</Badge>}
        </div>
      )}
    </Card>
  );
}

// ── States ────────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("animate-pulse rounded-lg bg-gray-200 dark:bg-white/10", className)}
    />
  );
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card className="space-y-3 p-5">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className="h-3 w-full" />
      ))}
    </Card>
  );
}

/** An empty state always says what to do next, never just "no data". */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-gray-300 dark:text-white/25">{icon}</div>}
      <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="font-medium text-red-700 dark:text-red-300">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-gray-600 dark:text-white/55">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dim"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

const BUTTON_VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-dim disabled:bg-primary/50",
  secondary:
    "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15",
  ghost: "text-gray-600 hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/10",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
} as const;

export function Button({
  variant = "primary",
  className,
  loading,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  loading?: boolean;
}) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2",
        "text-sm font-medium transition-colors disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

/** Segmented control, used to switch a chart between its plot and table view. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/10"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-white text-gray-900 shadow-sm dark:bg-[#0B3D36] dark:text-white"
              : "text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align and use tabular figures. */
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
}

/** Replaces the hand-written table markup that was repeated on every page. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-white/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cx("px-5 py-3 font-medium", col.numeric && "text-right")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-b border-gray-50 transition-colors last:border-0 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx("px-5 py-3", col.numeric && "text-right tabular-nums")}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -- Modal --------------------------------------------------------------------

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Ten modals were hand-rolled across six pages with no dialog semantics at all:
 * no role, no Escape, and no focus trap -- so a keyboard user tabbed straight
 * out of an open modal into the page behind it. That behaviour lives here now.
 *
 * `title` is always the accessible name, even when `chrome` is false and the
 * caller draws its own header, so a dialog can never end up unnamed.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  chrome = true,
  children,
  maxWidth = "max-w-md",
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  chrome?: boolean;
  children: React.ReactNode;
  maxWidth?: string;
  panelClassName?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const restoreTo = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;

      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreTo?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={SPATIAL}
            className={cx(
              "max-h-[90vh] w-full overflow-y-auto rounded-2xl shadow-2xl",
              "bg-white dark:bg-[#0d3028]",
              maxWidth,
              panelClassName,
            )}
          >
            {chrome && (
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4 dark:border-white/10 dark:bg-[#0d3028]">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                    {icon}
                    {title}
                  </p>
                  {subtitle && (
                    <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-white/40">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
