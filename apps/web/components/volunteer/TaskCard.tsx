"use client";

import React from "react";
import { FirestoreTask } from "../../lib/types";
import { Zap, MapPin } from "lucide-react";

export default function TaskCard({ task, onClaim }: { task: FirestoreTask; onClaim?: (id: string) => void }) {
  const isHighXP = task.xpReward > 50;
  const urgencyDot =
    isHighXP ? "bg-red-500 animate-pulse" :
    task.xpReward > 20 ? "bg-amber-500" :
    "bg-[#48A15E]";

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#115E54]/25 dark:hover:border-[#115E54]/40 transition-all active:scale-[0.99] cursor-default">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${urgencyDot}`} />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug truncate">{task.title}</h3>
        </div>
        <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2">
          <Zap size={9} />
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
            className="bg-[#115E54] hover:bg-[#0d4a42] text-white text-xs font-semibold py-1.5 px-4 rounded-lg transition-colors active:scale-[0.97]"
          >
            Claim Task
          </button>
        ) : (
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${
            task.status === "VERIFIED"   ? "text-[#2A8256]" :
            task.status === "CLAIMED"    ? "text-amber-600" :
            task.status === "SUBMITTED"  ? "text-blue-500" :
            "text-gray-400 dark:text-gray-500"
          }`}>
            {task.status}
          </span>
        )}
      </div>
    </div>
  );
}
