"use client";

import React, { useEffect, useState, useCallback } from "react";
import SynapseMap from "../../components/map/SynapseMap";
import StatsBar from "../../components/dashboard/StatsBar";
import NeedList from "../../components/dashboard/NeedList";
import FileUpload from "../../components/upload/FileUpload";
import SimulationPanel from "../../components/dashboard/SimulationPanel";
import AnalyticsPanel from "../../components/dashboard/AnalyticsPanel";
import { fetchNeeds, fetchVolunteers, fetchHotspots } from "../../lib/api";
import { NeedNode, HotspotResult } from "../../lib/types";

export default function Dashboard() {
  const [needs, setNeeds] = useState<NeedNode[]>([]);
  const [vols, setVols] = useState<any[]>([]);
  const [hotspots, setHotspots] = useState<HotspotResult[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<NeedNode | null>(null);

  const loadData = useCallback(async () => {
    try {
      const fetchedNeeds = await fetchNeeds();
      setNeeds(fetchedNeeds);
      
      const fetchedVols = await fetchVolunteers();
      setVols(fetchedVols);
      
      const fetchedHotspots = await fetchHotspots();
      setHotspots(fetchedHotspots);
    } catch (error) {
      console.error("Failed to sync dashboard data:", error);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll every 30s to keep in sync with backend logic
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="flex h-screen bg-transparent p-4 gap-4 overflow-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-neon-cyan/20 blur-[120px] pointer-events-none animate-glow-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-neon-purple/20 blur-[150px] pointer-events-none animate-glow-pulse" style={{animationDelay: '1s'}}></div>
      
      {/* Sidebar - NGO Tools */}
      <div className="w-1/4 flex flex-col min-w-[320px] z-10">
        <div className="hud-panel p-6 rounded-2xl mb-4 text-center">
          <h1 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-blue-500 font-mono drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]">
            SYNAPSE<span className="text-slate-400">_AI</span>
          </h1>
          <p className="text-xs text-neon-cyan/70 font-mono mt-1 tracking-[0.2em] uppercase">Tactical Command</p>
        </div>
        
        <FileUpload onUploadSuccess={loadData} />

        <div className="mt-4">
          <AnalyticsPanel needs={needs} vols={vols} />
        </div>

        <NeedList
          needs={needs}
          onNeedClick={(need) => setSelectedNeed(need)}
        />
      </div>
      
      {/* Main Panel - Command & Control */}
      <div className="flex-1 flex flex-col z-10">
        <StatsBar needs={needs} vols={vols} />
        <div className="flex-1 relative rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-neon-cyan/30">
           <SynapseMap 
             needs={needs} 
             hotspots={hotspots}
             onMarkerClick={(need) => setSelectedNeed(need)} 
           />
           
           {selectedNeed && (
             <div className="absolute top-6 right-6 hud-panel p-5 rounded-xl shadow-2xl w-80 z-10 animate-[slice-in_0.3s_ease-out]">
               <div className="flex items-center gap-3 border-b border-neon-cyan/30 pb-3 mb-3">
                 <div className="w-3 h-3 bg-neon-red rounded-full animate-pulse shadow-[0_0_10px_rgba(255,0,60,0.8)]"></div>
                 <h3 className="font-bold text-white tracking-widest">{selectedNeed.type.toUpperCase()}</h3>
               </div>
               <p className="text-sm text-slate-300 mb-4 font-medium leading-relaxed">{selectedNeed.description}</p>
               <div className="text-xs text-slate-400 flex flex-col gap-2 mb-4 bg-black/40 p-3 rounded border border-slate-700/50">
                 <div className="flex justify-between"><span>Severity Index:</span> <span className="text-neon-orange font-mono">{(selectedNeed.urgency_score * 10).toFixed(1)}/10.0</span></div>
                 <div className="flex justify-between"><span>System Status:</span> <span className={selectedNeed.status === 'RESOLVED' ? 'text-neon-green font-mono drop-shadow-[0_0_5px_rgba(0,255,102,0.5)]' : 'text-neon-red font-mono'}>{selectedNeed.status}</span></div>
               </div>
               <button onClick={() => setSelectedNeed(null)} className="w-full bg-slate-900/50 hover:bg-neon-cyan/20 border border-slate-700 hover:border-neon-cyan text-white text-xs py-2 rounded-lg transition-all tracking-widest font-bold">DISMISS</button>
             </div>
           )}
           
           <SimulationPanel />
        </div>
      </div>
    </div>
  );
}
