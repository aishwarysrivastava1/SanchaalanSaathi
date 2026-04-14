"use client";

import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import { NeedNode } from "../../lib/types";
import { BarChart2 } from "lucide-react";

interface AnalyticsPanelProps {
  needs: NeedNode[];
  vols: any[];
}

const NEON_COLORS = ["#00f3ff", "#d900ff", "#ff4d00", "#00ff66", "#3b82f6", "#f59e0b"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900/95 border border-neon-cyan/30 rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      {label && <p className="text-slate-400 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  );
};

export default function AnalyticsPanel({ needs, vols }: AnalyticsPanelProps) {
  // Needs by type
  const byType = useMemo(() => {
    const counts: Record<string, number> = {};
    needs.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [needs]);

  // Status distribution for pie chart
  const statusDist = useMemo(() => {
    const pending  = needs.filter(n => n.status === "PENDING").length;
    const resolved = needs.filter(n => n.status === "RESOLVED").length;
    const other    = needs.length - pending - resolved;
    return [
      { name: "Pending",  value: pending,  color: "#ff4d00" },
      { name: "Resolved", value: resolved, color: "#00ff66" },
      { name: "Other",    value: other,    color: "#3b82f6"  },
    ].filter(d => d.value > 0);
  }, [needs]);

  // Urgency distribution — bucketed into Low / Medium / High / Critical
  const urgencyDist = useMemo(() => {
    const buckets = [
      { name: "Low",      min: 0,    max: 0.3,  count: 0, color: "#00ff66" },
      { name: "Medium",   min: 0.3,  max: 0.6,  count: 0, color: "#f59e0b" },
      { name: "High",     min: 0.6,  max: 0.8,  count: 0, color: "#ff4d00" },
      { name: "Critical", min: 0.8,  max: 1.01, count: 0, color: "#ef4444" },
    ];
    needs.forEach(n => {
      const b = buckets.find(b => n.urgency_score >= b.min && n.urgency_score < b.max);
      if (b) b.count++;
    });
    return buckets.map(b => ({ name: b.name, count: b.count, color: b.color }));
  }, [needs]);

  // Volunteer status breakdown
  const volStatus = useMemo(() => {
    const active  = vols.filter(v => v.availabilityStatus === "ACTIVE").length;
    const busy    = vols.filter(v => v.availabilityStatus === "BUSY").length;
    const offline = vols.filter(v => v.availabilityStatus === "OFFLINE").length;
    return [
      { name: "Active",  value: active,  color: "#00ff66" },
      { name: "Busy",    value: busy,    color: "#ff4d00" },
      { name: "Offline", value: offline, color: "#64748b" },
    ].filter(d => d.value > 0);
  }, [vols]);

  const isEmpty = needs.length === 0;

  return (
    <div className="hud-panel rounded-2xl p-5 border border-neon-cyan/15">
      <div className="flex items-center gap-2 mb-5">
        <BarChart2 size={15} className="text-neon-cyan" />
        <h3 className="text-xs font-black text-white tracking-[0.2em] uppercase font-mono">Analytics</h3>
        <span className="text-[10px] text-slate-600 font-mono ml-auto">{needs.length} total needs</span>
      </div>

      {isEmpty ? (
        <div className="h-40 flex items-center justify-center text-slate-600 text-xs font-mono border border-dashed border-slate-800 rounded-xl">
          No data yet — seed the database or ingest a report
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {/* Needs by Type — bar */}
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-3">Needs by Type</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={byType} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b", fontFamily: "monospace" }} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Count" radius={[3, 3, 0, 0]}>
                  {byType.map((_, i) => (
                    <Cell key={i} fill={NEON_COLORS[i % NEON_COLORS.length]} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status distribution — pie */}
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-3">Status Split</p>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={statusDist} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={3}>
                  {statusDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Pie>
                <Legend
                  iconSize={8}
                  formatter={(val) => <span style={{ fontSize: 9, fontFamily: "monospace", color: "#94a3b8" }}>{val}</span>}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Urgency distribution — bar */}
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-3">Urgency Levels</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={urgencyDist} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b", fontFamily: "monospace" }} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Count" radius={[3, 3, 0, 0]}>
                  {urgencyDist.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Volunteer status — pie */}
          <div>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-3">Volunteer Status</p>
            {vols.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-slate-700 text-[10px] font-mono">
                No volunteer data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={volStatus} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" paddingAngle={3}>
                    {volStatus.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                    ))}
                  </Pie>
                  <Legend
                    iconSize={8}
                    formatter={(val) => <span style={{ fontSize: 9, fontFamily: "monospace", color: "#94a3b8" }}>{val}</span>}
                  />
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
