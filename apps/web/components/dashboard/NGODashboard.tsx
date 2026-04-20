"use client";

import React, { useEffect, useState, useCallback } from "react";
import DeploymentMap from "../map/DeploymentMap";
import StatsBar from "./StatsBar";
import NeedList from "./NeedList";
import FileUpload from "../upload/FileUpload";
import SimulationPanel from "./SimulationPanel";
import AnalyticsPanel from "./AnalyticsPanel";
import NotificationBell from "./NotificationBell";
import TaskKanban from "./TaskKanban";
import VolunteerRegistration from "./VolunteerRegistration";
import { Skeleton, SkeletonCircle, SkeletonText } from "../ui/Skeleton";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Map as MapIcon, LayoutDashboard, Users, LogOut, Activity, Zap, AlertTriangle, CheckCircle2, UserPlus } from "lucide-react";
import { fetchVolunteers, fetchHotspots } from "../../lib/api";
import { HotspotResult, NeedNode } from "../../lib/types";
import { useNeeds } from "../../hooks/useFirestore";
import { useActivityFeed } from "../../hooks/useActivityFeed";
import { useAuth } from "../../lib/auth";
import { useRouter } from "next/navigation";

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  NEED_REPORTED:   <AlertTriangle size={12} className="text-red-500" />,
  TASK_ASSIGNED:   <Zap size={12} className="text-amber-500" />,
  TASK_VERIFIED:   <CheckCircle2 size={12} className="text-[#48A15E]" />,
  VOLUNTEER_JOINED:<UserPlus size={12} className="text-[#115E54]" />,
};

function timeAgo(ts: any): string {
  if (!ts) return "";
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function NGODashboard() {
  const { signOut } = useAuth();
  const router = useRouter();

  // ── Real-time Firestore data ────────────────────────────────────────────────
  const { needs: firestoreNeeds, loading: needsLoading } = useNeeds();
  const { events: activityEvents } = useActivityFeed(15);

  // ── API-fetched data (spatial / hotspot, keep polling for map accuracy) ─────
  const [vols, setVols]           = useState<any[]>([]);
  const [hotspots, setHotspots]   = useState<HotspotResult[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<NeedNode | null>(null);
  const [showVolunteers, setShowVolunteers] = useState(false);
  const [viewMode, setViewMode]   = useState<"map" | "kanban">("map");

  const loadSpatialData = useCallback(async () => {
    try {
      const [fetchedVols, fetchedHotspots] = await Promise.all([
        fetchVolunteers(),
        fetchHotspots(),
      ]);
      setVols(fetchedVols);
      setHotspots(fetchedHotspots);
    } catch (err) {
      console.error("Failed to load spatial data:", err);
    }
  }, []);

  useEffect(() => {
    loadSpatialData();
    const interval = setInterval(loadSpatialData, 30000);
    return () => clearInterval(interval);
  }, [loadSpatialData]);

  // Map Firestore needs → NeedNode shape for map/list components
  const needs: NeedNode[] = firestoreNeeds.map((n) => ({
    id: n.id,
    type: n.type,
    sub_type: n.sub_type,
    description: n.description,
    urgency_score: n.urgency_score,
    population_affected: n.population_affected,
    status: n.status,
    location: n.location,
  }));

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const cards = document.querySelectorAll('.glass-card');
    cards.forEach((card) => {
      const rect = (card as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      (card as HTMLElement).style.setProperty('--mouse-x', `${x}px`);
      (card as HTMLElement).style.setProperty('--mouse-y', `${y}px`);
    });
  };

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFB] dark:bg-[#072921]" onMouseMove={handleMouseMove}>

      {/* ── Top Nav ───────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-5 gap-3 shrink-0 z-20 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/logo-icon.png" alt="logo" className="h-8 w-8 object-contain shrink-0" />
        <div className="leading-none">
          <p className="text-sm font-bold text-[#115E54]">Sanchaalan Saathi</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">NGO Command Centre</p>
        </div>

        {/* Real-time indicator */}
        <div className="hidden sm:flex items-center gap-1.5 ml-3 bg-[#48A15E]/10 dark:bg-[#48A15E]/20 border border-[#48A15E]/25 text-[#2A8256] dark:text-[#48A15E] text-[10px] font-bold px-2.5 py-1 rounded-full animate-glow-pulse shadow-[0_0_12px_rgba(72,161,94,0.15)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#48A15E] shadow-[0_0_8px_rgba(72,161,94,0.6)]" />
          LIVE COMMAND
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowVolunteers(!showVolunteers)}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all ${
              showVolunteers
                ? "bg-[#115E54]/10 border-[#115E54]/30 text-[#115E54]"
                : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Users size={13} />
            Volunteers
          </button>

          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
            <button
              onClick={() => setViewMode("map")}
              title="Map View"
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "map"
                  ? "bg-white dark:bg-gray-700 text-[#115E54] shadow-sm"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              <MapIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              title="Kanban View"
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "kanban"
                  ? "bg-white dark:bg-gray-700 text-[#115E54] shadow-sm"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
          </div>

          <ThemeToggle size="sm" />
          <NotificationBell />

          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-900 transition-all"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-[300px] xl:w-[340px] shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-[fade-in_0.4s_ease-out]">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            <FileUpload onUploadSuccess={loadSpatialData} />
            <AnalyticsPanel needs={needs} vols={vols} />
            <VolunteerRegistration onSuccess={loadSpatialData} />
            {needsLoading ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
                <Skeleton width="40%" height="1.2rem" />
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3">
                      <SkeletonCircle size={32} />
                      <div className="flex-1">
                        <Skeleton width="70%" className="mb-2" />
                        <Skeleton width="40%" height="0.6rem" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <NeedList needs={needs} onNeedClick={(need) => setSelectedNeed(need)} />
            )}

            {/* ── Real-time Activity Feed ────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <Activity size={14} className="text-[#115E54]" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Live Activity</span>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#48A15E] animate-pulse" />
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {needsLoading ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <SkeletonCircle size={12} className="mt-1" />
                        <div className="flex-1">
                          <Skeleton width="60%" className="mb-1" />
                          <Skeleton width="90%" height="0.5rem" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activityEvents.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-5">
                    No activity yet
                  </p>
                ) : (
                  activityEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="mt-0.5 shrink-0">
                        {ACTIVITY_ICON[event.type] ?? <Activity size={12} className="text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{event.title}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{event.description}</p>
                      </div>
                      <span className="text-[9px] text-gray-400 dark:text-gray-600 shrink-0 mt-0.5 tabular-nums">
                        {timeAgo(event.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden animate-[fade-in_0.5s_ease-out]">
          <StatsBar needs={needs} vols={vols} />

          <div className="flex-1 relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
            {viewMode === "map" ? (
              <>
                <DeploymentMap />

                {selectedNeed && (
                  <div className="absolute top-4 right-4 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-5 w-72 z-10 animate-[slice-in_0.3s_ease-out]">
                    <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3 mb-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        selectedNeed.urgency_score >= 0.7 ? "bg-red-500" : "bg-amber-500"
                      }`} />
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{selectedNeed.type.toUpperCase()}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{selectedNeed.description}</p>
                    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-3 text-xs text-gray-500 dark:text-gray-400 space-y-1.5 mb-4">
                      <div className="flex justify-between">
                        <span>Severity Index:</span>
                        <span className="font-semibold text-amber-600">{(selectedNeed.urgency_score * 10).toFixed(1)}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <span className={`font-semibold ${selectedNeed.status === "RESOLVED" ? "text-[#2A8256]" : "text-red-500"}`}>
                          {selectedNeed.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedNeed(null)}
                      className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs py-2 rounded-lg transition-all font-semibold"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <SimulationPanel />
              </>
            ) : (
              <div className="w-full h-full p-4 animate-[fade-in_0.4s_ease-out] overflow-hidden">
                <TaskKanban />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
