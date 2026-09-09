"use client";

import React from "react";
import { motion } from "motion/react";
import { X, User, Zap, Package } from "lucide-react";
import { useTheme } from "../../ui/ThemeProvider";
import { SelectionType } from "../hooks/useMapController";
import { VolunteerPin, OperationPin, ResourcePin } from "../data/types";

interface Props {
  entity: SelectionType;
  onClose: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700",
  busy:      "bg-amber-100 text-amber-700",
  critical:  "bg-red-100 text-red-700",
  active:    "bg-teal-100 text-teal-700",
  completed: "bg-slate-100 text-slate-500",
  medical:   "bg-red-50 text-red-600",
  food:      "bg-amber-50 text-amber-700",
  equipment: "bg-blue-50 text-blue-700",
};

const STATUS_BADGE_DARK: Record<string, { bg: string; color: string }> = {
  available: { bg: "rgba(42,130,86,0.18)", color: "#95C78F" },
  busy: { bg: "rgba(217,119,6,0.18)", color: "#F59E0B" },
  critical: { bg: "rgba(239,68,68,0.18)", color: "#F87171" },
  active: { bg: "rgba(72,161,94,0.18)", color: "#48A15E" },
  completed: { bg: "rgba(148,163,184,0.16)", color: "#CBD5E1" },
  medical: { bg: "rgba(239,68,68,0.18)", color: "#F87171" },
  food: { bg: "rgba(245,158,11,0.18)", color: "#F59E0B" },
  equipment: { bg: "rgba(59,130,246,0.18)", color: "#60A5FA" },
};

function VolunteerPanel({ data, isDark }: { data: VolunteerPin; isDark: boolean }) {
  const badge = isDark ? STATUS_BADGE_DARK[data.status] : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: data.status === "available" ? "linear-gradient(135deg,var(--brand-500),var(--brand-400))" : "linear-gradient(135deg,#d97706,#fbbf24)" }}
        >
          {data.initials}
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: isDark ? "var(--brand-50)" : "#1f2937" }}>{data.name}</p>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={isDark ? { background: badge?.bg, color: badge?.color } : undefined}
          >
            {data.status}
          </span>
        </div>
      </div>
      {data.skills.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: isDark ? "#A4B4B1" : "#9ca3af" }}>Skills</p>
          <div className="flex flex-wrap gap-1">
            {data.skills.map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full border"
                style={{
                  background: isDark ? "rgba(42,130,86,0.12)" : "rgba(42,130,86,0.08)",
                  borderColor: isDark ? "rgba(72,161,94,0.35)" : "rgba(42,130,86,0.2)",
                  color: isDark ? "#95C78F" : "#2A8256",
                }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.email && (
        <p className="text-[10px]" style={{ color: isDark ? "#A4B4B1" : "#9ca3af" }}>{data.email}</p>
      )}
      {data.performanceScore !== undefined && (
        <div
          className="rounded-xl px-3 py-2.5 border space-y-1.5"
          style={{
            background: isDark ? "#1A352F" : "#F9FAFB",
            borderColor: isDark ? "#23473E" : "#E5E7EB",
          }}
        >
          <div className="flex justify-between text-[10px]" style={{ color: isDark ? "#A4B4B1" : "#9ca3af" }}>
            <span>Performance</span>
            <span className="font-bold" style={{ color: "var(--brand-500)" }}>{data.performanceScore.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? "rgba(42,130,86,0.2)" : "#E5E7EB" }}>
            <div className="h-full rounded-full" style={{ width: `${data.performanceScore}%`, background: "linear-gradient(90deg,var(--brand-500),var(--brand-400))" }} />
          </div>
          <p className="text-[10px]" style={{ color: isDark ? "#A4B4B1" : "#9ca3af" }}>{data.completedTasks ?? 0} tasks completed</p>
        </div>
      )}
      {data.assignedTo && (
        <p className="text-[10px] flex items-center gap-1" style={{ color: isDark ? "#F59E0B" : "#D97706" }}>
          <Zap size={10} /> Currently deployed to an operation
        </p>
      )}
      <button
        className="w-full text-white text-xs font-bold py-2.5 rounded-xl transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg,var(--brand-500),var(--brand-400))" }}
      >
        Assign to Operation
      </button>
    </div>
  );
}

function OperationPanel({ data, isDark }: { data: OperationPin; isDark: boolean }) {
  const pct = data.needed > 0 ? Math.min((data.assigned / data.needed) * 100, 100) : 100;
  const badge = isDark ? STATUS_BADGE_DARK[data.status] : null;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold leading-tight" style={{ color: isDark ? "var(--brand-50)" : "#1f2937" }}>{data.title}</p>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block"
          style={isDark ? { background: badge?.bg, color: badge?.color } : undefined}
        >
          {data.status}
        </span>
      </div>
      {data.description && (
        <p className="text-xs leading-relaxed" style={{ color: isDark ? "#A4B4B1" : "#6b7280" }}>{data.description}</p>
      )}
      <div>
        <div className="flex justify-between text-[10px] mb-1.5" style={{ color: isDark ? "#A4B4B1" : "#9ca3af" }}>
          <span>Volunteers assigned</span>
          <span className="font-semibold" style={{ color: isDark ? "var(--brand-50)" : "#374151" }}>{data.assigned}/{data.needed}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: isDark ? "rgba(42,130,86,0.2)" : "#E5E7EB" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: data.status === "critical"
                ? "#ef4444"
                : "linear-gradient(90deg,#2A8256,#48A15E)",
            }}
          />
        </div>
      </div>
      <button
        className="w-full text-white text-xs font-bold py-2.5 rounded-xl transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg,var(--brand-500),var(--brand-400))" }}
      >
        Deploy Resources
      </button>
    </div>
  );
}

function ResourcePanel({ data, isDark }: { data: ResourcePin; isDark: boolean }) {
  const icons: Record<string, string> = { medical: "💊", food: "🍱", equipment: "🔧" };
  const badge = isDark ? STATUS_BADGE_DARK[data.type] : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 border"
          style={{ background: isDark ? "rgba(42,130,86,0.12)" : "rgba(42,130,86,0.08)", borderColor: isDark ? "rgba(72,161,94,0.35)" : "rgba(42,130,86,0.2)" }}
        >
          {icons[data.type] ?? "📦"}
        </div>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: isDark ? "var(--brand-50)" : "#1f2937" }}>{data.title}</p>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 inline-block" style={isDark ? { background: badge?.bg, color: badge?.color } : undefined}>
            {data.type}
          </span>
        </div>
      </div>
      <div className="rounded-xl px-4 py-3 flex items-center justify-between border" style={{ background: isDark ? "#1A352F" : "#F9FAFB", borderColor: isDark ? "#23473E" : "#E5E7EB" }}>
        <p className="text-xs" style={{ color: isDark ? "#A4B4B1" : "#6b7280" }}>Stock available</p>
        <p className="text-lg font-bold" style={{ color: data.stock > 100 ? "var(--brand-500)" : "#d97706" }}>
          {data.stock}
        </p>
      </div>
      <button
        className="w-full text-white text-xs font-bold py-2.5 rounded-xl transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg,var(--brand-500),var(--brand-400))" }}
      >
        Allocate Resource
      </button>
    </div>
  );
}

export default function EntityDetailPanel({ entity, onClose }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  if (!entity) return null;

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className="absolute right-4 top-16 w-72 rounded-2xl p-5 z-20"
      style={{
        background: isDark ? "#122622" : "#F5F6F1",
        boxShadow:  isDark ? "0 24px 60px rgba(0,0,0,0.4)" : "0 24px 60px rgba(0,0,0,0.22)",
        border:     isDark ? "1px solid #23473E" : "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-3.5 right-3.5 transition-colors"
        style={{ color: isDark ? "#A4B4B1" : "#9ca3af" }}
      >
        <X size={15} />
      </button>

      <div className="mb-4 flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold" style={{ color: isDark ? "#A4B4B1" : "#9ca3af" }}>
        {entity.type === "volunteer" && <><User size={10} /> Volunteer</>}
        {entity.type === "operation" && <><Zap size={10} className="text-red-500" /> Operation</>}
        {entity.type === "resource"  && <><Package size={10} className="text-secondary" /> Resource</>}
      </div>

      {entity.type === "volunteer" && <VolunteerPanel data={entity.data as VolunteerPin} isDark={isDark} />}
      {entity.type === "operation" && <OperationPanel data={entity.data as OperationPin} isDark={isDark} />}
      {entity.type === "resource"  && <ResourcePanel  data={entity.data as ResourcePin}  isDark={isDark} />}
    </motion.div>
  );
}
