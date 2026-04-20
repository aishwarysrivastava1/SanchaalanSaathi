"use client";

import React from "react";
import { AlertCircle, CheckCircle2, Users, TrendingUp, Target } from "lucide-react";
import { NeedNode } from "../../lib/types";

interface Card {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  color: string;
  iconBg: string;
  border: string;
}

export default function StatsBar({ needs, vols }: { needs: NeedNode[]; vols: any[] }) {
  const total      = needs.length;
  const pending    = needs.filter((n) => n.status === "PENDING").length;
  const resolved   = needs.filter((n) => n.status === "RESOLVED").length;
  const activeVols = vols.filter((v) => v.availabilityStatus === "ACTIVE").length;
  const coverage   = total ? Math.round((resolved / total) * 100) : 0;

  const cards: Card[] = [
    {
      label:   "Reports",
      value:   total,
      sub:     "total ingested",
      icon:    AlertCircle,
      color:   "text-[#115E54]",
      iconBg:  "bg-[#115E54]/10",
      border:  "border-[#115E54]/15 hover:border-[#115E54]/30",
    },
    {
      label:   "Pending",
      value:   pending,
      sub:     "needs attention",
      icon:    TrendingUp,
      color:   "text-amber-600",
      iconBg:  "bg-amber-50",
      border:  "border-amber-200/60 hover:border-amber-300/60",
    },
    {
      label:   "Resolved",
      value:   resolved,
      sub:     "successfully closed",
      icon:    CheckCircle2,
      color:   "text-[#2A8256]",
      iconBg:  "bg-[#48A15E]/10",
      border:  "border-[#48A15E]/20 hover:border-[#48A15E]/40",
    },
    {
      label:   "Volunteers",
      value:   activeVols,
      sub:     "active on field",
      icon:    Users,
      color:   "text-[#115E54]",
      iconBg:  "bg-[#115E54]/8",
      border:  "border-[#95C78F]/40 hover:border-[#48A15E]/40",
    },
    {
      label:   "Coverage",
      value:   `${coverage}%`,
      sub:     "resolution rate",
      icon:    Target,
      color:   coverage >= 70 ? "text-[#2A8256]" : coverage >= 40 ? "text-amber-600" : "text-red-500",
      iconBg:  coverage >= 70 ? "bg-[#48A15E]/10" : coverage >= 40 ? "bg-amber-50" : "bg-red-50",
      border:  "border-gray-200 hover:border-[#115E54]/20",
    },
  ];

  return (
    <div className="flex w-full gap-3 shrink-0">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            style={{ animationDelay: `${i * 60}ms` }}
            className={`flex-1 glass-card bg-white dark:bg-gray-900 border ${c.border} rounded-xl px-4 py-3 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col gap-1.5 animate-slide-up opacity-0 [animation-fill-mode:forwards] group`}
          >
            <div className="flex items-center justify-between">
              <div className={`${c.iconBg} p-1.5 rounded-lg`}>
                <Icon size={13} className={c.color} />
              </div>
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{c.label}</span>
            </div>
            <span className={`text-2xl font-bold ${c.color} leading-none tabular-nums`}>{c.value}</span>
            <span className="text-[10px] text-gray-400 leading-tight">{c.sub}</span>
          </div>
        );
      })}
    </div>
  );
}
