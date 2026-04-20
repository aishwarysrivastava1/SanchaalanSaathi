"use client";

import React, { useEffect, useState } from "react";
import { Calendar, Plus, Trash2, Users, X, Loader2, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type EventRow = {
  id: string; title: string; description?: string; event_type: string;
  date: string; location: string; max_volunteers: number;
  status: string; attendee_count: number;
};

type AttendeeRow = { volunteer_id: string; email: string; status: string };

const TYPE_LABELS: Record<string, string> = {
  drive: "Drive", campaign: "Campaign", camp: "Camp", training: "Training",
};

const TYPE_COLORS: Record<string, string> = {
  drive:    "bg-blue-50 text-blue-700 border-blue-200",
  campaign: "bg-purple-50 text-purple-700 border-purple-200",
  camp:     "bg-amber-50 text-amber-700 border-amber-200",
  training: "bg-teal-50 text-teal-700 border-teal-200",
};

const STATUS_COLORS: Record<string, string> = {
  upcoming:  "bg-gray-50 text-gray-600 border-gray-200",
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-slate-50 text-slate-500 border-slate-200",
};

const ATTEND_COLORS: Record<string, string> = {
  invited: "bg-gray-100 text-gray-500",
  present: "bg-emerald-100 text-emerald-700",
  absent:  "bg-red-100 text-red-600",
};

export default function NGOEventsPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [events, setEvents]         = useState<EventRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [attendEvent, setAttendEvent] = useState<EventRow | null>(null);
  const [attendees, setAttendees]   = useState<AttendeeRow[]>([]);
  const [attendLoading, setAttendLoading] = useState(false);
  const [toggling, setToggling]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", event_type: "drive",
    date: "", location: "", max_volunteers: 0, status: "upcoming",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!user) return;
    setLoading(true);
    api.listEvents(user.token)
      .then((d) => setEvents(d as EventRow[]))
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (!authLoading) load(); }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!user || !form.title || !form.date || !form.location) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createEvent(user.token, {
        ...form,
        date: new Date(form.date).toISOString(),
        max_volunteers: Number(form.max_volunteers),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setShowCreate(false);
      setForm({ title: "", description: "", event_type: "drive", date: "", location: "", max_volunteers: 0, status: "upcoming" });
      load();
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    setDeleting(id);
    try { await api.deleteEvent(user.token, id); load(); }
    catch (e: any) { setError(friendlyError(e)); }
    finally { setDeleting(null); }
  };

  const openAttendance = async (ev: EventRow) => {
    if (!user) return;
    setAttendEvent(ev);
    setAttendLoading(true);
    try { setAttendees(await api.getAttendance(user.token, ev.id)); }
    catch (e: any) { setError(friendlyError(e)); }
    finally { setAttendLoading(false); }
  };

  const toggleAttend = async (volId: string, current: string) => {
    if (!user || !attendEvent) return;
    const next = current === "present" ? "absent" : "present";
    setToggling(volId);
    try {
      await api.markAttendance(user.token, attendEvent.id, volId, next);
      setAttendees((a) => a.map((r) => r.volunteer_id === volId ? { ...r, status: next } : r));
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setToggling(null); }
  };

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-[#48A15E]" />
    </div>
  );
  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-white">Events</h1>
          <p className="text-[11px] text-white/40 mt-0.5">{events.length} event{events.length !== 1 ? "s" : ""}</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-white text-xs font-semibold px-3 py-2 rounded-xl"
          style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
        >
          <Plus size={13} /> New Event
        </motion.button>
      </div>

      {/* Alerts */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertCircle size={14} /> {error}
            <button onClick={() => setError("")} className="ml-auto"><X size={13} /></button>
          </motion.div>
        )}
        {saved && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-emerald-300"
            style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}
          >
            <CheckCircle2 size={14} /> Event created successfully.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event cards */}
      {events.length === 0 ? (
        <motion.div
          whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-10 text-center"
          style={{ background: "var(--card-bg)" }}
        >
          <Calendar size={28} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No events yet.</p>
          <p className="text-xs text-gray-300 mt-1">Click "New Event" to create your first drive or campaign.</p>
        </motion.div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((ev, i) => (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3, boxShadow: "0 16px 40px rgba(42,130,86,0.15)", borderColor: "#95C78F" }}
              className="rounded-2xl border border-gray-200 p-4 space-y-3"
              style={{ background: "var(--card-bg)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{ev.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ev.location}</p>
                </div>
                <button
                  onClick={() => handleDelete(ev.id)}
                  disabled={deleting === ev.id}
                  className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                >
                  {deleting === ev.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[ev.event_type] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  {TYPE_LABELS[ev.event_type] ?? ev.event_type}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[ev.status] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  {ev.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{new Date(ev.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="flex items-center gap-1">
                  <Users size={11} /> {ev.attendee_count}{ev.max_volunteers > 0 ? `/${ev.max_volunteers}` : ""}
                </span>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => openAttendance(ev)}
                className="w-full text-xs font-semibold py-2 rounded-xl border border-[#2A8256]/30 text-[#2A8256] hover:bg-[#2A8256]/5 transition-colors"
              >
                Manage Attendance
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Event Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4"
              style={{ background: "var(--modal-bg)" }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-800">New Event</h2>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>

              <div className="space-y-3">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Event title *"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <select
                      value={form.event_type}
                      onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                      className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                    >
                      <option value="drive">Drive</option>
                      <option value="campaign">Campaign</option>
                      <option value="camp">Camp</option>
                      <option value="training">Training</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                />
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Location *"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                />
                <input
                  type="number"
                  value={form.max_volunteers || ""}
                  onChange={(e) => setForm({ ...form, max_volunteers: Number(e.target.value) })}
                  placeholder="Max volunteers (0 = unlimited)"
                  min={0}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                />
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50 resize-none"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                onClick={handleCreate}
                disabled={submitting || !form.title || !form.date || !form.location}
                className="w-full text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Create Event
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attendance Modal */}
      <AnimatePresence>
        {attendEvent && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setAttendEvent(null); }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl p-5 space-y-4"
              style={{ background: "var(--modal-bg)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-gray-800">Attendance</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">{attendEvent.title}</p>
                </div>
                <button onClick={() => setAttendEvent(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>

              {attendLoading ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-[#48A15E]" /></div>
              ) : attendees.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No volunteers in your NGO yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {attendees.map((a) => (
                    <div key={a.volunteer_id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-gray-100">
                      <p className="text-xs text-gray-700 truncate flex-1">{a.email}</p>
                      <button
                        onClick={() => toggleAttend(a.volunteer_id, a.status)}
                        disabled={toggling === a.volunteer_id}
                        className={`ml-3 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 transition-all ${ATTEND_COLORS[a.status]}`}
                      >
                        {toggling === a.volunteer_id ? "…" : a.status}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
