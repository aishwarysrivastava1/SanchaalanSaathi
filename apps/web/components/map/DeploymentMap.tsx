"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { useMapController } from "./hooks/useMapController";
import { useTheme } from "../ui/ThemeProvider";
import CustomHtmlMarker from "./markers/CustomHtmlMarker";
import FilterBar from "./ui/FilterBar";
import EntityDetailPanel from "./ui/EntityDetailPanel";
import { VolunteerPin, OperationPin, ResourcePin } from "./data/types";
import { api } from "../../lib/ngo-api";
import type { RealtimeEventEnvelope } from "../../lib/types";
import { useNGOAuth } from "../../lib/ngo-auth";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket";

// ── CSS keyframes injected once into <head> ───────────────────────────────────
const MAP_CSS = `
@keyframes pulse-ring {
  0%   { transform:translate(-50%,-50%) scale(1);   opacity:0.5; }
  100% { transform:translate(-50%,-50%) scale(2.2); opacity:0;   }
}
@keyframes urgency-ring {
  0%   { transform:translate(-50%,-50%) scale(1);   opacity:0.6; }
  100% { transform:translate(-50%,-50%) scale(2.6); opacity:0;   }
}
.vol-marker         { position:relative; cursor:pointer; }
.vol-pulse::before  {
  content:""; position:absolute; left:50%; top:50%;
  width:100%; height:100%; border-radius:50%;
  background:rgba(149,199,143,0.35);
  animation:pulse-ring 1.8s ease-out infinite;
  pointer-events:none;
}
.op-critical::before {
  content:""; position:absolute; left:50%; top:50%;
  width:100%; height:100%; border-radius:20px;
  background:rgba(239,68,68,0.3);
  animation:urgency-ring 1.4s ease-out infinite;
  pointer-events:none;
}
.map-tooltip {
  position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%);
  background:rgba(11,61,54,0.95); color:#fff; font-size:11px; font-weight:600;
  padding:4px 10px; border-radius:8px; white-space:nowrap; pointer-events:none;
  opacity:0; transition:opacity 0.15s; border:1px solid rgba(255,255,255,0.12);
  box-shadow:0 4px 12px rgba(0,0,0,0.2);
}
.map-theme-dark .map-tooltip {
  background:rgba(18,38,34,0.96);
  color:#F5F6F1;
  border-color:rgba(35,71,62,0.85);
  box-shadow:0 8px 24px rgba(0,0,0,0.4);
}
.vol-marker:hover .map-tooltip,
.res-marker:hover .map-tooltip,
.op-marker:hover  .map-tooltip  { opacity:1; }
.vol-inner, .res-inner, .op-inner { transition:transform 0.15s, box-shadow 0.15s; }
.vol-marker:hover .vol-inner,
.res-marker:hover .res-inner    { transform:scale(1.12) !important; box-shadow:0 8px 24px rgba(0,0,0,0.28) !important; }
.op-marker:hover  .op-inner     { transform:scale(1.06) !important; box-shadow:0 8px 24px rgba(0,0,0,0.28) !important; }
@keyframes cluster-pulse {
  0%   { transform:translate(-50%,-50%) scale(1);   opacity:0.4; }
  100% { transform:translate(-50%,-50%) scale(1.9); opacity:0;   }
}
.cluster-marker { position:relative; cursor:pointer; }
.cluster-marker::before {
  content:""; position:absolute; left:50%; top:50%;
  width:100%; height:100%; border-radius:50%;
  background:rgba(42,130,86,0.3);
  animation:cluster-pulse 2s ease-out infinite;
  pointer-events:none;
}
.map-theme-dark .cluster-marker::before {
  background:rgba(149,199,143,0.25);
}
`;

// ── Volunteer marker ──────────────────────────────────────────────────────────
function VolMarker({ data, selected, onClick, isDark }: {
  data: VolunteerPin; selected: boolean; onClick: () => void; isDark: boolean;
}) {
  const borderColor = selected ? (isDark ? "#48A15E" : "#115E54") : data.status === "available" ? "#95C78F" : "#d97706";
  const bg = selected
    ? "linear-gradient(135deg,#115E54,#2A8256)"
    : data.status === "available"
      ? "linear-gradient(135deg,#1a6b4a,#2A8256)"
      : "linear-gradient(135deg,#92400e,#d97706)";

  return (
    <div className={`vol-marker ${data.status === "available" ? "vol-pulse" : ""}`} onClick={onClick}>
      <div
        className="vol-inner"
        style={{
          width: 36, height: 36, borderRadius: "50%", background: bg,
          border: `3px solid ${borderColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 12, fontWeight: 700,
          boxShadow: selected
            ? isDark
              ? "0 0 0 3px rgba(149,199,143,0.3), 0 8px 24px rgba(0,0,0,0.45)"
              : "0 0 0 3px rgba(17,94,84,0.4)"
            : isDark
              ? "0 4px 12px rgba(0,0,0,0.45)"
              : "0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        {data.initials}
      </div>
      <div className="map-tooltip">{data.name} · {data.status}</div>
    </div>
  );
}

// ── Resource marker ───────────────────────────────────────────────────────────
const RES_ICONS: Record<string, string> = { medical: "💊", food: "🍱", equipment: "🔧" };

function ResMarker({ data, selected, onClick, isDark }: {
  data: ResourcePin; selected: boolean; onClick: () => void; isDark: boolean;
}) {
  return (
    <div className="res-marker" onClick={onClick} style={{ cursor: "pointer" }}>
      <div
        className="res-inner"
        style={{
          width: 30, height: 30,
          background: selected ? (isDark ? "#48A15E" : "#115E54") : "#2A8256",
          transform: "rotate(45deg)",
          borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: selected
            ? isDark
              ? "0 0 0 3px rgba(149,199,143,0.3), 0 8px 24px rgba(0,0,0,0.45)"
              : "0 0 0 3px rgba(17,94,84,0.4)"
            : isDark
              ? "0 4px 12px rgba(0,0,0,0.45)"
              : "0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        <span style={{ transform: "rotate(-45deg)", fontSize: 14, lineHeight: 1 }}>
          {RES_ICONS[data.type] ?? "📦"}
        </span>
      </div>
      <div className="map-tooltip">{data.title} · {data.stock} units</div>
    </div>
  );
}

// ── Operation marker ──────────────────────────────────────────────────────────
const OP_BG: Record<string, string> = {
  critical:  "rgba(220,38,38,0.92)",
  active:    "rgba(17,94,84,0.92)",
  completed: "rgba(71,85,105,0.85)",
};

function OpMarker({ data, selected, onClick, isDark }: {
  data: OperationPin; selected: boolean; onClick: () => void; isDark: boolean;
}) {
  return (
    <div
      className={`op-marker ${data.status === "critical" ? "op-critical" : ""}`}
      onClick={onClick}
      style={{ cursor: "pointer", position: "relative" }}
    >
      <div
        className="op-inner"
        style={{
          background: selected ? (isDark ? "#48A15E" : "#115E54") : OP_BG[data.status],
          borderRadius: 20, padding: "5px 12px",
          color: "#fff", fontSize: 11, fontWeight: 700,
          maxWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          boxShadow: selected
            ? isDark
              ? "0 0 0 3px rgba(149,199,143,0.3), 0 8px 24px rgba(0,0,0,0.45)"
              : "0 0 0 3px #fff, 0 8px 24px rgba(0,0,0,0.3)"
            : isDark
              ? "0 4px 16px rgba(0,0,0,0.45)"
              : "0 4px 16px rgba(0,0,0,0.25)",
          border: selected ? `2px solid ${isDark ? "#95C78F" : "rgba(255,255,255,0.8)"}` : "1.5px solid rgba(255,255,255,0.25)",
        }}
      >
        {data.title.length > 18 ? data.title.slice(0, 18) + "…" : data.title}
      </div>
      <div className="map-tooltip">{data.assigned}/{data.needed} volunteers · {data.status}</div>
    </div>
  );
}

// ── Cluster marker ────────────────────────────────────────────────────────────
function ClusterMarker({ count, label, onClick, isDark }: { count: number; label: string; onClick: () => void; isDark: boolean }) {
  const size = count > 9 ? 52 : 44;
  return (
    <div className="cluster-marker" onClick={onClick}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: "linear-gradient(135deg,#115E54,#2A8256)",
        border: `3px solid ${isDark ? "#48A15E" : "#95C78F"}`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        color: "#fff", boxShadow: isDark ? "0 6px 20px rgba(0,0,0,0.45)" : "0 6px 20px rgba(0,0,0,0.3)",
        gap: 1,
      }}>
        {/* connected-node icon — three dots + lines */}
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
          <circle cx="2" cy="5" r="2" fill={isDark ? "#48A15E" : "#95C78F"}/>
          <circle cx="14" cy="2" r="2" fill={isDark ? "#48A15E" : "#95C78F"}/>
          <circle cx="14" cy="8" r="2" fill={isDark ? "#48A15E" : "#95C78F"}/>
          <line x1="4" y1="5" x2="12" y2="2" stroke={isDark ? "#48A15E" : "#95C78F"} strokeWidth="1.2" strokeDasharray="2 1"/>
          <line x1="4" y1="5" x2="12" y2="8" stroke={isDark ? "#48A15E" : "#95C78F"} strokeWidth="1.2" strokeDasharray="2 1"/>
        </svg>
        <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1 }}>{count}+</span>
      </div>
      <div className="map-tooltip">{count} {label}</div>
    </div>
  );
}

// ── Clustering helpers ────────────────────────────────────────────────────────
type AnyPin = { id: string; lat: number; lng: number };

function computeClusters<T extends AnyPin>(pins: T[], gridSize: number): { center: { lat: number; lng: number }; items: T[] }[] {
  const cells = new Map<string, T[]>();
  pins.forEach((p) => {
    const key = `${Math.floor(p.lat / gridSize)},${Math.floor(p.lng / gridSize)}`;
    const arr = cells.get(key) ?? [];
    arr.push(p);
    cells.set(key, arr);
  });
  return Array.from(cells.values()).map((items) => {
    const lat = items.reduce((s, p) => s + p.lat, 0) / items.length;
    const lng = items.reduce((s, p) => s + p.lng, 0) / items.length;
    return { center: { lat, lng }, items };
  });
}

function emailToInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

// ── Main container ────────────────────────────────────────────────────────────
export default function DeploymentMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cssInjected  = useRef(false);
  const { user } = useNGOAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const {
    mapRef, mapReady, initMap,
    selected, select, clearSelection,
    filter, setFilter,
    drawRoutingLines,
  } = useMapController();

  const [liveVols, setLiveVols]   = useState<VolunteerPin[]>([]);
  const [operations, setOps]      = useState<OperationPin[]>([]);
  const [resources, setResources] = useState<ResourcePin[]>([]);
  const [routePaths, setRoutePaths] = useState<Record<string, { lat: number; lng: number }[]>>({});

  const handleRealtimeEvent = useCallback((message: RealtimeEventEnvelope) => {
    if (message.event === "location_update") {
      const payload = message.payload as {
        volunteer_id?: string;
        lat?: number | null;
        lng?: number | null;
        share_location?: boolean;
      };
      if (!payload.volunteer_id) return;
      if (!payload.share_location || payload.lat == null || payload.lng == null) {
        setLiveVols((prev) => prev.filter((v) => v.user_id !== payload.volunteer_id));
        return;
      }

      setLiveVols((prev) => {
        const idx = prev.findIndex((v) => v.user_id === payload.volunteer_id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], lat: payload.lat as number, lng: payload.lng as number };
        return next;
      });
      return;
    }

    if (message.event === "task_created") {
      const payload = message.payload as {
        task_id?: string;
        title?: string;
        status?: string;
        lat?: number | null;
        lng?: number | null;
      };
      if (!payload.task_id || payload.lat == null || payload.lng == null) return;

      setOps((prev) => {
        if (prev.some((op) => op.id === payload.task_id)) return prev;
        return [
          {
            id: payload.task_id,
            title: payload.title || "Task",
            lat: payload.lat,
            lng: payload.lng,
            status: payload.status === "completed" ? "completed" : "active",
            assigned: 0,
            needed: 0,
            description: "",
          },
          ...prev,
        ];
      });
      return;
    }

    if (message.event === "assignment_updated") {
      const payload = message.payload as {
        task_id?: string;
        status?: string;
        lat?: number | null;
        lng?: number | null;
      };
      if (!payload.task_id) return;
      setOps((prev) => prev.map((op) => (
        op.id === payload.task_id
          ? {
              ...op,
              status: payload.status === "completed" ? "completed" : "active",
              lat: payload.lat ?? op.lat,
              lng: payload.lng ?? op.lng,
            }
          : op
      )));
    }
  }, []);

  const { connectionState } = useRealtimeSocket({
    token: user?.token,
    enabled: Boolean(user?.token),
    onEvent: handleRealtimeEvent,
  });

  // Zoom state for clustering
  const [zoom, setZoom] = useState(5);

  useEffect(() => {
    if (!cssInjected.current) {
      const tag = document.createElement("style");
      tag.textContent = MAP_CSS;
      document.head.appendChild(tag);
      cssInjected.current = true;
    }
    if (containerRef.current) initMap(containerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    drawRoutingLines(liveVols, operations, routePaths);
    const listener = mapRef.current.addListener("zoom_changed", () => {
      setZoom(mapRef.current?.getZoom() ?? 5);
    });
    return () => google.maps.event.removeListener(listener);
  }, [mapReady, liveVols, operations, routePaths, drawRoutingLines]);

  // Poll volunteers/tasks/resources every 15s
  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      try {
        const [volRows, taskRows, resourceRows, assignmentRows] = await Promise.all([
          api.volunteerLocations(user.token),
          api.ngoTasks(user.token),
          api.ngoResources(user.token),
          api.ngoAssignments(user.token),
        ]);

        const activeAssignments = assignmentRows.filter((a) => a.status === "assigned" || a.status === "accepted");
        const assignmentByVolunteer = new Map<string, string>();
        for (const a of activeAssignments) {
          if (!assignmentByVolunteer.has(a.volunteer_id)) {
            assignmentByVolunteer.set(a.volunteer_id, a.task_id);
          }
        }

        setLiveVols(volRows.map((r: any) => ({
          id:       r.user_id,
          user_id:  r.user_id,
          name:     r.email,
          email:    r.email,
          lat:      r.lat,
          lng:      r.lng,
          status:   r.status === "active" ? "available" : "busy",
          skills:   r.skills ?? [],
          initials: emailToInitials(r.email),
          assignedTo: assignmentByVolunteer.get(r.user_id),
        })));

        setOps(taskRows
          .filter((t: any) => t.lat != null && t.lng != null)
          .map((t: any) => ({
            id:          t.id,
            title:       t.title,
            lat:         t.lat,
            lng:         t.lng,
            status:      t.status === "completed" ? "completed" : "active",
            assigned:    activeAssignments.filter((a) => a.task_id === t.id).length,
            needed:      0,
            description: t.description ?? "",
          })));

        setResources(resourceRows
          .filter((r: any) => r.lat != null && r.lng != null)
          .map((r: any) => ({
            id:    r.id,
            title: r.type,
            lat:   r.lat,
            lng:   r.lng,
            type:  (["medical", "food", "equipment"].includes(r.type) ? r.type : "equipment") as "medical" | "food" | "equipment",
            stock: r.quantity ?? 0,
          })));

        const previewRows = activeAssignments.slice(0, 10);
        const previews = await Promise.all(previewRows.map(async (a) => {
          try {
            const route = await api.routePreview(user.token, a.volunteer_id, a.task_id);
            if (!route.polyline || route.polyline.length < 2) return null;
            return { key: `${a.volunteer_id}:${a.task_id}`, polyline: route.polyline };
          } catch {
            return null;
          }
        }));

        const nextPaths: Record<string, { lat: number; lng: number }[]> = {};
        previews.forEach((p) => {
          if (p) nextPaths[p.key] = p.polyline;
        });
        setRoutePaths(nextPaths);
      } catch {
        // Keep existing map state when polling fails.
      }
    };
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, [user]);

  // Redraw routing lines when live volunteer positions/assignments update
  useEffect(() => {
    if (mapReady) drawRoutingLines(liveVols, operations, routePaths);
  }, [liveVols, operations, routePaths, mapReady, drawRoutingLines]);

  const handleVolClick = useCallback((v: VolunteerPin) => {
    select("volunteer", v);
    if (!user || v.performanceScore !== undefined) return;
    api.volunteerProfile(user.token, v.user_id!).then((p: any) => {
      const enriched: VolunteerPin = {
        ...v,
        email:            p.email,
        completedTasks:   p.completed_tasks,
        performanceScore: p.performance_score,
      };
      setLiveVols((prev) => prev.map((x) => x.id === v.id ? enriched : x));
      select("volunteer", enriched);
    }).catch(() => {});
  }, [user, select]);

  const show = (type: string) => filter === "all" || filter === type;

  // Cluster at zoom < 7 (grid ~5 deg); individual markers at zoom >= 7
  const CLUSTER_ZOOM = 7;
  const GRID = 5;
  const volClusters  = zoom < CLUSTER_ZOOM ? computeClusters(liveVols, GRID) : null;
  const opClusters   = zoom < CLUSTER_ZOOM ? computeClusters(operations, GRID) : null;
  const resClusters  = zoom < CLUSTER_ZOOM ? computeClusters(resources, GRID) : null;

  return (
    <div className={`relative w-full h-full overflow-hidden ${isDark ? "map-theme-dark" : "map-theme-light"}`}>
      <div ref={containerRef} className="w-full h-full" />

      {mapReady && (
        <div
          className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold"
          style={{
            background: isDark ? "rgba(18,38,34,0.92)" : "rgba(11,61,54,0.88)",
            color: isDark ? "#95C78F" : "#95C78F",
            border: isDark ? "1px solid rgba(149,199,143,0.35)" : "1px solid rgba(149,199,143,0.3)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#95C78F", display: "inline-block", animation: "pulse-ring 1.8s ease-out infinite" }} />
          {liveVols.length > 0 ? `${liveVols.length} LIVE` : "NO VOLUNTEERS SHARING"}
          <span style={{ opacity: 0.75 }}>
            {connectionState === "connected" ? "WS ON" : "WS RETRY"}
          </span>
        </div>
      )}

      {mapReady && mapRef.current && (
        <>
          <FilterBar filter={filter} setFilter={setFilter} />

          {/* ── Volunteers ── */}
          {show("volunteers") && (
            zoom < CLUSTER_ZOOM
              ? volClusters!.map((c, i) => (
                  c.items.length === 1
                    ? (
                      <CustomHtmlMarker key={c.items[0].id} map={mapRef.current} position={c.center}
                        zIndex={selected?.data?.id === c.items[0].id ? 20 : 5}>
                        <VolMarker data={c.items[0]} selected={selected?.data?.id === c.items[0].id}
                          isDark={isDark}
                          onClick={() => handleVolClick(c.items[0])} />
                      </CustomHtmlMarker>
                    )
                    : (
                      <CustomHtmlMarker key={`vc-${i}`} map={mapRef.current} position={c.center} zIndex={10}>
                        <ClusterMarker count={c.items.length} label="Volunteers" isDark={isDark}
                          onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 5) + 2)} />
                      </CustomHtmlMarker>
                    )
                ))
              : liveVols.map((v) => (
                  <CustomHtmlMarker key={v.id} map={mapRef.current} position={{ lat: v.lat, lng: v.lng }}
                    zIndex={selected?.data?.id === v.id ? 20 : 5}>
                    <VolMarker data={v} selected={selected?.data?.id === v.id}
                      isDark={isDark}
                      onClick={() => handleVolClick(v)} />
                  </CustomHtmlMarker>
                ))
          )}

          {/* ── Operations ── */}
          {show("operations") && (
            zoom < CLUSTER_ZOOM
              ? opClusters!.map((c, i) => (
                  c.items.length === 1
                    ? (
                      <CustomHtmlMarker key={c.items[0].id} map={mapRef.current} position={c.center}
                        zIndex={selected?.data?.id === c.items[0].id ? 20 : 8}>
                        <OpMarker data={c.items[0]} selected={selected?.data?.id === c.items[0].id}
                          isDark={isDark}
                          onClick={() => select("operation", c.items[0])} />
                      </CustomHtmlMarker>
                    )
                    : (
                      <CustomHtmlMarker key={`oc-${i}`} map={mapRef.current} position={c.center} zIndex={10}>
                        <ClusterMarker count={c.items.length} label="Operations" isDark={isDark}
                          onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 5) + 2)} />
                      </CustomHtmlMarker>
                    )
                ))
              : operations.map((op) => (
                  <CustomHtmlMarker key={op.id} map={mapRef.current} position={{ lat: op.lat, lng: op.lng }}
                    zIndex={selected?.data?.id === op.id ? 20 : 8}>
                    <OpMarker data={op} selected={selected?.data?.id === op.id}
                      isDark={isDark}
                      onClick={() => select("operation", op)} />
                  </CustomHtmlMarker>
                ))
          )}

          {/* ── Resources ── */}
          {show("resources") && (
            zoom < CLUSTER_ZOOM
              ? resClusters!.map((c, i) => (
                  c.items.length === 1
                    ? (
                      <CustomHtmlMarker key={c.items[0].id} map={mapRef.current} position={c.center}
                        zIndex={selected?.data?.id === c.items[0].id ? 20 : 3}>
                        <ResMarker data={c.items[0]} selected={selected?.data?.id === c.items[0].id}
                          isDark={isDark}
                          onClick={() => select("resource", c.items[0])} />
                      </CustomHtmlMarker>
                    )
                    : (
                      <CustomHtmlMarker key={`rc-${i}`} map={mapRef.current} position={c.center} zIndex={10}>
                        <ClusterMarker count={c.items.length} label="Resources" isDark={isDark}
                          onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 5) + 2)} />
                      </CustomHtmlMarker>
                    )
                ))
              : resources.map((r) => (
                  <CustomHtmlMarker key={r.id} map={mapRef.current} position={{ lat: r.lat, lng: r.lng }}
                    zIndex={selected?.data?.id === r.id ? 20 : 3}>
                    <ResMarker data={r} selected={selected?.data?.id === r.id}
                      isDark={isDark}
                      onClick={() => select("resource", r)} />
                  </CustomHtmlMarker>
                ))
          )}

          <AnimatePresence>
            {selected && (
              <EntityDetailPanel entity={selected} onClose={clearSelection} />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
