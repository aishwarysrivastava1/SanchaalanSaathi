"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/auth";
import { useVolunteer } from "../../../hooks/useFirestore";
import { useToast } from "../../../hooks/useToast";
import {
  User, Star, Zap, CheckCircle, LogOut,
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
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center gap-1.5 shadow-sm hover:shadow-md transition-all">
      <div className={color}>{icon}</div>
      <span className={`text-xl font-bold ${color} tabular-nums`}>{value}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide text-center">{label}</span>
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
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowBar(true), 150);
    return () => clearTimeout(t);
  }, []);

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
    router.replace("/");
  };

  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-white dark:bg-gray-900 rounded-xl animate-pulse border border-gray-200 dark:border-gray-800" />
        ))}
      </div>
    );
  }

  if (!user) { router.replace("/"); return null; }

  const level = volunteer ? getLevel(volunteer.totalXP) : 1;
  const xpProgress = volunteer ? getXPToNext(volunteer.totalXP) : { current: 0, needed: 100, pct: 0 };
  const isActive = volunteer?.availabilityStatus === "ACTIVE";

  const achievements = [
    { label: "First Mission", icon: "🎯", unlocked: (volunteer?.totalTasksCompleted ?? 0) >= 1 },
    { label: "Veteran",       icon: "⭐", unlocked: (volunteer?.totalTasksCompleted ?? 0) >= 10 },
    { label: "Elite",         icon: "🏅", unlocked: (volunteer?.totalTasksCompleted ?? 0) >= 50 },
    { label: "XP Hunter",     icon: "⚡", unlocked: (volunteer?.totalXP ?? 0) >= 500 },
    { label: "Top 10",        icon: "🏆", unlocked: false },
    { label: "Legend",        icon: "👑", unlocked: (volunteer?.totalXP ?? 0) >= 5000 },
  ];

  return (
    <main className="p-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Profile</h1>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>

      {/* Avatar + Name */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative shrink-0">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="avatar" className="w-16 h-16 rounded-full border-2 border-[#115E54]/30 shadow-sm" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center">
              <User size={28} className="text-gray-400 dark:text-gray-500" />
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 bg-[#115E54] text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold shadow-sm">
            Lv{level}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base truncate">{volunteer?.name || user.displayName || "Volunteer"}</h2>
          <p className="text-gray-400 dark:text-gray-500 text-xs truncate">{user.email}</p>
          <button
            onClick={handleToggleStatus}
            disabled={updatingStatus}
            className={`mt-2 flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-all active:scale-[0.97] ${
              isActive
                ? "border-[#48A15E]/40 text-[#2A8256] dark:text-[#48A15E] bg-[#48A15E]/10 dark:bg-[#48A15E]/20 hover:bg-[#48A15E]/20 dark:hover:bg-[#48A15E]/30"
                : "border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[#48A15E] animate-pulse" : "bg-gray-400 dark:bg-gray-600"}`} />
            {updatingStatus ? "Updating..." : isActive ? "Active" : "Offline"}
          </button>
        </div>
      </div>

      {/* XP Bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Level {level} Progress</span>
          <span className="text-xs text-[#115E54] font-bold tabular-nums">{volunteer?.totalXP ?? 0} XP</span>
        </div>
        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#115E54] to-[#48A15E] rounded-full transition-all duration-1000 ease-out"
            style={{ width: showBar ? `${xpProgress.pct}%` : "0%" }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{xpProgress.current} / {xpProgress.needed} XP</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">→ Level {Math.min(level + 1, LEVEL_THRESHOLDS.length)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Tasks Done" value={volunteer?.totalTasksCompleted ?? 0} icon={<CheckCircle size={18} />} color="text-[#2A8256] dark:text-[#48A15E]" />
        <StatCard label="Reputation" value={volunteer?.reputationScore ?? 100}   icon={<Shield size={18} />}      color="text-[#115E54]" />
        <StatCard label="Active Now" value={volunteer?.currentActiveTasks ?? 0}  icon={<Activity size={18} />}    color="text-amber-600 dark:text-amber-400" />
      </div>

      {/* Skills */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Star size={14} className="text-[#115E54]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Skills</h3>
          {volunteer?.skills?.length ? (
            <span className="ml-auto text-[10px] bg-[#115E54]/10 dark:bg-[#115E54]/20 text-[#115E54] px-1.5 py-0.5 rounded-full font-semibold">
              {volunteer.skills.length}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
          {(volunteer?.skills ?? []).map((skill) => (
            <span key={skill} className="flex items-center gap-1 bg-[#115E54]/8 dark:bg-[#115E54]/15 border border-[#115E54]/20 dark:border-[#115E54]/30 text-[#115E54] text-xs px-2.5 py-1 rounded-full">
              {skill}
              <button onClick={() => handleRemoveSkill(skill)} className="hover:text-red-500 dark:hover:text-red-400 transition-colors ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
          {(!volunteer?.skills || volunteer.skills.length === 0) && (
            <span className="text-gray-400 dark:text-gray-500 text-xs italic">No skills added yet</span>
          )}
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SKILL_PRESETS.filter((s) => !volunteer?.skills?.includes(s)).slice(0, 6).map((skill) => (
            <button
              key={skill}
              onClick={() => handleAddSkill(skill)}
              className="text-[10px] bg-gray-100 dark:bg-gray-800 hover:bg-[#115E54]/10 dark:hover:bg-[#115E54]/20 hover:text-[#115E54] border border-gray-200 dark:border-gray-700 hover:border-[#115E54]/20 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-full transition-all flex items-center gap-1"
            >
              <Plus size={8} /> {skill}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add custom skill..."
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSkill(newSkill)}
            className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-[#115E54]/40 placeholder-gray-400 dark:placeholder-gray-600"
          />
          <button
            onClick={() => handleAddSkill(newSkill)}
            className="bg-[#115E54] hover:bg-[#0d4a42] text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Achievements */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Award size={14} className="text-[#48A15E]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Achievements</h3>
          <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
            {achievements.filter(a => a.unlocked).length}/{achievements.length} unlocked
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {achievements.map((a) => (
            <div
              key={a.label}
              className={`rounded-xl p-3 border text-center transition-all ${
                a.unlocked
                  ? "border-[#48A15E]/30 dark:border-[#48A15E]/40 bg-gradient-to-b from-[#48A15E]/8 to-transparent dark:from-[#48A15E]/15 shadow-sm"
                  : "border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/60 opacity-40"
              }`}
            >
              <div className="text-xl mb-1">{a.unlocked ? a.icon : "🔒"}</div>
              <span className="text-[9px] text-gray-600 dark:text-gray-400 font-medium uppercase tracking-wide block leading-tight">{a.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
