"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Clock, CheckCircle2, XCircle, Loader2, AlertCircle, ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type Assignment = {
  task_id: string; title: string; description: string;
  required_skills: string[]; task_status: string;
  deadline?: string; assignment_id: string;
  assignment_status: "assigned" | "accepted" | "rejected" | "completed";
  assigned_at: string;
};

type EnrollReq = {
  id: string; task_id: string; task_title: string;
  reason: string; status: "pending" | "approved" | "rejected"; created_at: string;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  assigned:  { label: "Awaiting",  color: "bg-amber-50 text-amber-700 border-amber-200"       },
  accepted:  { label: "Accepted",  color: "bg-teal-50 text-teal-700 border-teal-200"          },
  rejected:  { label: "Rejected",  color: "bg-red-50 text-red-600 border-red-200"             },
  completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const ENROLL_META: Record<string, { label: string; color: string }> = {
  pending:  { label: "Pending",  color: "bg-amber-50 text-amber-700 border-amber-200"         },
  approved: { label: "Approved", color: "bg-emerald-50 text-emerald-700 border-emerald-200"   },
  rejected: { label: "Rejected", color: "bg-red-50 text-red-600 border-red-200"               },
};

const FILTERS = ["All", "Awaiting", "Accepted", "Completed"] as const;

export default function VolTasksPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [tasks, setTasks]           = useState<Assignment[]>([]);
  const [enrollReqs, setEnrollReqs] = useState<EnrollReq[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [filter, setFilter]         = useState<string>("All");
  const [actioning, setActioning]   = useState<string | null>(null);
  const [reqsOpen, setReqsOpen]     = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([api.volTasks(user.token), api.volEnrollmentRequests(user.token)])
      .then(([t, r]) => { setTasks(t as Assignment[]); setEnrollReqs(r as EnrollReq[]); })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: () => Promise<any>) => {
    setActioning(id);
    try { await fn(); load(); } catch (e: any) { setError(friendlyError(e)); }
    finally { setActioning(null); }
  };

  const filtered = tasks.filter((t) => {
    if (filter === "All") return true;
    if (filter === "Awaiting")  return t.assignment_status === "assigned";
    if (filter === "Accepted")  return t.assignment_status === "accepted";
    if (filter === "Completed") return t.assignment_status === "completed";
    return true;
  });

  const countFor = (f: string) =>
    tasks.filter((t) =>
      f === "Awaiting"  ? t.assignment_status === "assigned"  :
      f === "Accepted"  ? t.assignment_status === "accepted"  :
      f === "Completed" ? t.assignment_status === "completed" : true
    ).length;

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>;
  if (!user) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="p-6 space-y-5">

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f
                ? "text-white border-transparent"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:border-[#2A8256]/40 hover:text-[#2A8256]"
            }`}
            style={filter === f ? { background: "linear-gradient(135deg,#2A8256,#48A15E)" } : {}}
          >
            {f}{f !== "All" && <span className="ml-1 opacity-60">({countFor(f)})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>
      ) : filtered.length === 0 ? (
        <motion.div
          whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-10 text-center"
          style={{ background: "var(--card-bg)" }}
        >
          <ClipboardList size={28} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No {filter !== "All" ? filter.toLowerCase() : ""} tasks assigned to you yet.</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task, i) => {
            const meta = STATUS_META[task.assignment_status] ?? STATUS_META.assigned;
            const busy = actioning === task.assignment_id;
            return (
              <motion.div
                key={task.assignment_id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
                className="rounded-2xl border border-gray-200 overflow-hidden"
                style={{ background: "var(--card-bg)" }}
              >
                <div className="px-5 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-800 text-sm">{task.title}</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(task.required_skills ?? []).map((s) => (
                          <span key={s} className="text-[10px] text-[#2A8256] border border-[#2A8256]/20 rounded-full px-2 py-0.5" style={{ background: "rgba(42,130,86,0.08)" }}>{s}</span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-2">
                        {task.deadline && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Clock size={9} /> Due: {new Date(task.deadline).toLocaleDateString()}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock size={9} /> Assigned: {new Date(task.assigned_at).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-300 font-mono">{task.task_id.slice(0, 8)}…</p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 flex-col sm:flex-row">
                      {task.assignment_status === "assigned" && (
                        <>
                          <button
                            onClick={() => act(task.assignment_id, () => api.acceptAssignment(user.token, task.assignment_id))}
                            disabled={!!actioning}
                            className="flex items-center gap-1 text-xs text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
                            style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}
                          >
                            {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Accept
                          </button>
                          <button
                            onClick={() => act(task.assignment_id, () => api.rejectAssignment(user.token, task.assignment_id))}
                            disabled={!!actioning}
                            className="flex items-center gap-1 text-xs text-red-500 rounded-lg px-3 py-1.5 font-semibold border border-red-200 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle size={11} /> Reject
                          </button>
                        </>
                      )}
                      {task.assignment_status === "accepted" && (
                        <button
                          onClick={() => act(task.assignment_id, () => api.completeAssignment(user.token, task.assignment_id))}
                          disabled={!!actioning}
                          className="flex items-center gap-1 text-xs text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}
                        >
                          {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* My enrollment requests */}
      {enrollReqs.length > 0 && (
        <motion.div
          whileHover={{ y: -1, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 overflow-hidden"
          style={{ background: "var(--card-bg)" }}
        >
          <button
            onClick={() => setReqsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-700"
          >
            <span>My Enrollment Requests ({enrollReqs.length})</span>
            {reqsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <AnimatePresence>
            {reqsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-4 space-y-2">
                  {enrollReqs.map((r) => {
                    const m = ENROLL_META[r.status] ?? ENROLL_META.pending;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{r.task_title}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{r.reason}</p>
                          <p className="text-[10px] text-gray-300 mt-0.5 flex items-center gap-1">
                            <Clock size={9} /> {new Date(r.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${m.color}`}>{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}
