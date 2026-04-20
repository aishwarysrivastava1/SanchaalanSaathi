"use client";

import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle, TrendingUp, Users, CheckCircle, Clock } from "lucide-react";
import { motion } from "motion/react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from "recharts";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type AnalyticsData = {
  task_completion_rate: number;
  avg_assignment_time_hours: number;
  skill_coverage: Record<string, number>;
  skill_gaps: string[];
  volunteer_utilization: number;
  total_assignments: number;
  completed_assignments: number;
};

const KPI_ICONS = [TrendingUp, Users, CheckCircle, Clock];
const KPI_LABELS = ["Completion Rate", "Volunteer Utilization", "Completed Assignments", "Avg Assignment Time"];

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!user) return;
    api.ngoAnalytics(user.token)
      .then((d) => setData(d as AnalyticsData))
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-[#48A15E]" />
    </div>
  );

  if (!user) return null;
  if (error) return (
    <div className="p-6">
      <div className="rounded-xl p-4 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <AlertCircle size={16} /> {error}
      </div>
    </div>
  );

  const kpiValues = [
    `${Math.round((data?.task_completion_rate ?? 0) * 100)}%`,
    `${Math.round((data?.volunteer_utilization ?? 0) * 100)}%`,
    `${data?.completed_assignments ?? 0} / ${data?.total_assignments ?? 0}`,
    `${Math.round(data?.avg_assignment_time_hours ?? 0)}h`,
  ];

  const skillEntries = Object.entries(data?.skill_coverage ?? {}).sort((a, b) => b[1] - a[1]);
  const maxSkill = skillEntries[0]?.[1] ?? 1;

  // Transform skill data for recharts
  const chartData = skillEntries.map(([skill, count]) => ({ skill, count }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-6"
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {KPI_LABELS.map((label, i) => {
          const Icon = KPI_ICONS[i];
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(42,130,86,0.18)", borderColor: "#95C78F" }}
              className="rounded-2xl border border-gray-200 p-5 flex items-start gap-4"
              style={{ background: "var(--card-bg)" }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, #2A8256 0%, #48A15E 100%)" }}
              >
                <Icon size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800">{kpiValues[i]}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                {i === 3 && <p className="text-[10px] text-gray-300 mt-0.5">from assign to accept</p>}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Skill coverage chart */}
      {chartData.length > 0 && (
        <motion.div
          whileHover={{ y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 shadow-sm p-5"
          style={{ background: "var(--card-bg)" }}
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Skill Coverage</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="skillGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2A8256" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2A8256" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="skill"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "8px", fontSize: "12px", color: "var(--card-text-primary)" }}
                cursor={{ stroke: "#2A8256", strokeWidth: 1, strokeDasharray: "4 2" }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#2A8256"
                strokeWidth={2}
                fill="url(#skillGrad)"
                dot={{ fill: "#2A8256", r: 3 }}
                activeDot={{ r: 5, fill: "#48A15E" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Skill gaps */}
      {(data?.skill_gaps ?? []).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 p-5"
          style={{ background: "rgba(251,191,36,0.06)" }}
        >
          <h2 className="text-sm font-semibold text-amber-800 mb-3">Skill Gaps</h2>
          <p className="text-xs text-amber-700 mb-3">Tasks require these skills but no volunteer currently has them:</p>
          <div className="flex flex-wrap gap-2">
            {data!.skill_gaps.map((s) => (
              <span key={s} className="text-xs bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-3 py-1 font-medium">
                {s}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {chartData.length === 0 && (data?.skill_gaps ?? []).length === 0 && (
        <motion.div
          whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400"
          style={{ background: "var(--card-bg)" }}
        >
          Not enough data yet. Create tasks and assign volunteers to see analytics.
        </motion.div>
      )}
    </motion.div>
  );
}
