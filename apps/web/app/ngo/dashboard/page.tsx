"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, ClipboardList, CheckCircle, Package, Clock, AlertCircle, Loader2, AlertTriangle, Zap, ClipboardCopy, Check, Star } from "lucide-react";
import { motion } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";
import { isGuestMode } from "../../../lib/guest-mode";
import { GUEST_NGO_DASHBOARD, GUEST_NGO_ALERTS } from "../../../lib/guest-mock-data";

type DashData = {
  total_volunteers: number;
  active_tasks: number;
  completed_tasks: number;
  resource_count: number;
  pending_assignments: number;
  recent_tasks?: { id: string; title: string; status: string; deadline?: string; priority?: string }[];
  invite_code?: string;
};

type Alert = {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
};

const STATUS_COLORS: Record<string, string> = {
  open:        "bg-teal-50 text-teal-700 border-teal-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed:   "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-50 text-red-600 border-red-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  low:    "bg-gray-50 text-gray-500 border-gray-200",
};

const STAT_ICONS = [Users, ClipboardList, CheckCircle, Package];

export default function NGODashboardPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const router   = useRouter();
  const [data, setData]         = useState<DashData | null>(null);
  const [alerts, setAlerts]     = useState<Alert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/"); return; }
    if (!user.ngo_id) router.replace("/ngo/setup");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    if (isGuestMode()) {
      setData(GUEST_NGO_DASHBOARD as DashData);
      setAlerts(GUEST_NGO_ALERTS);
      setLoading(false);
      return;
    }
    Promise.all([
      api.ngoDashboard(user.token),
      api.ngoAlerts(user.token).catch(() => ({ alerts: [] })),
    ])
      .then(([d, a]) => {
        setData(d as DashData);
        setAlerts((a as any).alerts ?? []);
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-[#48A15E]" />
    </div>
  );
  if (!user) return null;

  if (error) return (
    <div className="p-6">
      <div className="rounded-xl p-4 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <AlertCircle size={16} />
        {error}
      </div>
    </div>
  );

  const stats = [
    { label: "Volunteers",    value: data?.total_volunteers ?? 0  },
    { label: "Active Tasks",  value: data?.active_tasks ?? 0      },
    { label: "Completed",     value: data?.completed_tasks ?? 0   },
    { label: "Resources",     value: data?.resource_count ?? 0    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6"
    >
      {/* Guest mode banner */}
      {isGuestMode() && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2 border border-amber-200 text-xs font-medium text-amber-700" style={{ background: "rgba(251,191,36,0.08)" }}>
          <Star size={12} className="shrink-0" />
          Demo Mode — Showing simulated data. No changes are saved to the database.
        </div>
      )}

      {/* Invite code banner */}
      {data?.invite_code && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl px-4 py-3 flex items-center justify-between border"
          style={{ background: "rgba(17,94,84,0.08)", borderColor: "rgba(17,94,84,0.2)" }}
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: "#115E54" }}>Your NGO Invite Code</p>
            <p className="text-xs mt-0.5 text-gray-500">Share with volunteers to join your organization</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-widest select-all rounded-lg px-3 py-1.5 border"
              style={{ background: "rgba(17,94,84,0.1)", borderColor: "rgba(17,94,84,0.25)", color: "var(--text-primary)" }}>
              {data.invite_code}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(data.invite_code!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-all"
              style={copied
                ? { background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.4)", color: "#059669" }
                : { background: "rgba(17,94,84,0.1)", border: "1px solid rgba(17,94,84,0.2)", color: "#115E54" }}
            >
              {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Alert banners */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                a.severity === "high"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              {a.type === "shortage" ? <Zap size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
              <span>{a.message}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ label, value }, i) => {
          const Icon = STAT_ICONS[i];
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(42,130,86,0.2)", borderColor: "#95C78F" }}
              className="rounded-2xl border border-gray-200 p-4 flex flex-col gap-2 cursor-default"
              style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}
            >
              <div className="relative w-10 h-10">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                  style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
                >
                  <Icon size={16} className="text-white" />
                </div>
                <div className="absolute inset-0 rounded-xl animate-spin opacity-20 border-2 border-dashed border-[#48A15E]" style={{ animationDuration: "8s" }} />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Pending assignments badge */}
      {(data?.pending_assignments ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
          style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <Clock size={15} className="shrink-0 text-amber-400" />
          <span className="text-amber-200">
            <strong className="text-amber-300">{data!.pending_assignments}</strong> assignment(s) awaiting volunteer response
          </span>
        </motion.div>
      )}

      {/* Recent tasks */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Tasks</h2>
        {(!data?.recent_tasks || data.recent_tasks.length === 0) ? (
          <motion.div
            whileHover={{ y: -2, borderColor: "#95C78F" }}
            className="rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-400"
            style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}
          >
            No tasks yet.{" "}
            <a href="/ngo/tasks" className="text-[#2A8256] font-semibold hover:underline">Create one →</a>
          </motion.div>
        ) : (
          <motion.div
            whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
            className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Task</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_tasks.map((task, i) => (
                  <motion.tr
                    key={task.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                    className={`border-b border-gray-100/60 hover:bg-[#2A8256]/5 transition-colors ${i === data.recent_tasks!.length - 1 ? "border-0" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{task.title}</td>
                    <td className="px-4 py-3">
                      {task.priority && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>
                          {task.priority}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {task.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {task.deadline ? new Date(task.deadline).toLocaleDateString() : "—"}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
