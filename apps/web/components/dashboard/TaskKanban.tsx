"use client";

import React from "react";
import { useTasks } from "../../hooks/useFirestore";
import { FirestoreTask } from "../../lib/types";
import { Clock, MapPin, Shield, Zap } from "lucide-react";

const COLUMNS = [
  { id: "OPEN", label: "Open Ops", color: "border-neon-cyan/50 text-neon-cyan" },
  { id: "CLAIMED", label: "Claimed", color: "border-neon-purple/50 text-neon-purple" },
  { id: "SUBMITTED", label: "Submitted", color: "border-neon-orange/50 text-neon-orange" },
  { id: "VERIFIED", label: "Verified", color: "border-neon-green/50 text-neon-green" },
];

export default function TaskKanban() {
  const { tasks, loading } = useTasks();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-neon-cyan/50 text-xs tracking-[0.3em] uppercase">
        Establishing Link to Neural Grid...
      </div>
    );
  }

  const getUrgencyColor = (score: number) => {
    if (score >= 0.8) return "text-neon-red bg-neon-red/10 border-neon-red/30";
    if (score >= 0.5) return "text-neon-orange bg-neon-orange/10 border-neon-orange/30";
    return "text-neon-green bg-neon-green/10 border-neon-green/30";
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-4 custom-scrollbar">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.id);
        
        return (
          <div key={col.id} className="flex-1 min-w-[280px] flex flex-col">
            <div className={`mb-4 px-4 py-2 hud-panel rounded-lg border-b-2 ${col.color.split(' ')[0]} flex justify-between items-center`}>
              <h3 className={`text-[10px] font-black tracking-[0.2em] uppercase ${col.color.split(' ')[1]}`}>{col.label}</h3>
              <span className="text-[10px] font-mono opacity-50 bg-black/40 px-2 py-0.5 rounded-full">{columnTasks.length}</span>
            </div>
            
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
              {columnTasks.length === 0 ? (
                <div className="hud-panel p-6 rounded-xl border-dashed border-slate-800 text-center opacity-30">
                  <p className="text-[9px] font-mono uppercase tracking-widest">No Signals</p>
                </div>
              ) : (
                columnTasks.map((task) => (
                  <div key={task.id} className="hud-panel p-4 rounded-xl border border-white/5 hover:border-neon-cyan/30 transition-all group cursor-pointer animate-[fade-in_0.3s_ease-out] bg-black/20">
                    <div className="flex justify-between items-center mb-3">
                       <span className={`text-[9px] px-2 py-0.5 rounded border-l-2 font-mono font-bold tracking-tighter ${getUrgencyColor(task.urgency || 0.5)}`}>
                         {((task.urgency || 0.5) * 10).toFixed(1)} CRIT
                       </span>
                       <span className="text-[9px] font-mono text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">#{task.id.slice(-4).toUpperCase()}</span>
                    </div>
                    
                    <h4 className="text-xs font-bold text-slate-200 mb-2 group-hover:text-neon-cyan transition-colors line-clamp-1 uppercase tracking-tight">{task.title}</h4>
                    <p className="text-[10px] text-slate-500 mb-4 line-clamp-2 leading-relaxed font-medium">{task.description}</p>
                    
                    <div className="space-y-2.5 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-2 text-[9px] text-slate-400">
                        <MapPin className="w-3 h-3 text-neon-cyan/60" />
                        <span className="truncate tracking-wide uppercase font-mono">{task.location?.name || "Unknown Area"}</span>
                      </div>
                      <div className="flex justify-between items-center">
                         <div className="flex items-center gap-1.5 text-[9px] font-bold text-neon-orange/80">
                           <Zap className="w-3 h-3" />
                           <span className="tracking-widest">{task.xpReward} XP</span>
                         </div>
                         <div className="flex items-center gap-1 text-[9px] text-slate-600 font-mono">
                           <Clock className="w-3 h-3" />
                           <span>{task.createdAt?.toDate ? 
                             Math.floor((Date.now() - task.createdAt.toDate().getTime()) / 60000) : 
                             (task.createdAt?.getTime ? Math.floor((Date.now() - task.createdAt.getTime()) / 60000) : 0)}m</span>
                         </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
