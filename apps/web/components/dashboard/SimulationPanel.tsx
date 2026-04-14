"use client";

import React, { useState } from "react";
import { askGraphIntelligence, runComparisonSim } from "@/lib/api";
import { SimulationComparison } from "@/lib/types";
import { useToast } from "../../hooks/useToast";

export default function SimulationPanel() {
  const [query, setQuery] = useState("");
  const [comparison, setComparison] = useState<SimulationComparison | null>(null);
  const [askResult, setAskResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [simSteps, setSimSteps] = useState(100);
  const { toast } = useToast();

  const handleSimCompare = async () => {
    const steps = Math.min(Math.max(simSteps, 10), 500);
    try {
      const result = await runComparisonSim(steps);
      if (result) {
        setComparison(result);
        toast("Parallel simulation completed.", "success");
      }
    } catch (e) {
      toast("Simulation interface error.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAskGraph = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const result = await askGraphIntelligence(query.slice(0, 200));
      setAskResult(result);
      toast("Query executed successfully.", "success");
    } catch (e) {
      toast("Neural link failed. Try again.", "error");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-6 right-6 hud-panel border border-neon-cyan/20 rounded-2xl p-5 shadow-[0_0_40px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,243,255,0.05)] flex gap-8 z-20 group max-h-72">
      
      {/* NLP Search */}
      <div className="flex-1 flex flex-col">
         <h3 className="text-neon-cyan font-black mb-3 text-sm uppercase tracking-[0.2em] drop-shadow-[0_0_5px_currentColor] flex items-center gap-2">
           <span className="w-2 h-2 bg-neon-cyan rounded-full animate-pulse"></span>
           Graph Intelligence
         </h3>
         <div className="flex gap-3">
            <div className="relative flex-1 group-hover:shadow-[0_0_15px_rgba(0,243,255,0.15)] transition-all rounded-lg">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neon-cyan animate-pulse font-mono">{">"}</div>
              <input 
                type="text" 
                placeholder="Query community intelligence..." 
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg py-2 pl-8 pr-12 text-sm text-neon-cyan focus:outline-none focus:border-neon-cyan/50 font-mono placeholder-slate-600 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]"
                value={query}
                maxLength={200}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskGraph()}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-mono text-slate-700 uppercase">
                {query.length}/200
              </div>
            </div>
            <button 
              onClick={handleAskGraph}
              disabled={loading}
              className="bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/50 text-neon-cyan px-6 rounded-lg text-sm font-bold transition-all shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:shadow-[0_0_15px_rgba(0,243,255,0.3)] tracking-widest uppercase"
            >
              Exec
            </button>
         </div>
         <div className="mt-4 flex-1 overflow-y-auto bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-neon-green/80 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
            {askResult ? (
              <pre className="whitespace-pre-wrap">{JSON.stringify(askResult.results, null, 2)}</pre>
            ) : "NLP-to-Cypher terminal standing by..."}
         </div>
      </div>

      <div className="w-[1px] bg-gradient-to-b from-transparent via-neon-cyan/30 to-transparent"></div>

      {/* Simulator - Strategy Comparison */}
      <div className="w-[400px] flex flex-col min-w-[380px]">
        <h3 className="text-neon-purple font-black mb-3 text-sm uppercase tracking-[0.2em] drop-shadow-[0_0_5px_currentColor] flex items-center gap-2">
           <span className="w-2 h-2 bg-neon-purple rounded-full animate-pulse"></span>
           Strategy Comparison Model
        </h3>
        <div className="flex gap-2 mb-4">
           <div className="relative flex-1">
             <input 
               type="number" 
               min={10} 
               max={500} 
               value={simSteps}
               onChange={(e) => setSimSteps(parseInt(e.target.value) || 10)}
               className="w-full bg-black/40 border border-slate-800 rounded-lg px-3 py-2 text-xs text-neon-purple focus:border-neon-purple/50 outline-none font-mono"
             />
             <div className="absolute -top-2 left-2 px-1 bg-slate-950 text-[8px] text-slate-500 uppercase tracking-tighter">Horizon</div>
           </div>
           <button 
             onClick={handleSimCompare}
             disabled={loading}
             className="flex-[2] bg-neon-purple/10 hover:bg-neon-purple/20 text-neon-purple border border-neon-purple/50 px-4 py-2 rounded-lg text-[10px] font-bold transition-all tracking-widest uppercase hover:shadow-[0_0_15px_rgba(217,0,255,0.2)]"
           >
             {loading ? "Simulating..." : "Run Parallel Match"}
           </button>
        </div>
        
        <div className="flex-1 flex gap-3">
          {comparison ? (
            <>
              <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase font-mono mb-2">A: Baseline</span>
                <div className="text-lg font-black text-white">{comparison.comparison.baseline.completion_rate}%</div>
                <div className="text-[10px] text-slate-400 mt-auto">{comparison.comparison.baseline.estimated_hours}h estimated</div>
              </div>
              
              <div className="w-[1px] bg-slate-800"></div>
              
              <div className="flex-1 bg-slate-950/80 border border-neon-purple/30 rounded-lg p-3 flex flex-col shadow-[inset_0_0_10px_rgba(217,0,255,0.05)]">
                <span className="text-neon-purple text-[10px] uppercase font-mono mb-2">B: Optimized</span>
                <div className="text-lg font-black text-white">{comparison.comparison.optimized.completion_rate}%</div>
                <div className="text-[10px] text-neon-green mt-auto">+{comparison.comparison.delta_completion_rate}% lift</div>
              </div>
            </>
          ) : (
            <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex items-center justify-center opacity-30 text-[10px] uppercase tracking-widest text-slate-500">
               Awaiting Scenario Initiation
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}
