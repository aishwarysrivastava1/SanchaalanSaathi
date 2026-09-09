"use client";

/**
 * Mobile bottom navigation.
 *
 * Both portals previously rendered every nav item in one `justify-around` row.
 * The NGO portal has nine, with labels like "Deployment Map" -- roughly 41px of
 * width each on a 375px screen, so the bar overflowed horizontally. Four fixed
 * slots plus a "More" sheet keeps every target tappable at the narrowest
 * supported width and holds the bar to the <=5 items the pattern expects.
 */
import React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { SPATIAL, SPATIAL_PANEL } from "../../lib/motion";
import { MoreHorizontal, X } from "lucide-react";

export interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  sub?: string;
}

const PRIMARY_SLOTS = 4;

function isCurrent(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(href + "/"));
}

export function BottomNav({
  items,
  pathname,
  accentId,
}: {
  items: NavItem[];
  pathname: string | null;
  /** Distinct per portal so the two shells never share a layout animation. */
  accentId: string;
}) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const primary = items.slice(0, PRIMARY_SLOTS);
  const overflow = items.slice(PRIMARY_SLOTS);
  const overflowActive = overflow.some((item) => isCurrent(pathname, item.href));

  React.useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  // Route changes close the sheet, otherwise it covers the page you just opened.
  React.useEffect(() => setSheetOpen(false), [pathname]);

  return (
    <>
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPATIAL_PANEL}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-gray-200 bg-white pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-[#122622] md:hidden"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-white/40">
                More
              </span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="px-2 pb-2">
              {overflow.map(({ href, icon: Icon, label, sub }) => {
                const active = isCurrent(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[52px] items-center gap-3 rounded-xl px-3 transition-colors ${
                        active
                          ? "bg-primary/10 text-primary dark:bg-white/10 dark:text-subtle"
                          : "text-gray-600 hover:bg-gray-50 dark:text-white/70 dark:hover:bg-white/5"
                      }`}
                    >
                      <Icon size={18} strokeWidth={active ? 2.4 : 1.8} className="shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{label}</span>
                        {sub && (
                          <span className="block truncate text-[11px] text-gray-400 dark:text-white/40">
                            {sub}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_16px_rgba(0,0,0,0.07)] backdrop-blur-md dark:border-white/10 dark:bg-[#122622]/95 md:hidden"
      >
        {primary.map(({ href, icon: Icon, label }) => {
          const active = isCurrent(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors active:scale-95 ${
                active ? "text-primary dark:text-subtle" : "text-gray-400 dark:text-white/45"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={accentId}
                  transition={SPATIAL}
                  className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary dark:bg-subtle"
                />
              )}
              <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
              <span
                className={`w-full truncate text-center text-[10px] leading-tight ${
                  active ? "font-bold" : "font-medium"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setSheetOpen((open) => !open)}
            aria-expanded={sheetOpen}
            aria-label="More sections"
            className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors active:scale-95 ${
              overflowActive || sheetOpen
                ? "text-primary dark:text-subtle"
                : "text-gray-400 dark:text-white/45"
            }`}
          >
            {overflowActive && !sheetOpen && (
              <motion.span
                layoutId={accentId}
                transition={SPATIAL}
                className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary dark:bg-subtle"
              />
            )}
            <MoreHorizontal size={19} strokeWidth={overflowActive ? 2.4 : 1.8} />
            <span
              className={`text-[10px] leading-tight ${
                overflowActive ? "font-bold" : "font-medium"
              }`}
            >
              More
            </span>
          </button>
        )}
      </nav>
    </>
  );
}
