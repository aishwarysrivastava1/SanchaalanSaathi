"use client";

import React, { useState } from "react";
import { useLeaderboard } from "../../../hooks/useLeaderboard";
import { useAuth } from "../../../lib/auth";
import { Trophy, Zap, CheckCircle, Search, Shield } from "lucide-react";

const MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:  "bg-neon-green text-neon-green",
  BUSY:    "bg-neon-orange text-neon-orange",
  OFFLINE: "bg-slate-600 text-slate-600",
};

function getLevel(xp: number) {
  const thresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000];
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
  }
  return Math.min(level, thresholds.length);
}

export default function LeaderboardPage() {
  const { leaders, loading } = useLeaderboard(20);
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const filtered = leaders.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  const myRank = leaders.findIndex(v => v.uid === user?.uid) + 1;

  return (
    <main className="p-5 pb-8">
      <div className="flex items-center gap-3 mb-5">
        <Trophy size={20} className="text-neon-orange" />
        <h1 className="text-lg font-black text-white tracking-widest font-mono">LEADERBOARD</h1>
      </div>

      {/* My rank banner */}
      {user && myRank > 0 && (
        <div className="hud-panel rounded-xl p-3 mb-4 flex items-center justify-between border border-neon-cyan/30">
          <span className="text-xs text-slate-400 font-mono">Your rank</span>
          <span className="text-neon-cyan font-black font-mono text-lg">#{myRank}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search volunteers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-300 outline-none focus:border-neon-cyan/50 font-mono placeholder-slate-600"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 bg-slate-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v, i) => {
            const rank = leaders.indexOf(v);
            const isMe = v.uid === user?.uid;
            const level = getLevel(v.totalXP);

            return (
              <div
                key={v.uid}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isMe
                    ? "border-neon-cyan/50 bg-neon-cyan/5 shadow-[0_0_15px_rgba(0,243,255,0.1)]"
                    : "border-slate-800 bg-slate-900/50"
                }`}
              >
                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {rank < 3 ? (
                    <span className="text-xl">{MEDAL[rank]}</span>
                  ) : (
                    <span className="text-slate-500 font-mono font-bold text-sm">#{rank + 1}</span>
                  )}
                </div>

                {/* Name + level */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm truncate ${isMe ? "text-neon-cyan" : "text-white"}`}>
                      {v.name}
                    </span>
                    <span className="text-[9px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                      LV{level}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(v.skills ?? []).slice(0, 3).map(s => (
                      <span key={s} className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded font-mono">{s}</span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1 text-neon-orange">
                    <Zap size={11} />
                    <span className="text-xs font-black font-mono">{v.totalXP}</span>
                  </div>
                  <div className="flex items-center gap-1 text-neon-green">
                    <CheckCircle size={11} />
                    <span className="text-[10px] font-mono">{v.totalTasksCompleted}</span>
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[v.availabilityStatus]?.split(" ")[0] ?? "bg-slate-600"}`} />
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-600 font-mono text-sm">
              No volunteers found.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
