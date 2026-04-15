"use client";

import React, { useState } from "react";
import { useLeaderboard } from "../../../hooks/useLeaderboard";
import { useAuth } from "../../../lib/auth";
import { Trophy, Zap, CheckCircle, Search, Medal } from "lucide-react";

const MEDAL_ICON = ["🥇", "🥈", "🥉"];

const STATUS_DOT: Record<string, string> = {
  ACTIVE:  "bg-[#48A15E]",
  BUSY:    "bg-amber-500",
  OFFLINE: "bg-gray-300 dark:bg-gray-600",
};

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000];

function getLevel(xp: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, LEVEL_THRESHOLDS.length);
}

export default function LeaderboardPage() {
  const { leaders, loading } = useLeaderboard(20);
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const filtered = leaders.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  const myRank = leaders.findIndex((v) => v.uid === user?.uid) + 1;

  return (
    <main className="p-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="bg-[#115E54]/10 dark:bg-[#115E54]/20 p-2 rounded-xl">
          <Trophy size={16} className="text-[#115E54]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">Leaderboard</h1>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Top volunteers by XP earned</p>
        </div>
      </div>

      {/* My rank banner */}
      {user && myRank > 0 && (
        <div className="bg-gradient-to-r from-[#115E54]/8 to-[#48A15E]/5 dark:from-[#115E54]/15 dark:to-[#48A15E]/10 border border-[#115E54]/20 dark:border-[#115E54]/30 rounded-xl p-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Medal size={14} className="text-[#115E54]" />
            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Your ranking</span>
          </div>
          <span className="text-[#115E54] font-bold text-lg tabular-nums">#{myRank}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          placeholder="Search volunteers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-[#115E54]/40 placeholder-gray-400 dark:placeholder-gray-600 shadow-sm transition-colors"
        />
      </div>

      {/* Podium */}
      {!search && !loading && filtered.length >= 3 && (
        <div className="flex items-end justify-center gap-2 mb-5 px-4">
          {/* 2nd */}
          <div className="flex-1 flex flex-col items-center">
            <div className="text-2xl mb-1">🥈</div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-t-xl pt-3 pb-2 text-center">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate px-1">{filtered[1]?.name.split(" ")[0]}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center gap-0.5 mt-0.5">
                <Zap size={9} />{filtered[1]?.totalXP}
              </p>
            </div>
          </div>
          {/* 1st */}
          <div className="flex-1 flex flex-col items-center">
            <div className="text-3xl mb-1">🥇</div>
            <div className="w-full bg-gradient-to-b from-[#115E54]/10 to-[#115E54]/5 dark:from-[#115E54]/20 dark:to-[#115E54]/10 border border-[#115E54]/25 dark:border-[#115E54]/35 rounded-t-xl pt-4 pb-2 text-center">
              <p className="text-xs font-bold text-[#115E54] truncate px-1">{filtered[0]?.name.split(" ")[0]}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center gap-0.5 mt-0.5">
                <Zap size={9} />{filtered[0]?.totalXP}
              </p>
            </div>
          </div>
          {/* 3rd */}
          <div className="flex-1 flex flex-col items-center">
            <div className="text-2xl mb-1">🥉</div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-t-xl pt-2 pb-2 text-center">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate px-1">{filtered[2]?.name.split(" ")[0]}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center gap-0.5 mt-0.5">
                <Zap size={9} />{filtered[2]?.totalXP}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-white dark:bg-gray-900 rounded-xl animate-pulse border border-gray-200 dark:border-gray-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const rank = leaders.indexOf(v);
            const isMe = v.uid === user?.uid;
            const level = getLevel(v.totalXP);

            return (
              <div
                key={v.uid}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isMe
                    ? "border-[#115E54]/30 dark:border-[#115E54]/40 bg-gradient-to-r from-[#115E54]/5 to-transparent dark:from-[#115E54]/10"
                    : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {rank < 3 ? (
                    <span className="text-xl">{MEDAL_ICON[rank]}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 font-semibold text-sm tabular-nums">#{rank + 1}</span>
                  )}
                </div>

                {/* Name + level + skills */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm truncate ${isMe ? "text-[#115E54]" : "text-gray-900 dark:text-gray-100"}`}>
                      {v.name}
                    </span>
                    <span className="text-[9px] bg-[#115E54]/8 dark:bg-[#115E54]/20 border border-[#115E54]/20 dark:border-[#115E54]/30 text-[#115E54] px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                      Lv{level}
                    </span>
                    {isMe && (
                      <span className="text-[9px] bg-[#48A15E]/10 dark:bg-[#48A15E]/20 text-[#2A8256] dark:text-[#48A15E] px-1.5 py-0.5 rounded-full font-semibold shrink-0">You</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(v.skills ?? []).slice(0, 3).map((s) => (
                      <span key={s} className="text-[9px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Zap size={11} />
                    <span className="text-xs font-bold tabular-nums">{v.totalXP}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#2A8256] dark:text-[#48A15E]">
                    <CheckCircle size={11} />
                    <span className="text-[10px] tabular-nums">{v.totalTasksCompleted}</span>
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[v.availabilityStatus] ?? "bg-gray-300 dark:bg-gray-600"}`} />
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              No volunteers found matching &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      )}
    </main>
  );
}
