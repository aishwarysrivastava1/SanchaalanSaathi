"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, X, Loader2, AlertCircle, ChevronDown, Link2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type Resource = {
  id: string;
  type: string;
  quantity: number;
  availability_status: "available" | "in_use" | "depleted";
  metadata_?: Record<string, unknown>;
};

type Task = { id: string; title: string };

const STATUS_META: Record<string, { color: string; label: string; barColor: string; barPct: number }> = {
  available: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Available", barColor: "#34d399", barPct: 100 },
  in_use:    { color: "bg-amber-50 text-amber-700 border-amber-200",       label: "In Use",   barColor: "#fbbf24", barPct: 60  },
  depleted:  { color: "bg-red-50 text-red-600 border-red-200",             label: "Depleted", barColor: "#f87171", barPct: 5   },
};

export default function ResourcesPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "", quantity: 1 });
  const [submitting, setSubmitting] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState<{ resourceId: string; taskId: string }>({ resourceId: "", taskId: "" });

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      api.ngoResources(user.token),
      api.ngoTasks(user.token, { status: "open" }),
    ])
      .then(([r, t]) => { setResources(r as Resource[]); setTasks(t as Task[]); })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      await api.createResource(user.token, { type: form.type, quantity: form.quantity });
      setForm({ type: "", quantity: 1 });
      setShowCreate(false);
      load();
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setSubmitting(false); }
  };

  const handleAllocate = async (resourceId: string, taskId: string) => {
    if (!user || !taskId) return;
    setAllocating(resourceId);
    try {
      await api.allocateResource(user.token, resourceId, taskId);
      load();
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setAllocating(null); }
  };

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>;
  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-5"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">{resources.length} resource{resources.length !== 1 ? "s" : ""} tracked</p>
        <motion.button
          onClick={() => setShowCreate(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
        >
          <Plus size={14} /> Add Resource
        </motion.button>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>
      ) : resources.length === 0 ? (
        <motion.div
          whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400"
          style={{ background: "var(--card-bg)" }}
        >
          No resources yet. Add inventory to track and allocate.
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {resources.map((r, i) => {
            const meta = STATUS_META[r.availability_status] ?? STATUS_META.available;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -4, boxShadow: "0 16px 36px rgba(42,130,86,0.15)", borderColor: "#95C78F" }}
                className="rounded-2xl border border-gray-200 p-5 flex flex-col gap-3"
                style={{ background: "var(--card-bg)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{r.type}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Qty: <span className="font-bold text-gray-700">{r.quantity}</span></p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Animated status bar */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${meta.barPct}%` }}
                    transition={{ duration: 0.7, delay: i * 0.06 + 0.2, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: meta.barColor }}
                  />
                </div>

                {r.availability_status === "available" && tasks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <select
                        value={allocateTarget.resourceId === r.id ? allocateTarget.taskId : ""}
                        onChange={(e) => setAllocateTarget({ resourceId: r.id, taskId: e.target.value })}
                        className="appearance-none w-full bg-gray-50 border border-gray-200 rounded-lg px-2 pr-6 py-1.5 text-xs outline-none text-gray-700"
                      >
                        <option value="">Select task…</option>
                        {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    <button
                      onClick={() => handleAllocate(r.id, allocateTarget.resourceId === r.id ? allocateTarget.taskId : "")}
                      disabled={allocating === r.id || (allocateTarget.resourceId !== r.id || !allocateTarget.taskId)}
                      className="flex items-center gap-1 text-xs text-[#2A8256] rounded-lg px-2.5 py-1.5 font-semibold transition-all disabled:opacity-40"
                      style={{ background: "rgba(42,130,86,0.1)", border: "1px solid rgba(42,130,86,0.2)" }}
                    >
                      {allocating === r.id ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
                      Allocate
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800">Add Resource</p>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
              </div>
              <form onSubmit={handleCreate} className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Resource Type</label>
                  <input
                    required
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    placeholder="e.g. First Aid Kits, Vehicles, Laptops"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Quantity</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#115E54]/50"
                  />
                </div>
                <motion.button
                  type="submit"
                  disabled={submitting}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Add Resource
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
