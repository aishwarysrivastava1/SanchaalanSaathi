"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Search, Clock, Loader2, AlertCircle, X, ListChecks, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type OpenTask = {
  id: string; title: string; description: string;
  required_skills: string[]; priority: string;
  deadline?: string; created_at: string;
  match_score: number; matched_skills: string[];
  request_status?: "pending" | "approved" | "rejected";
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   "bg-red-50 text-red-600 border-red-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  low:    "bg-gray-50 text-gray-400 border-gray-200",
};

const REQUEST_BADGE: Record<string, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};

export default function AllTasksPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [tasks, setTasks]           = useState<OpenTask[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [enrollTarget, setEnrollTarget] = useState<OpenTask | null>(null);
  const [form, setForm]             = useState({ reason: "", why_useful: "" });
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.volOpenTasks(user.token)
      .then((t) => setTasks(t as OpenTask[]))
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = tasks.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !enrollTarget) return;
    setSubmitting(true);
    try {
      await api.volEnroll(user.token, enrollTarget.id, { reason: form.reason, why_useful: form.why_useful });
      setSuccessMsg(`Request submitted for "${enrollTarget.title}"`);
      setEnrollTarget(null);
      setForm({ reason: "", why_useful: "" });
      load();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setSubmitting(false); }
  };

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>;
  if (!user) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="p-6 space-y-5">

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-emerald-300"
            style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}>
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-[#115E54]/50"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>
      ) : filtered.length === 0 ? (
        <motion.div whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-10 text-center"
          style={{ background: "var(--card-bg)" }}>
          <ListChecks size={28} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">{search ? "No tasks match your search." : "No open tasks available right now."}</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
              className="rounded-2xl border border-gray-200 overflow-hidden"
              style={{ background: "var(--card-bg)" }}
            >
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-800 text-sm">{task.title}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.medium}`}>
                        {task.priority}
                      </span>
                    </div>
                    {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}

                    <div className="flex flex-wrap gap-1 mt-2">
                      {(task.required_skills ?? []).map((s) => (
                        <span key={s}
                          className={`text-[10px] rounded-full px-2 py-0.5 border font-medium ${
                            task.matched_skills.includes(s)
                              ? "text-[#2A8256] border-[#2A8256]/30"
                              : "text-gray-400 border-gray-200 bg-gray-50"
                          }`}
                          style={task.matched_skills.includes(s) ? { background: "rgba(42,130,86,0.08)" } : {}}
                        >{s}</span>
                      ))}
                    </div>

                    {task.required_skills?.length > 0 && (
                      <div className="mt-2.5 space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-400">
                          <span>Skill match</span>
                          <span className="font-semibold" style={{ color: "#2A8256" }}>{Math.round(task.match_score * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${task.match_score * 100}%` }}
                            transition={{ duration: 0.6, delay: i * 0.04 + 0.2 }}
                            className="h-full rounded-full"
                            style={{ background: "linear-gradient(90deg,#2A8256,#48A15E)" }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 mt-2">
                      {task.deadline && (
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock size={9} /> Due: {new Date(task.deadline).toLocaleDateString()}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Clock size={9} /> Added: {new Date(task.created_at).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-gray-300 font-mono">{task.id.slice(0, 8)}…</p>
                    </div>
                  </div>

                  <div className="shrink-0 mt-1">
                    {task.request_status ? (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${REQUEST_BADGE[task.request_status]}`}>
                        {task.request_status.charAt(0).toUpperCase() + task.request_status.slice(1)}
                      </span>
                    ) : (
                      <button
                        onClick={() => { setEnrollTarget(task); setError(""); }}
                        className="flex items-center gap-1.5 text-xs text-white rounded-xl px-3 py-2 font-semibold whitespace-nowrap"
                        style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}
                      >
                        <Send size={11} /> Request to Join
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Enrollment modal */}
      <AnimatePresence>
        {enrollTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <p className="text-sm font-bold text-gray-800">Request to Join</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[260px]">{enrollTarget.title}</p>
                </div>
                <button onClick={() => setEnrollTarget(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
              </div>
              <form onSubmit={handleEnroll} className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">
                    Why do you want this task? <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required minLength={10}
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    rows={3}
                    placeholder="Describe your motivation and interest in this task…"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">
                    How will you be useful? <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required minLength={10}
                    value={form.why_useful}
                    onChange={(e) => setForm({ ...form, why_useful: e.target.value })}
                    rows={3}
                    placeholder="Describe the skills or experience you bring to this task…"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50 resize-none"
                  />
                </div>
                <motion.button
                  type="submit" disabled={submitting}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  className="w-full text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Submit Request
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
