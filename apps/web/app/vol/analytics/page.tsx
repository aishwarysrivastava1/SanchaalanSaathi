"use client";

import React, { useEffect, useState } from "react";
import { BarChart2, Sparkles, Trophy, CheckCircle, ClipboardList, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { api, RecommendedTask, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

const BADGES = [
  { label: "Starter",     desc: "1 task done",  threshold: 1,  emoji: "🌱" },
  { label: "Contributor", desc: "5 tasks done",  threshold: 5,  emoji: "⭐" },
  { label: "Champion",    desc: "15 tasks done", threshold: 15, emoji: "🏆" },
  { label: "Legend",      desc: "30 tasks done", threshold: 30, emoji: "🔥" },
];

type ProfileData = {
  completed_tasks: number;
  total_assigned: number;
  acceptance_rate: number;
  performance_score: number;
  skills: string[];
};

type TaskRecord = {
  task_id: string;
  title: string;
  assignment_status: string;
  deadline?: string;
};

const STATUS_COLOR: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accepted:  "bg-blue-50 text-blue-700 border-blue-200",
  rejected:  "bg-red-50 text-red-600 border-red-200",
  assigned:  "bg-teal-50 text-teal-700 border-teal-200",
};

export default function VolAnalyticsPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [tasks, setTasks]     = useState<TaskRecord[]>([]);
  const [recs, setRecs]       = useState<RecommendedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.volProfile(user.token),
      api.volTasks(user.token),
      api.getRecommendations(user.token).catch(() => []),
    ])
      .then(([p, t, r]) => {
        setProfile(p as ProfileData);
        setTasks((t as any[]).map((x) => ({
          task_id:           x.task_id,
          title:             x.title,
          assignment_status: x.assignment_status,
          deadline:          x.deadline,
        })));
        setRecs(r as RecommendedTask[]);
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

  const score     = profile?.performance_score ?? 0;
  const completed = profile?.completed_tasks ?? 0;
  const nextBadge = BADGES.find((b) => completed < b.threshold);
  const badgeProgress = nextBadge ? Math.min((completed / nextBadge.threshold) * 100, 100) : 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6 max-w-3xl"
    >
      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Performance Score", value: `${score.toFixed(0)}%`, icon: BarChart2,    color: "#48A15E" },
          { label: "Tasks Completed",   value: completed,              icon: CheckCircle,  color: "#60a5fa" },
          { label: "Total Assigned",    value: profile?.total_assigned ?? 0, icon: ClipboardList, color: "#fbbf24" },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(42,130,86,0.18)", borderColor: "#95C78F" }}
            className="rounded-2xl border border-gray-200 p-4 flex flex-col gap-2 cursor-default"
            style={{ background: "var(--card-bg)" }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}22` }}>
              <Icon size={14} style={{ color }} />
            </div>
            <p className="text-xl font-bold text-gray-800">{value}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
          </motion.div>
        ))}
      </div>

      {/* Score bar */}
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
        className="rounded-2xl border border-gray-200 p-5"
        style={{ background: "var(--card-bg)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">Overall Performance</p>
          <span className="text-sm font-bold" style={{ color: "#2A8256" }}>{score.toFixed(1)}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #2A8256 0%, #48A15E 100%)" }}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Acceptance rate: {((profile?.acceptance_rate ?? 0) * 100).toFixed(0)}%
        </p>
      </motion.div>

      {/* Badges */}
      <motion.div
        whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
        className="rounded-2xl border border-gray-200 p-5"
        style={{ background: "var(--card-bg)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={14} className="text-[#2A8256]" />
          <h2 className="text-sm font-semibold text-gray-700">Achievements</h2>
          {nextBadge && (
            <span className="ml-auto text-[10px] text-gray-400">
              {completed}/{nextBadge.threshold} → {nextBadge.label}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {BADGES.map((b) => {
            const unlocked = completed >= b.threshold;
            return (
              <motion.div
                key={b.label}
                whileHover={{ scale: unlocked ? 1.06 : 1 }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center ${
                  unlocked
                    ? "border-[#2A8256]/30 bg-gradient-to-b from-emerald-50 to-white"
                    : "border-gray-100 bg-gray-50 opacity-40 grayscale"
                }`}
              >
                <span className="text-xl">{b.emoji}</span>
                <p className="text-[10px] font-bold text-gray-700">{b.label}</p>
                <p className="text-[9px] text-gray-400">{b.desc}</p>
              </motion.div>
            );
          })}
        </div>
        {nextBadge && (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${badgeProgress}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #2A8256 0%, #48A15E 100%)" }}
            />
          </div>
        )}
      </motion.div>

      {/* AI Recommendations */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={13} className="text-[#48A15E]" />
          <h2 className="text-sm font-semibold text-white/80">AI Task Recommendations</h2>
        </div>
        {recs.length === 0 ? (
          <motion.div
            whileHover={{ y: -2, borderColor: "#95C78F" }}
            className="rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-400"
            style={{ background: "var(--card-bg)" }}
          >
            No open tasks match your skills yet. Update your profile skills to get recommendations.
          </motion.div>
        ) : (
          <div className="space-y-3">
            {recs.map((r, i) => (
              <motion.div
                key={r.task_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -3, boxShadow: "0 12px 28px rgba(42,130,86,0.15)", borderColor: "#95C78F" }}
                className="rounded-2xl border border-gray-200 p-4"
                style={{ background: "var(--card-bg)", borderLeft: "4px solid #48A15E" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{r.title}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        r.priority === "high"   ? "bg-red-50 text-red-600 border-red-200"
                        : r.priority === "medium" ? "bg-amber-50 text-amber-600 border-amber-200"
                        : "bg-gray-50 text-gray-400 border-gray-200"
                      }`}>
                        {r.priority}
                      </span>
                    </div>
                    {r.description && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{r.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {r.matched_skills.map((s) => (
                        <span key={s} className="text-[10px] text-[#2A8256] border border-[#2A8256]/20 rounded-full px-1.5 py-0.5" style={{ background: "rgba(42,130,86,0.08)" }}>{s}</span>
                      ))}
                      {r.required_skills.filter((s) => !r.matched_skills.includes(s)).map((s) => (
                        <span key={s} className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-1.5 py-0.5 bg-gray-50">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold" style={{ color: "#2A8256" }}>{Math.round(r.match_score * 100)}%</div>
                    <div className="text-[9px] text-gray-400">match</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Task history */}
      {tasks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white/80 mb-3">Task History</h2>
          <motion.div
            whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
            className="rounded-2xl border border-gray-200 overflow-hidden"
            style={{ background: "var(--card-bg)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Task</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr
                    key={t.task_id}
                    className={`border-b border-gray-50 hover:bg-[#2A8256]/5 transition-colors ${i === tasks.length - 1 ? "border-0" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800 text-xs">{t.title}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[t.assignment_status] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                        {t.assignment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {t.deadline ? new Date(t.deadline).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
