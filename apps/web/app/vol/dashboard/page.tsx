"use client";

import React, { useEffect, useState } from "react";
import { ClipboardList, CheckCircle, Clock, AlertCircle, Loader2, CheckCheck, XCircle, Sparkles, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, RecommendedTask } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type Assignment = {
  id: string;
  task_title: string;
  task_description: string;
  required_skills: string[];
  status: "assigned" | "accepted" | "rejected" | "completed";
  deadline?: string;
  assigned_at: string;
};

type DashData = {
  assigned_tasks: number;
  completed_tasks: number;
  upcoming_deadlines: { title: string; deadline: string }[];
  assignments: Assignment[];
};

const STATUS_META: Record<string, { color: string; label: string; borderColor: string }> = {
  assigned:  { color: "bg-teal-50 text-teal-700 border-teal-200",         label: "Pending",  borderColor: "#2dd4bf"  },
  accepted:  { color: "bg-blue-50 text-blue-700 border-blue-200",         label: "Accepted", borderColor: "#60a5fa"  },
  rejected:  { color: "bg-red-50 text-red-600 border-red-200",            label: "Rejected", borderColor: "#f87171"  },
  completed: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Done",    borderColor: "#34d399"  },
};

const STAT_ICONS = [ClipboardList, CheckCircle, Clock];
const STAT_LABELS = ["Assigned Tasks", "Completed", "Upcoming Deadlines"];

export default function VolDashboardPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [data, setData]         = useState<DashData | null>(null);
  const [recs, setRecs]         = useState<RecommendedTask[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [acting, setActing]     = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    Promise.all([
      api.volDashboard(user.token),
      api.getRecommendations(user.token).catch(() => []),
    ])
      .then(([d, r]) => { setData(d as DashData); setRecs(r as RecommendedTask[]); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const respond = async (id: string, action: "accept" | "reject") => {
    if (!user) return;
    setActing(id);
    try {
      if (action === "accept") await api.acceptAssignment(user.token, id);
      else                     await api.rejectAssignment(user.token, id);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setActing(null); }
  };

  const complete = async (id: string) => {
    if (!user) return;
    setCompleting(id);
    try {
      await api.completeAssignment(user.token, id);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setCompleting(null); }
  };

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-[#48A15E]" />
    </div>
  );
  if (!user) return null;

  const statValues = [
    data?.assigned_tasks ?? 0,
    data?.completed_tasks ?? 0,
    data?.upcoming_deadlines?.length ?? 0,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6"
    >
      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {STAT_LABELS.map((label, i) => {
          const Icon = STAT_ICONS[i];
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(42,130,86,0.18)", borderColor: "#95C78F" }}
              className="rounded-2xl border border-gray-200 p-4 flex flex-col gap-2 cursor-default"
              style={{ background: "linear-gradient(135deg, #F5F6F1 0%, #ffffff 100%)" }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
              >
                <Icon size={14} className="text-white" />
              </div>
              <p className="text-xl font-bold text-gray-800">{statValues[i]}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* AI Recommendations */}
      {recs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={13} className="text-[#48A15E]" />
            <h2 className="text-sm font-semibold text-white/80">Recommended for You</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recs.slice(0, 3).map((r, i) => (
              <motion.div
                key={r.task_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -3, boxShadow: "0 12px 28px rgba(42,130,86,0.18)", borderColor: "#95C78F" }}
                className="rounded-2xl border border-gray-200 p-4 flex flex-col gap-2"
                style={{ background: "linear-gradient(135deg, #F5F6F1 0%, #ffffff 100%)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-800 line-clamp-2 flex-1">{r.title}</p>
                  <span className="text-[10px] font-bold text-[#2A8256] shrink-0">{Math.round(r.match_score * 100)}%</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.matched_skills.map((s) => (
                    <span key={s} className="text-[10px] text-[#2A8256] border border-[#2A8256]/20 rounded-full px-1.5 py-0.5" style={{ background: "rgba(42,130,86,0.08)" }}>{s}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${r.priority === "high" ? "bg-red-50 text-red-600 border-red-200" : r.priority === "medium" ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
                    {r.priority}
                  </span>
                  {r.deadline && <p className="text-[10px] text-gray-400">Due {new Date(r.deadline).toLocaleDateString()}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming deadlines */}
      {(data?.upcoming_deadlines ?? []).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 p-4"
          style={{ background: "rgba(251,191,36,0.06)" }}
        >
          <p className="text-xs font-semibold text-amber-800 mb-2">Upcoming Deadlines</p>
          <div className="space-y-1.5">
            {data!.upcoming_deadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-xs text-amber-700 truncate">{d.title}</p>
                <p className="text-xs text-amber-600 font-mono shrink-0 ml-3">{new Date(d.deadline).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Assignments */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">My Assignments</h2>
        {(!data?.assignments || data.assignments.length === 0) ? (
          <motion.div
            whileHover={{ y: -2, borderColor: "#95C78F" }}
            className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400"
            style={{ background: "linear-gradient(135deg, #F5F6F1 0%, #ffffff 100%)" }}
          >
            No assignments yet. Your NGO coordinator will assign tasks to you.
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {data.assignments.map((a, i) => {
                const meta = STATUS_META[a.status] ?? STATUS_META.assigned;
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -3, boxShadow: "0 16px 36px rgba(42,130,86,0.15)", borderColor: "#95C78F" }}
                    className="rounded-2xl border border-gray-200 overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #F5F6F1 0%, #ffffff 100%)",
                      borderLeft: `4px solid ${meta.borderColor}`,
                    }}
                  >
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-800 text-sm">{a.task_title}</h3>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                              {meta.label}
                            </span>
                          </div>
                          {a.task_description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.task_description}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(a.required_skills ?? []).map((s) => (
                              <span key={s} className="text-[10px] text-[#2A8256] border border-[#2A8256]/20 rounded-full px-2 py-0.5" style={{ background: "rgba(42,130,86,0.08)" }}>{s}</span>
                            ))}
                          </div>
                          {a.deadline && (
                            <p className="text-[11px] text-gray-400 mt-1.5">Due: {new Date(a.deadline).toLocaleDateString()}</p>
                          )}
                        </div>

                        {a.status === "assigned" && (
                          <div className="flex gap-2 shrink-0">
                            <motion.button
                              onClick={() => respond(a.id, "accept")}
                              disabled={acting === a.id}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center gap-1 text-xs text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
                            >
                              {acting === a.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                              Accept
                            </motion.button>
                            <motion.button
                              onClick={() => respond(a.id, "reject")}
                              disabled={acting === a.id}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center gap-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg px-3 py-1.5 font-semibold transition-all disabled:opacity-50"
                            >
                              <XCircle size={11} />
                              Reject
                            </motion.button>
                          </div>
                        )}
                        {a.status === "accepted" && (
                          <motion.button
                            onClick={() => complete(a.id)}
                            disabled={completing === a.id}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-1 text-xs text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 shrink-0"
                            style={{ background: "linear-gradient(135deg, #1a5e52 0%, #2A8256 100%)" }}
                          >
                            {completing === a.id ? <Loader2 size={11} className="animate-spin" /> : <Star size={11} />}
                            Complete
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
