"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Search, UserX, Sparkles, Loader2, AlertCircle, Users } from "lucide-react";
import { motion } from "motion/react";
import { CARD_LIFT, riseIn } from "../../../lib/motion";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";
import { Modal } from "../../../components/ui/primitives";

type Volunteer = {
  id: string;
  email: string;
  full_name?: string;
  skills: string[];
  availability: Record<string, boolean>;
  status: "active" | "inactive";
};

type VolunteerRaw = {
  id?: unknown;
  user_id?: unknown;
  email?: unknown;
  full_name?: unknown;
  skills?: unknown;
  availability?: unknown;
  status?: unknown;
};

type RankedVol = {
  volunteer_id: string;
  name: string;
  email: string;
  score: number;
  matched_skills: string[];
  workload: number;
};

type Task = { id: string; title: string };

const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_LABELS: Record<string, string> = { mon:"M", tue:"T", wed:"W", thu:"T", fri:"F", sat:"S", sun:"S" };

function emailToInitials(email: string): string {
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function normalizeVolunteer(raw: VolunteerRaw): Volunteer {
  const rawId = typeof raw.id === "string" ? raw.id : (typeof raw.user_id === "string" ? raw.user_id : "");
  const email = typeof raw.email === "string" && raw.email.trim() ? raw.email : "unknown@volunteer.local";
  const skills = Array.isArray(raw.skills)
    ? raw.skills.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const availability: Record<string, boolean> = {};
  if (raw.availability && typeof raw.availability === "object") {
    for (const day of DAYS) {
      availability[day] = Boolean((raw.availability as Record<string, unknown>)[day]);
    }
  }

  return {
    id: rawId,
    email,
    full_name: typeof raw.full_name === "string" ? raw.full_name : undefined,
    skills,
    availability,
    status: raw.status === "inactive" ? "inactive" : "active",
  };
}

type SortKey = "name" | "skills" | "availability";

export default function VolunteersPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [sort, setSort]             = useState<SortKey>("name");
  const [matchModal, setMatchModal] = useState<{ taskId: string; taskTitle: string } | null>(null);
  const [ranked, setRanked]         = useState<RankedVol[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      api.ngoVolunteers(user.token),
      api.ngoTasks(user.token, { status: "open" }),
    ])
      .then(([vols, tsks]) => {
        const normalized = Array.isArray(vols)
          ? (vols as VolunteerRaw[]).map((v) => normalizeVolunteer(v))
          : [];
        setVolunteers(normalized);
        setTasks(tsks as Task[]);
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const allSkills = useMemo(() => {
    const set = new Set<string>();
    volunteers.forEach((v) => (v.skills ?? []).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [volunteers]);

  const filtered = useMemo(() => {
    let list = volunteers;
    if (search) list = list.filter((v) =>
      v.email.toLowerCase().includes(search.toLowerCase()) ||
      (v.full_name ?? "").toLowerCase().includes(search.toLowerCase())
    );
    if (statusFilter) list = list.filter((v) => v.status === statusFilter);
    if (activeSkills.length > 0) list = list.filter((v) => activeSkills.every((s) => v.skills.includes(s)));
    return [...list].sort((a, b) => {
      if (sort === "name") return a.email.localeCompare(b.email);
      if (sort === "skills") return (b.skills ?? []).length - (a.skills ?? []).length;
      if (sort === "availability") {
        const aDays = DAYS.filter((d) => a.availability?.[d]).length;
        const bDays = DAYS.filter((d) => b.availability?.[d]).length;
        return bDays - aDays;
      }
      return 0;
    });
  }, [volunteers, search, statusFilter, activeSkills, sort]);

  const toggleSkillFilter = (s: string) =>
    setActiveSkills((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const handleDeactivate = async (id: string) => {
    if (!user) return;
    setDeactivating(id);
    try {
      await api.deactivateVolunteer(user.token, id);
      setVolunteers((prev) => prev.map((v) => v.id === id ? { ...v, status: "inactive" } : v));
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setDeactivating(null); }
  };

  const openMatch = async (taskId: string, taskTitle: string) => {
    if (!user) return;
    setMatchModal({ taskId, taskTitle });
    setMatchLoading(true);
    try {
      const res = await api.aiMatch(user.token, taskId);
      setRanked(res.ranked_volunteers);
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setMatchLoading(false); }
  };

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-accent" /></div>;
  if (!user) return null;

  return (
    <motion.div {...riseIn} transition={{ duration: 0.4 }} className="p-6 space-y-5">

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-700 dark:text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-primary/50"
            />
          </div>

          {(["","active","inactive"] as const).map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                statusFilter === s
                  ? "text-white border-transparent"
                  : "bg-gray-50 border-gray-200 text-gray-500 hover:border-secondary/40 hover:text-secondary"
              }`}
              style={statusFilter === s ? { background: "linear-gradient(135deg,var(--brand-500),var(--brand-400))" } : {}}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="appearance-none bg-white border border-gray-200 rounded-xl px-3 pr-7 py-2 text-xs font-semibold outline-none text-gray-600"
          >
            <option value="name">Sort: Name A–Z</option>
            <option value="skills">Sort: Most Skills</option>
            <option value="availability">Sort: Most Available</option>
          </select>

          {tasks.length > 0 && (
            <select
              onChange={(e) => e.target.value && openMatch(e.target.value, tasks.find(t => t.id === e.target.value)?.title ?? "")}
              defaultValue=""
              className="appearance-none rounded-xl px-3 pr-8 py-2 text-xs font-semibold outline-none cursor-pointer text-white"
              style={{ background: "linear-gradient(135deg,var(--brand-500),var(--brand-400))" }}
            >
              <option value="" disabled>AI Match for task…</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>

        {allSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allSkills.map((s) => (
              <button
                key={s}
                onClick={() => toggleSkillFilter(s)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  activeSkills.includes(s)
                    ? "text-secondary border-secondary/40"
                    : "bg-gray-50 border-gray-200 text-gray-400 hover:border-secondary/30 hover:text-secondary"
                }`}
                style={activeSkills.includes(s) ? { background: "rgba(42,130,86,0.1)" } : {}}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">{filtered.length} volunteer{filtered.length !== 1 ? "s" : ""}</p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-accent" /></div>
      ) : filtered.length === 0 ? (
        <motion.div
          whileHover={CARD_LIFT}
          className="rounded-2xl border border-gray-200 p-10 text-center"
          style={{ background: "var(--card-bg)" }}
        >
          <Users size={28} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No volunteers found.</p>
        </motion.div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v, i) => {
            const initials = emailToInitials(v.email);
            const availDays = DAYS.filter((d) => v.availability?.[d]).length;
            const displayId = v.id ? `${v.id.slice(0, 8)}...` : "unknown";
            const rowKey = v.id || `${v.email}-${i}`;
            const canDeactivate = Boolean(v.id);
            return (
              <motion.div
                key={rowKey}
                {...riseIn} transition={{ delay: i * 0.04 }}
                whileHover={CARD_LIFT}
                className="rounded-2xl border border-gray-200 p-4 space-y-3"
                style={{ background: "var(--card-bg)" }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: v.status === "active" ? "linear-gradient(135deg,var(--brand-500),var(--brand-400))" : "rgba(156,163,175,0.4)" }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    {v.full_name && <p className="text-xs font-bold text-gray-800 truncate">{v.full_name}</p>}
                    <p className="text-[11px] text-gray-500 truncate">{v.email}</p>
                    <p className="text-[9px] text-gray-300 font-mono mt-0.5">{displayId}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    v.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                  }`}>
                    {v.status}
                  </span>
                </div>

                {(v.skills ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(v.skills ?? []).map((s) => (
                      <span
                        key={s}
                        className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${
                          activeSkills.includes(s)
                            ? "text-secondary border-secondary/30"
                            : "text-gray-400 border-gray-200 bg-gray-50"
                        }`}
                        style={activeSkills.includes(s) ? { background: "rgba(42,130,86,0.08)" } : {}}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide">Availability</p>
                    <div className="flex gap-0.5">
                      {DAYS.map((d) => (
                        <div
                          key={d}
                          className={`w-4 h-4 rounded text-[7px] font-bold flex items-center justify-center ${
                            v.availability?.[d] ? "text-white" : "bg-gray-100 text-gray-400"
                          }`}
                          style={v.availability?.[d] ? { background: "linear-gradient(135deg,var(--brand-500),var(--brand-400))" } : {}}
                        >
                          {DAY_LABELS[d]}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">{availDays}d/wk</p>
                </div>

                {v.status === "active" && canDeactivate && (
                  <button
                    onClick={() => handleDeactivate(v.id)}
                    disabled={deactivating === v.id}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg px-2 py-1.5 border border-red-100 transition-all disabled:opacity-50"
                  >
                    {deactivating === v.id ? <Loader2 size={10} className="animate-spin" /> : <UserX size={10} />}
                    Deactivate
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(matchModal)}
        onClose={() => { setMatchModal(null); setRanked([]); }}
        title="AI Volunteer Match"
        subtitle={matchModal?.taskTitle}
        icon={<Sparkles size={14} className="text-secondary" />}
        maxWidth="max-w-lg"
      >
              <div className="p-5 max-h-[420px] overflow-y-auto space-y-2">
                {matchLoading ? (
                  <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-secondary" /></div>
                ) : ranked.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">No active volunteers with matching skills.</p>
                ) : ranked.map((r, i) => (
                  <motion.div
                    key={r.volunteer_id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 border border-gray-100"
                    style={{ background: "var(--card-bg)" }}
                  >
                    <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ background: "linear-gradient(135deg,var(--brand-500),var(--brand-400))" }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{r.email}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {r.matched_skills.map((s) => (
                          <span key={s} className="text-[10px] text-secondary border border-secondary/20 rounded-full px-1.5 py-0.5" style={{ background: "rgba(42,130,86,0.08)" }}>{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-secondary">{Math.round(r.score * 100)}%</div>
                      <div className="text-[10px] text-gray-400">{r.workload} task{r.workload !== 1 ? "s" : ""}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
      </Modal>
    </motion.div>
  );
}
