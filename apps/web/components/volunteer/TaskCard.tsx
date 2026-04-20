"use client";

import React from "react";
import { FirestoreTask } from "../../lib/types";
import { Zap, MapPin, CheckCircle, Clock, Camera, ArrowRight } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  VERIFIED:  { label: "Verified",  color: "text-[#2A8256]",  bg: "bg-[#48A15E]/10",  border: "border-[#48A15E]/30" },
  CLAIMED:   { label: "Claimed",   color: "text-amber-700",  bg: "bg-amber-50",       border: "border-amber-200/60" },
  SUBMITTED: { label: "Submitted", color: "text-blue-600",   bg: "bg-blue-50",        border: "border-blue-200/60"  },
  OPEN:      { label: "Open",      color: "text-gray-500",   bg: "bg-gray-100",       border: "border-gray-200"     },
};

const LEFT_BORDER: Record<string, string> = {
  VERIFIED:  "border-l-[#48A15E]",
  CLAIMED:   "border-l-amber-400",
  SUBMITTED: "border-l-blue-400",
  OPEN:      "border-l-[#115E54]",
};

export default function TaskCard({ task, onClaim }: { task: FirestoreTask; onClaim?: (id: string) => void }) {
  const isHighXP  = task.xpReward > 50;
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.OPEN;
  const leftBorder = LEFT_BORDER[task.status] ?? "border-l-gray-300";
  const urgencyDot = isHighXP
    ? "bg-red-500 animate-pulse"
    : task.xpReward > 20
      ? "bg-amber-500"
      : "bg-[#48A15E]";

  return (
    <div className={`glass-card bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-4 ${leftBorder} rounded-xl p-4 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-[#115E54]/25 dark:hover:border-[#115E54]/40 transition-all duration-300 group cursor-default`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${urgencyDot}`} />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug truncate">{task.title}</h3>
        </div>
        <span className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-2 shadow-[0_2px_10px_rgba(245,158,11,0.1)]">
          <Zap size={9} className="fill-amber-500 animate-pulse" />
          +{task.xpReward} XP
        </span>
      </div>

      <p className="text-gray-500 dark:text-gray-400 text-xs mb-2.5 line-clamp-2 leading-relaxed">{task.description}</p>

      {task.location?.name && (
        <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 mb-3">
          <MapPin size={9} className="shrink-0 text-[#115E54]/50" />
          <span className="truncate">{task.location.name}</span>
        </div>
      )}

      <div className="flex justify-between items-center pt-2.5 border-t border-gray-100 dark:border-gray-800">
        <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] px-2 py-1 rounded-md font-medium">
          {task.requiredSkill}
        </span>

        {task.status === "OPEN" && onClaim ? (
          <button
            onClick={() => onClaim(task.id)}
            className="flex items-center gap-1.5 bg-[#115E54] hover:bg-[#0d4a42] text-white text-xs font-semibold py-1.5 px-4 rounded-lg transition-all duration-150 active:scale-[0.95] hover:shadow-md hover:shadow-[#115E54]/25 group-hover:gap-2"
          >
            Claim
            <ArrowRight size={11} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        ) : (
          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
            {task.status === "VERIFIED"  && <CheckCircle size={9} />}
            {task.status === "CLAIMED"   && <Clock size={9} />}
            {task.status === "SUBMITTED" && <Camera size={9} />}
            {statusCfg.label}
          </span>
        )}
      </div>
    </div>
  );
}
