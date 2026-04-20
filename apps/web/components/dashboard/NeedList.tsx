"use client";

import React, { useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { NeedNode } from "../../lib/types";

export default function NeedList({ needs, onNeedClick }: { needs: NeedNode[]; onNeedClick: (need: NeedNode) => void }) {
  const [filter, setFilter] = useState("ALL");

  const filtered = needs
    .filter((n) => filter === "ALL" || n.status === filter)
    .sort((a, b) => b.urgency_score - a.urgency_score);

  return (
    <div className="flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm mt-2 flex-1 min-h-[200px] glass-card">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/60 dark:bg-black/20">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800 text-sm">Live Reports</h2>
          {needs.length > 0 && (
            <span className="bg-[#115E54]/10 text-[#115E54] text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {filtered.length}
            </span>
          )}
        </div>
        <select
          className="bg-white dark:bg-gray-900 text-xs px-2 py-1 rounded-lg text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 outline-none focus:border-[#115E54]/40 transition-all font-medium"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-600">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
              <AlertCircle size={18} className="text-gray-300 dark:text-gray-700" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No reports found</p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
              {needs.length === 0 ? "Ingest a report to get started" : "Try changing the filter"}
            </p>
          </div>
        ) : (
          filtered.map((need) => (
            <div
              key={need.id}
              onClick={() => onNeedClick(need)}
              className="group cursor-pointer p-3 mb-1.5 rounded-lg hover:bg-[#115E54]/5 dark:hover:bg-[#48A15E]/10 transition-all border border-transparent hover:border-[#115E54]/15 dark:hover:border-[#48A15E]/30 hover:shadow-sm"
            >
              <div className="flex justify-between items-start mb-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    need.urgency_score >= 0.8 ? "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                    need.urgency_score >= 0.5 ? "bg-amber-500" : "bg-[#48A15E]"
                  }`} />
                  <span className="font-semibold text-gray-800 dark:text-gray-200 text-xs capitalize">{need.type}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                  need.status === "RESOLVED"
                    ? "bg-[#48A15E]/10 text-[#2A8256]"
                    : "bg-amber-50 text-amber-700 border border-amber-200/60"
                }`}>
                  {need.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-1.5">{need.description}</p>
              {need.location?.name && (
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <MapPin size={9} className="shrink-0" />
                  <span className="truncate">{need.location.name}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
