"use client";

import React, { useEffect, useState, useCallback } from "react";
import SynapseMap from "../../components/map/SynapseMap";
import StatsBar from "../../components/dashboard/StatsBar";
import NeedList from "../../components/dashboard/NeedList";
import FileUpload from "../../components/upload/FileUpload";
import SimulationPanel from "../../components/dashboard/SimulationPanel";
import AnalyticsPanel from "../../components/dashboard/AnalyticsPanel";
import NotificationBell from "../../components/dashboard/NotificationBell";
import TaskKanban from "../../components/dashboard/TaskKanban";
import VolunteerRegistration from "../../components/dashboard/VolunteerRegistration";
import { Map as MapIcon, LayoutDashboard, Radio } from "lucide-react";
import { fetchNeeds, fetchVolunteers, fetchHotspots } from "../../lib/api";
import { NeedNode, HotspotResult } from "../../lib/types";

export default function Dashboard() {
  const [needs, setNeeds] = useState<NeedNode[]>([]);
  const [vols, setVols] = useState<any[]>([]);
  const [hotspots, setHotspots] = useState<HotspotResult[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<NeedNode | null>(null);
  const [showVolunteers, setShowVolunteers] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'kanban'>('map');

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
      <div className="w-1/4 flex flex-col min-w-[320px] z-10 h-full overflow-y-auto custom-scrollbar pr-1">
        <div className="hud-panel p-6 rounded-2xl mb-4 text-center relative">
          <div className="absolute top-4 right-4">
            <NotificationBell />
          </div>
          <h1 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-blue-500 font-mono drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]">
            SYNAPSE<span className="text-slate-400">_AI</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mt-1 px-4">
             <Radio size={8} className="text-neon-cyan animate-pulse shrink-0" />
             <p className="text-[10px] text-neon-cyan/70 font-mono tracking-[0.2em] uppercase truncate">Tactical Link: Active</p>
          </div>
        </div>
        
        <FileUpload onUploadSuccess={loadData} />

        <div className="mt-4 flex gap-2">
           <button 
             onClick={() => setShowVolunteers(!showVolunteers)}
             className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-all text-[10px] font-bold tracking-widest uppercase ${
               showVolunteers 
               ? "bg-neon-purple/20 border-neon-purple text-neon-purple shadow-[0_0_10px_rgba(168,85,247,0.3)]" 
               : "bg-slate-900/50 border-slate-700 text-slate-500 hover:border-slate-500"
             }`}
           >
             <div className={`w-2 h-2 rounded-full ${showVolunteers ? "bg-neon-purple animate-pulse" : "bg-slate-700"}`}></div>
             Volunteer Layer
           </button>
           
           <div className="flex bg-slate-900/50 rounded-lg border border-slate-700 p-1">
             <button 
               onClick={() => setViewMode('map')}
               className={`p-1.5 rounded-md transition-all ${viewMode === 'map' ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-slate-500 hover:text-slate-300'}`}
               title="Map View"
             >
               <MapIcon className="w-4 h-4" />
             </button>
             <button 
               onClick={() => setViewMode('kanban')}
               className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-slate-500 hover:text-slate-300'}`}
               title="Kanban View"
             >
               <LayoutDashboard className="w-4 h-4" />
             </button>
           </div>
        </div>

        <div className="mt-4">
          <AnalyticsPanel needs={needs} vols={vols} />
        </div>

        <VolunteerRegistration onSuccess={loadData} />

        <NeedList
          needs={needs}
          onNeedClick={(need) => setSelectedNeed(need)}
        />
      </div>
      
      {/* Main Panel - Command & Control */}
      <div className="flex-1 flex flex-col z-10">
        <StatsBar needs={needs} vols={vols} />
        <div className="flex-1 relative rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-neon-cyan/30 bg-black/20">
           {viewMode === 'map' ? (
             <>
               <SynapseMap 
                 needs={needs} 
                 volunteers={vols}
                 hotspots={hotspots}
                 showVolunteers={showVolunteers}
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
             </>
           ) : (
             <div className="w-full h-full p-6 animate-[fade-in_0.4s_ease-out]">
                <TaskKanban />
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
