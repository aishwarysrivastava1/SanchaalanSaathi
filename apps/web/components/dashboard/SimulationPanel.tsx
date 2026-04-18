"use client";

import React, { useState } from "react";
import { askGraphIntelligence, runComparisonSim } from "@/lib/api";
import { SimulationComparison } from "@/lib/types";
import { useToast } from "../../hooks/useToast";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Sparkles, MapPin, Users, AlertTriangle, TrendingUp,
  ChevronRight, Loader2, BarChart2, Zap, CheckCircle2
} from "lucide-react";

const PRESET_QUERIES = [
  { icon: AlertTriangle, label: "Critical needs",       color: "text-red-500",     bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",           query: "Show all critical and high-urgency needs that are still pending" },
  { icon: MapPin,        label: "Hotspot areas",        color: "text-orange-500",  bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800", query: "Which locations have the most unresolved needs?" },
  { icon: Users,         label: "Available volunteers", color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",         query: "List volunteers who are currently available and not assigned to any task" },
  { icon: TrendingUp,    label: "Top performers",       color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", query: "Who are the top 5 volunteers by tasks completed and XP?" },
];

function summariseResults(results: any[]): string {
  if (!results || results.length === 0) return "No data found for this query.";
  const count = results.length;
  return `Found ${count} result${count > 1 ? "s" : ""}.`;
}

function ResultCard({ item, index }: { item: any; index: number }) {
  const entries = Object.entries(item ?? {}).slice(0, 5);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 shadow-sm"
    >
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2 text-sm leading-relaxed">
          <span className="text-gray-400 dark:text-gray-500 shrink-0 capitalize min-w-[90px]">
            {k.replace(/_/g, " ")}
          </span>
          <span className="text-gray-800 dark:text-gray-200 font-medium truncate">
            {String(v ?? "—")}
          </span>
        </div>
      ))}
    </motion.div>
  );
}

export default function SimulationPanel() {
  const [query,      setQuery]      = useState("");
  const [comparison, setComparison] = useState<SimulationComparison | null>(null);
  const [results,    setResults]    = useState<any[] | null>(null);
  const [summary,    setSummary]    = useState<string>("");
  const [loading,    setLoading]    = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simSteps,   setSimSteps]   = useState(100);
  const { toast } = useToast();

  const runQuery = async (q: string) => {
    const trimmed = q.trim().slice(0, 300);
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setResults(null);
    setSummary("");
    try {
      const result = await askGraphIntelligence(trimmed);
      const data   = result?.results ?? [];
      setResults(data);
      setSummary(summariseResults(data));
      toast("Query completed.", "success");
    } catch {
      toast("Query failed — check your connection.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSimCompare = async () => {
    setSimLoading(true);
    const steps = Math.min(Math.max(simSteps, 10), 500);
    try {
      const result = await runComparisonSim(steps);
      if (result) {
        setComparison(result);
        toast("Strategy comparison complete.", "success");
      }
    } catch {
      toast("Simulation failed.", "error");
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-6 right-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-20 overflow-hidden">
      <div className="flex gap-0 max-h-80">

        {/* ── Graph Intelligence ───────────────────────────────── */}
        <div className="flex-1 flex flex-col p-5 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#115E54]/10 flex items-center justify-center">
              <Sparkles size={14} className="text-[#115E54]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-none">Ask the Knowledge Graph</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Ask in plain English — no technical knowledge needed</p>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder='e.g. "Which areas need food aid most urgently?"'
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl py-2.5 pl-9 pr-4 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#115E54]/50 placeholder-gray-400 dark:placeholder-gray-500"
                value={query}
                maxLength={300}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runQuery(query)}
              />
            </div>
            <motion.button
              onClick={() => runQuery(query)}
              disabled={loading || !query.trim()}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-1.5 bg-[#115E54] hover:bg-[#0d4a42] text-white px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shrink-0"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              Ask
            </motion.button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESET_QUERIES.map(({ icon: Icon, label, bg, color, query: q }) => (
              <motion.button
                key={label}
                onClick={() => runQuery(q)}
                disabled={loading}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 ${bg}`}
              >
                <Icon size={11} className={color} />
                {label}
              </motion.button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            <AnimatePresence mode="wait">
              {loading && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 size={14} className="animate-spin text-[#115E54]" />
                  Searching the knowledge graph…
                </motion.div>
              )}
              {!loading && results === null && (
                <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-sm text-gray-400 dark:text-gray-500 py-2">
                  Choose a quick question above or type your own.
                </motion.p>
              )}
              {!loading && results !== null && results.length === 0 && (
                <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-sm text-gray-500 dark:text-gray-400 py-2">
                  No results found. Try rephrasing your question.
                </motion.p>
              )}
              {!loading && results && results.length > 0 && (
                <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  <p className="text-xs font-semibold text-[#115E54] flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> {summary}
                  </p>
                  {results.slice(0, 4).map((item, i) => (
                    <ResultCard key={i} item={item} index={i} />
                  ))}
                  {results.length > 4 && (
                    <p className="text-xs text-gray-400 pl-1">+{results.length - 4} more results</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="w-px bg-gray-100 dark:bg-gray-700 my-4" />

        {/* ── Strategy Comparison ──────────────────────────────── */}
        <div className="w-[340px] shrink-0 flex flex-col p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#2A8256]/10 flex items-center justify-center">
              <BarChart2 size={14} className="text-[#2A8256]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-none">Strategy Comparison</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">See how AI dispatch improves outcomes</p>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <input
                type="number" min={10} max={500}
                value={simSteps}
                onChange={(e) => setSimSteps(parseInt(e.target.value) || 10)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 focus:border-[#115E54]/50 outline-none"
              />
              <div className="absolute -top-2 left-2.5 px-1 bg-white dark:bg-gray-900 text-[10px] text-gray-400 uppercase tracking-tight">Simulation steps</div>
            </div>
            <motion.button
              onClick={handleSimCompare}
              disabled={simLoading}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className="flex-[2] flex items-center justify-center gap-1.5 bg-[#2A8256] hover:bg-[#115E54] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {simLoading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {simLoading ? "Running…" : "Run Comparison"}
            </motion.button>
          </div>

          <div className="flex-1 flex gap-3 min-h-0">
            <AnimatePresence mode="wait">
              {comparison ? (
                <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex-1 flex gap-3">
                  <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase font-semibold">Baseline</span>
                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{comparison.comparison.baseline.completion_rate}%</div>
                    <div className="text-xs text-gray-500 mt-auto">{comparison.comparison.baseline.estimated_hours}h est.</div>
                  </div>
                  <div className="flex-1 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex flex-col gap-1">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold">AI Optimised</span>
                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{comparison.comparison.optimized.completion_rate}%</div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-auto">+{comparison.comparison.delta_completion_rate}% better</div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex-1 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center gap-2 text-center px-4">
                  <Zap size={18} className="text-gray-300 dark:text-gray-600" />
                  <p className="text-xs text-gray-400 dark:text-gray-500">Run a comparison to see how AI dispatch improves task completion.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
