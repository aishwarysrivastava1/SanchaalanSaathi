"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, X, Sparkles, Trash2, UserCheck, Loader2, AlertCircle,
  CheckCircle2, Clock, Edit2, Bell, Copy, Check, ChevronDown, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type Task = {
  id: string; title: string; description: string;
  required_skills: string[]; priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "completed" | "cancelled";
  deadline?: string; created_at?: string;
};

type EnrollReq = {
  id: string; task_id: string; task_title: string;
  volunteer_id: string; volunteer_email: string;
  reason: string; why_useful: string; status: string; created_at: string;
};

type RankedVol = { volunteer_id: string; name: string; email: string; score: number; matched_skills: string[] };

const STATUS_META: Record<string, { label: string; color: string; borderColor: string }> = {
  open:        { label: "Open",        color: "bg-teal-50 text-teal-700 border-teal-200",         borderColor: "#2dd4bf" },
  in_progress: { label: "In Progress", color: "bg-amber-50 text-amber-700 border-amber-200",      borderColor: "#fbbf24" },
  completed:   { label: "Completed",   color: "bg-emerald-50 text-emerald-700 border-emerald-200", borderColor: "#34d399" },
  cancelled:   { label: "Cancelled",   color: "bg-gray-100 text-gray-500 border-gray-200",         borderColor: "#9ca3af" },
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   "bg-red-50 text-red-600 border-red-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  low:    "bg-gray-50 text-gray-400 border-gray-200",
};

const FILTERS = ["All", "Open", "In Progress", "Completed", "Cancelled"] as const;
const FILTER_MAP: Record<string, string | undefined> = {
  "All": undefined, "Open": "open", "In Progress": "in_progress",
  "Completed": "completed", "Cancelled": "cancelled",
};

function SkillChipInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const s = input.trim();
    if (s && !value.includes(s)) onChange([...value, s]);
    setInput("");
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add skill + Enter"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#115E54]/50" />
        <button type="button" onClick={add} className="bg-[#115E54] text-white px-3 py-2 rounded-lg text-sm font-semibold">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((s) => (
          <span key={s} className="flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-1 text-xs font-medium">
            {s}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== s))} className="hover:text-red-500"><X size={10} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-[10px] text-gray-300 font-mono hover:text-gray-500 transition-colors">
      {id.slice(0, 12)}… {copied ? <Check size={9} className="text-emerald-500" /> : <Copy size={9} />}
    </button>
  );
}

export default function TasksPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [enrollReqs, setEnrollReqs]     = useState<EnrollReq[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [filter, setFilter]             = useState<string>("All");
  const [search, setSearch]             = useState("");
  const [showCreate, setShowCreate]     = useState(false);
  const [editTask, setEditTask]         = useState<Task | null>(null);
  const [pingTask, setPingTask]         = useState<Task | null>(null);
  const [pingMsg, setPingMsg]           = useState("");
  const [pingCount, setPingCount]       = useState<number | null>(null);
  const [assignModal, setAssignModal]   = useState<{ task: Task; ranked: RankedVol[] } | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [assigning, setAssigning]       = useState<string | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [completing, setCompleting]     = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [pinging, setPinging]           = useState(false);
  const [reqsOpen, setReqsOpen]         = useState(false);
  const [actioning, setActioning]       = useState<string | null>(null);

  const [form, setForm] = useState({ title: "", description: "", required_skills: [] as string[], priority: "medium", deadline: "" });
  const [editForm, setEditForm] = useState<Partial<Task & { deadline: string }>>({});

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    const statusParam = FILTER_MAP[filter];
    Promise.all([
      api.ngoTasks(user.token, { status: statusParam }),
      api.ngoEnrollmentRequests(user.token, "pending"),
    ])
      .then(([t, r]) => { setTasks(t as Task[]); setEnrollReqs(r as EnrollReq[]); })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user, filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = tasks.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await api.createTask(user.token, {
        title: form.title, description: form.description,
        required_skills: form.required_skills,
        priority: form.priority, deadline: form.deadline || undefined,
      } as any);
      setForm({ title: "", description: "", required_skills: [], priority: "medium", deadline: "" });
      setShowCreate(false);
      load();
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setSaving(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editTask) return;
    setSaving(true);
    try {
      await api.updateTask(user.token, editTask.id, editForm);
      setEditTask(null);
      load();
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setSaving(false); }
  };

  const handlePing = async () => {
    if (!user || !pingTask) return;
    setPinging(true);
    try {
      const res = await api.pingTask(user.token, pingTask.id, pingMsg || undefined);
      setPingCount(res.count);
      setPingMsg("");
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setPinging(false); }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    setDeleting(id);
    try { await api.deleteTask(user.token, id); setTasks((p) => p.filter((t) => t.id !== id)); }
    catch (e: any) { setError(friendlyError(e)); }
    finally { setDeleting(null); }
  };

  const handleComplete = async (id: string) => {
    if (!user) return;
    setCompleting(id);
    try { await api.completeTask(user.token, id); load(); }
    catch (e: any) { setError(friendlyError(e)); }
    finally { setCompleting(null); }
  };

  const openAssign = async (task: Task) => {
    if (!user) return;
    setMatchLoading(true);
    try {
      const res = await api.aiMatch(user.token, task.id);
      setAssignModal({ task, ranked: res.ranked_volunteers });
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setMatchLoading(false); }
  };

  const handleAssign = async (taskId: string, volId: string) => {
    if (!user) return;
    setAssigning(volId);
    try { await api.assignTask(user.token, taskId, volId); setAssignModal(null); load(); }
    catch (e: any) { setError(friendlyError(e)); }
    finally { setAssigning(null); }
  };

  const handleEnrollAction = async (reqId: string, approve: boolean) => {
    if (!user) return;
    setActioning(reqId);
    try {
      if (approve) await api.approveEnrollment(user.token, reqId);
      else await api.rejectEnrollment(user.token, reqId);
      load();
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setActioning(null); }
  };

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>;
  if (!user) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="p-6 space-y-5">

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError("")} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Enrollment requests panel */}
      {enrollReqs.length > 0 && (
        <motion.div whileHover={{ borderColor: "#95C78F" }} className="rounded-2xl border border-amber-200 overflow-hidden" style={{ background: "rgba(251,191,36,0.04)" }}>
          <button onClick={() => setReqsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-amber-700">
            <span className="flex items-center gap-2">
              <Bell size={13} className="text-amber-500" />
              Pending Enrollment Requests ({enrollReqs.length})
            </span>
            {reqsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <AnimatePresence>
            {reqsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-5 pb-4 space-y-3">
                  {enrollReqs.map((r) => (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-gray-800">{r.volunteer_email}</p>
                          <p className="text-[11px] text-gray-500">→ <span className="font-medium">{r.task_title}</span></p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handleEnrollAction(r.id, true)} disabled={actioning === r.id}
                            className="text-[11px] text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 flex items-center gap-1"
                            style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
                            {actioning === r.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} Approve
                          </button>
                          <button onClick={() => handleEnrollAction(r.id, false)} disabled={actioning === r.id}
                            className="text-[11px] text-red-500 rounded-lg px-3 py-1.5 font-semibold border border-red-200 hover:bg-red-50 disabled:opacity-50">
                            Reject
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 line-clamp-2">{r.reason}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#115E54]/50 w-48"
        />
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === f ? "text-white border-transparent" : "bg-gray-50 border-gray-200 text-gray-500 hover:border-[#2A8256]/40 hover:text-[#2A8256]"
              }`}
              style={filter === f ? { background: "linear-gradient(135deg,#2A8256,#48A15E)" } : {}}>
              {f}
            </button>
          ))}
        </div>
        <motion.button onClick={() => setShowCreate(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="ml-auto flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
          <Plus size={14} /> New Task
        </motion.button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>
      ) : filtered.length === 0 ? (
        <motion.div whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400"
          style={{ background: "var(--card-bg)" }}>
          No tasks found. Click &quot;New Task&quot; to create one.
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task, i) => {
            const meta = STATUS_META[task.status] ?? STATUS_META.open;
            return (
              <motion.div key={task.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                whileHover={{ y: -2, boxShadow: "0 16px 36px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
                className="rounded-2xl border border-gray-200 overflow-hidden"
                style={{ background: "var(--card-bg)", borderLeft: `4px solid ${meta.borderColor}` }}>
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-800 text-sm">{task.title}</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.medium}`}>{task.priority}</span>
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{task.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {task.required_skills.map((s) => (
                          <span key={s} className="text-[10px] text-[#2A8256] border border-[#2A8256]/20 rounded-full px-2 py-0.5" style={{ background: "rgba(42,130,86,0.08)" }}>{s}</span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-2">
                        {task.deadline && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={9} /> Due: {new Date(task.deadline).toLocaleDateString()}</p>
                        )}
                        {task.created_at && (
                          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={9} /> Added: {new Date(task.created_at).toLocaleString()}</p>
                        )}
                        <CopyId id={task.id} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {task.status === "open" && (
                        <button onClick={() => openAssign(task)} disabled={matchLoading}
                          className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 font-semibold text-[#2A8256] disabled:opacity-50"
                          style={{ background: "rgba(42,130,86,0.1)", border: "1px solid rgba(42,130,86,0.2)" }}>
                          {matchLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />} Assign
                        </button>
                      )}
                      {task.status === "in_progress" && (
                        <button onClick={() => handleComplete(task.id)} disabled={completing === task.id}
                          className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 font-semibold text-emerald-700 disabled:opacity-50"
                          style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}>
                          {completing === task.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} Complete
                        </button>
                      )}
                      <button onClick={() => { setPingTask(task); setPingCount(null); setPingMsg(""); }}
                        className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 font-semibold text-indigo-600"
                        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                        <Bell size={10} /> Ping
                      </button>
                      <button
                        onClick={() => { setEditTask(task); setEditForm({ title: task.title, description: task.description, required_skills: [...task.required_skills], priority: task.priority, status: task.status, deadline: task.deadline ?? "" }); }}
                        className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 font-semibold text-gray-600 hover:bg-gray-100">
                        <Edit2 size={10} /> Edit
                      </button>
                      <button onClick={() => handleDelete(task.id)} disabled={deleting === task.id}
                        className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg p-1.5 transition-all">
                        {deleting === task.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <p className="text-sm font-bold text-gray-800">Create Task</p>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
              </div>
              <form onSubmit={handleCreate} className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Title</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#115E54]/50 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Required Skills</label>
                  <SkillChipInput value={form.required_skills} onChange={(v) => setForm({ ...form, required_skills: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Priority</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Deadline <span className="text-gray-300">(optional)</span></label>
                    <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none" />
                  </div>
                </div>
                <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  className="w-full text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
                  {saving && <Loader2 size={14} className="animate-spin" />} Create Task
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit modal */}
      <AnimatePresence>
        {editTask && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <p className="text-sm font-bold text-gray-800">Edit Task</p>
                <button onClick={() => setEditTask(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
              </div>
              <form onSubmit={handleEdit} className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Title</label>
                  <input value={editForm.title ?? ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                  <textarea value={editForm.description ?? ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#115E54]/50 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Required Skills</label>
                  <SkillChipInput value={editForm.required_skills ?? []} onChange={(v) => setEditForm({ ...editForm, required_skills: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Priority</label>
                    <select value={editForm.priority ?? "medium"} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                    <select value={editForm.status ?? "open"} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none">
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Deadline <span className="text-gray-300">(optional)</span></label>
                  <input type="date" value={editForm.deadline ?? ""} onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none" />
                </div>
                <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  className="w-full text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
                  {saving && <Loader2 size={14} className="animate-spin" />} Save Changes
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ping modal */}
      <AnimatePresence>
        {pingTask && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <p className="text-sm font-bold text-gray-800 flex items-center gap-2"><Bell size={13} className="text-indigo-500" /> Ping Volunteers</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[240px]">{pingTask.title}</p>
                </div>
                <button onClick={() => { setPingTask(null); setPingCount(null); }} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
              </div>
              <div className="p-5 space-y-4">
                {pingCount !== null ? (
                  <div className="text-center py-4 space-y-2">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                    <p className="text-sm font-semibold text-gray-800">Sent to {pingCount} volunteer{pingCount !== 1 ? "s" : ""}</p>
                    <button onClick={() => { setPingTask(null); setPingCount(null); }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline">Close</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Custom message <span className="text-gray-300">(optional)</span></label>
                      <textarea value={pingMsg} onChange={(e) => setPingMsg(e.target.value)} rows={3}
                        placeholder="Leave blank for default message…"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50 resize-none" />
                    </div>
                    <motion.button onClick={handlePing} disabled={pinging} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      className="w-full text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{ background: "linear-gradient(135deg,#6366f1,#818cf8)" }}>
                      {pinging && <Loader2 size={14} className="animate-spin" />} Send Notification
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Assign modal */}
      <AnimatePresence>
        {assignModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <div className="flex items-center gap-2"><Sparkles size={14} className="text-[#2A8256]" /><p className="text-sm font-bold text-gray-800">AI Volunteer Match</p></div>
                  <p className="text-xs text-gray-400 mt-0.5">{assignModal.task.title}</p>
                </div>
                <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
              </div>
              <div className="p-5 max-h-[400px] overflow-y-auto space-y-2">
                {assignModal.ranked.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">No matching volunteers available.</p>
                ) : assignModal.ranked.map((r, i) => (
                  <div key={r.volunteer_id} className="flex items-center gap-3 rounded-xl px-4 py-3 border border-gray-100" style={{ background: "var(--card-bg)" }}>
                    <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{r.name || r.email}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {r.matched_skills.map((s) => (
                          <span key={s} className="text-[10px] bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-1.5 py-0.5">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[#2A8256] shrink-0">{Math.round(r.score * 100)}%</div>
                    <button onClick={() => handleAssign(assignModal.task.id, r.volunteer_id)} disabled={assigning === r.volunteer_id}
                      className="flex items-center gap-1 text-xs text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 shrink-0"
                      style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
                      {assigning === r.volunteer_id ? <Loader2 size={10} className="animate-spin" /> : <UserCheck size={10} />} Assign
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
