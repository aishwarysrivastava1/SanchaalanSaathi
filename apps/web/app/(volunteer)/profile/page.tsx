"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/auth";
import { useVolunteer } from "../../../hooks/useFirestore";
import { useToast } from "../../../hooks/useToast";
import {
  User, Star, Zap, CheckCircle, Clock, LogOut,
  Plus, X, Shield, Activity, Award
} from "lucide-react";

const SKILL_PRESETS = [
  "First Aid", "Search & Rescue", "Medical", "Logistics",
  "Construction", "Driving", "Translation", "Cooking",
  "Communication", "IT Support", "Mental Health", "Engineering",
];

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000];

function getLevel(xp: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, LEVEL_THRESHOLDS.length);
}

function getXPToNext(xp: number) {
  const level = getLevel(xp);
  if (level >= LEVEL_THRESHOLDS.length) return { current: xp, needed: xp, pct: 100 };
  const current = xp - LEVEL_THRESHOLDS[level - 1];
  const needed = LEVEL_THRESHOLDS[level] - LEVEL_THRESHOLDS[level - 1];
  return { current, needed, pct: Math.round((current / needed) * 100) };
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="hud-panel rounded-xl p-4 flex flex-col items-center gap-2">
      <div className={`${color}`}>{icon}</div>
      <span className={`text-2xl font-black font-mono ${color}`}>{value}</span>
      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono text-center">{label}</span>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { volunteer, loading } = useVolunteer(user?.uid);
  const { toast } = useToast();
  const [newSkill, setNewSkill] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleAddSkill = async (skill: string) => {
    if (!user || !skill.trim()) return;
    const s = skill.trim();
    if (volunteer?.skills?.includes(s)) { toast("Skill already added", "warning"); return; }
    try {
      await updateDoc(doc(db, "volunteers", user.uid), { skills: arrayUnion(s) });
      toast(`Added: ${s}`, "success");
      setNewSkill("");
    } catch {
      toast("Failed to add skill", "error");
    }
  };

  const handleRemoveSkill = async (skill: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "volunteers", user.uid), { skills: arrayRemove(skill) });
      toast(`Removed: ${skill}`, "info");
    } catch {
      toast("Failed to remove skill", "error");
    }
  };

  const handleToggleStatus = async () => {
    if (!user || !volunteer) return;
    setUpdatingStatus(true);
    const next = volunteer.availabilityStatus === "ACTIVE" ? "OFFLINE" : "ACTIVE";
    try {
      await updateDoc(doc(db, "volunteers", user.uid), { availabilityStatus: next });
      toast(`Status set to ${next}`, "success");
    } catch {
      toast("Failed to update status", "error");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  const level = volunteer ? getLevel(volunteer.totalXP) : 1;
  const xpProgress = volunteer ? getXPToNext(volunteer.totalXP) : { current: 0, needed: 100, pct: 0 };
  const isActive = volunteer?.availabilityStatus === "ACTIVE";

  return (
    <main className="p-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-black text-white tracking-widest font-mono">PROFILE</h1>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors font-mono"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>

      {/* Avatar + Name */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="avatar" className="w-16 h-16 rounded-full border-2 border-neon-cyan/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-neon-cyan/30 flex items-center justify-center">
              <User size={28} className="text-slate-500" />
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 bg-slate-900 border border-neon-cyan/50 rounded-full px-1.5 py-0.5 text-[9px] font-black text-neon-cyan font-mono">
            LV{level}
          </div>
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-white text-lg">{volunteer?.name || user.displayName || "Volunteer"}</h2>
          <p className="text-slate-500 text-xs font-mono">{user.email}</p>
          <button
            onClick={handleToggleStatus}
            disabled={updatingStatus}
            className={`mt-2 flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border transition-all ${
              isActive
                ? "border-neon-green/50 text-neon-green bg-neon-green/10 hover:bg-neon-green/20"
                : "border-slate-600 text-slate-500 bg-slate-800 hover:bg-slate-700"
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-neon-green animate-pulse" : "bg-slate-600"}`} />
            {isActive ? "ACTIVE" : "OFFLINE"}
          </button>
        </div>
      </div>

      {/* XP Bar */}
      <div className="hud-panel rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-slate-400 font-mono uppercase tracking-widest">Level {level} — XP Progress</span>
          <span className="text-xs text-neon-cyan font-mono">{volunteer?.totalXP ?? 0} XP</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-neon-cyan to-blue-500 rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(0,243,255,0.6)]"
            style={{ width: `${xpProgress.pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-slate-600 font-mono">{xpProgress.current} / {xpProgress.needed}</span>
          <span className="text-[10px] text-slate-600 font-mono">Next level</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Tasks Done" value={volunteer?.totalTasksCompleted ?? 0} icon={<CheckCircle size={18} />} color="text-neon-green" />
        <StatCard label="Reputation" value={volunteer?.reputationScore ?? 100} icon={<Shield size={18} />} color="text-neon-cyan" />
        <StatCard label="Active Now" value={volunteer?.currentActiveTasks ?? 0} icon={<Activity size={18} />} color="text-neon-orange" />
      </div>

      {/* Skills */}
      <div className="hud-panel rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Star size={14} className="text-neon-cyan" />
          <h3 className="text-sm font-bold text-white tracking-widest uppercase font-mono">Skills</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
          {(volunteer?.skills ?? []).map((skill) => (
            <span key={skill} className="flex items-center gap-1 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs px-2 py-1 rounded-full font-mono">
              {skill}
              <button onClick={() => handleRemoveSkill(skill)} className="hover:text-red-400 transition-colors ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
          {(!volunteer?.skills || volunteer.skills.length === 0) && (
            <span className="text-slate-600 text-xs font-mono">No skills added yet</span>
          )}
        </div>

        {/* Quick-add presets */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SKILL_PRESETS.filter(s => !volunteer?.skills?.includes(s)).slice(0, 6).map(skill => (
            <button
              key={skill}
              onClick={() => handleAddSkill(skill)}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white px-2 py-1 rounded-full transition-colors font-mono flex items-center gap-1"
            >
              <Plus size={8} /> {skill}
            </button>
          ))}
        </div>

        {/* Custom skill input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add custom skill..."
            value={newSkill}
            onChange={e => setNewSkill(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddSkill(newSkill)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-neon-cyan/50 font-mono placeholder-slate-600"
          />
          <button
            onClick={() => handleAddSkill(newSkill)}
            className="bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/30 text-neon-cyan px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          >
            Add
          </button>
        </div>
      </div>

      {/* Achievement placeholder */}
      <div className="hud-panel rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Award size={14} className="text-neon-purple" />
          <h3 className="text-sm font-bold text-white tracking-widest uppercase font-mono">Achievements</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "First Mission", unlocked: (volunteer?.totalTasksCompleted ?? 0) >= 1 },
            { label: "Veteran", unlocked: (volunteer?.totalTasksCompleted ?? 0) >= 10 },
            { label: "Elite", unlocked: (volunteer?.totalTasksCompleted ?? 0) >= 50 },
            { label: "XP Hunter", unlocked: (volunteer?.totalXP ?? 0) >= 500 },
            { label: "Top 10", unlocked: false },
            { label: "Legend", unlocked: (volunteer?.totalXP ?? 0) >= 5000 },
          ].map(a => (
            <div key={a.label} className={`rounded-lg p-2 border text-center transition-all ${a.unlocked ? "border-neon-purple/40 bg-neon-purple/10" : "border-slate-800 bg-slate-900/50 opacity-40"}`}>
              <div className="text-lg mb-1">{a.unlocked ? "🏆" : "🔒"}</div>
              <span className="text-[9px] font-mono text-slate-400 uppercase">{a.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
