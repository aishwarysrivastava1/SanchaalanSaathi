/**
 * Guest mode API interceptor.
 * Called by ngoGet/ngoPost/ngoPut/ngoDelete when isGuestMode() is true.
 * Matches URL paths and returns mock data — zero network calls.
 */

import {
  GUEST_NGO_DASHBOARD,
  GUEST_NGO_ALERTS,
  GUEST_VOLUNTEERS,
  GUEST_VOLUNTEER_LOCATIONS,
  GUEST_TASKS,
  GUEST_RESOURCES,
  GUEST_EVENTS,
  GUEST_ANALYTICS,
  GUEST_NGO_ASSIGNMENTS,
  GUEST_NGO_NOTIFICATIONS,
  GUEST_ENROLLMENT_REQUESTS,
  GUEST_AI_MATCH_RESULT,
  GUEST_VOL_DASHBOARD,
  GUEST_VOL_PROFILE,
  GUEST_VOL_TASKS,
  GUEST_RECOMMENDATIONS,
  GUEST_OPEN_TASKS,
  GUEST_VOL_NOTIFICATIONS,
  GUEST_GRAPH_STATS,
  GUEST_GRAPH_HOTSPOTS,
  GUEST_GRAPH_NODES,
  GUEST_GRAPH_NEEDS,
  GUEST_GRAPH_VOLUNTEERS_DATA,
  GUEST_GRAPH_TASKS_DATA,
  GUEST_ATTENDANCE,
  GUEST_VOLUNTEER_PROFILE_MAP,
} from "./guest-mock-data";

// ── Routing algorithm mock ───────────────────────────────────────────────────

function generateRoute(body: unknown) {
  const req = body as { volunteer_id?: string; task_id?: string } | null;
  const vol  = GUEST_VOLUNTEER_LOCATIONS.find(v => v.volunteer_id === req?.volunteer_id);
  const task = GUEST_TASKS.find(t => t.id === req?.task_id);

  const fromLat = vol?.lat  ?? 19.0760;
  const fromLng = vol?.lng  ?? 72.8777;
  const toLat   = task?.lat ?? 19.0414;
  const toLng   = task?.lng ?? 72.8560;

  const polyline: { lat: number; lng: number }[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    polyline.push({
      lat: fromLat + (toLat - fromLat) * t + Math.sin(Math.PI * t) * 0.004,
      lng: fromLng + (toLng - fromLng) * t + Math.sin(Math.PI * t) * 0.003,
    });
  }

  const dlat = (toLat - fromLat) * 111;
  const dlng = (toLng - fromLng) * 111 * Math.cos((fromLat * Math.PI) / 180);
  const distKm = Math.round(Math.sqrt(dlat * dlat + dlng * dlng) * 100) / 100;

  return {
    volunteer_id: req?.volunteer_id ?? "gv-001",
    task_id:      req?.task_id      ?? "gt-001",
    source:       "haversine",
    distance_km:  distKm,
    duration_s:   Math.round(distKm * 240),
    polyline,
  };
}

// ── Profile lookup for individual volunteer ──────────────────────────────────

function resolveVolProfile(path: string) {
  const match = path.match(/\/api\/ngo\/volunteers\/([^/]+)\/profile/);
  const id = match?.[1] ?? "gv-001";
  return GUEST_VOLUNTEER_PROFILE_MAP[id] ?? GUEST_VOLUNTEER_PROFILE_MAP["gv-001"];
}

// ── Main interceptor ─────────────────────────────────────────────────────────

export function interceptGuestRequest(method: string, path: string, body?: unknown): unknown {
  const clean = path.split("?")[0];
  const m = method.toUpperCase();

  // ── GET ───────────────────────────────────────────────────────────────────
  if (m === "GET") {
    // NGO admin
    if (clean === "/api/ngo/dashboard")                       return GUEST_NGO_DASHBOARD;
    if (clean === "/api/ngo/alerts")                          return { alerts: GUEST_NGO_ALERTS };
    if (clean === "/api/ngo/analytics")                       return GUEST_ANALYTICS;
    if (clean === "/api/ngo/volunteers")                      return GUEST_VOLUNTEERS;
    if (clean === "/api/ngo/volunteer-locations")             return GUEST_VOLUNTEER_LOCATIONS;
    if (clean === "/api/ngo/tasks")                           return GUEST_TASKS;
    if (clean === "/api/ngo/resources")                       return GUEST_RESOURCES;
    if (clean === "/api/ngo/events")                          return GUEST_EVENTS;
    if (clean === "/api/ngo/assignments")                     return GUEST_NGO_ASSIGNMENTS;
    if (clean === "/api/ngo/notifications")                   return GUEST_NGO_NOTIFICATIONS;
    if (clean === "/api/ngo/enrollment-requests")             return GUEST_ENROLLMENT_REQUESTS;
    if (clean.match(/\/api\/ngo\/volunteers\/.+\/profile/))   return resolveVolProfile(clean);
    if (clean.match(/\/api\/ngo\/events\/.+\/attendance/))    return GUEST_ATTENDANCE;
    // Volunteer
    if (clean === "/api/volunteer/dashboard")                 return GUEST_VOL_DASHBOARD;
    if (clean === "/api/volunteer/profile")                   return GUEST_VOL_PROFILE;
    if (clean === "/api/volunteer/tasks")                     return GUEST_VOL_TASKS;
    if (clean === "/api/volunteer/recommendations")           return GUEST_RECOMMENDATIONS;
    if (clean === "/api/volunteer/open-tasks")                return GUEST_OPEN_TASKS;
    if (clean === "/api/volunteer/notifications")             return GUEST_VOL_NOTIFICATIONS;
    if (clean === "/api/volunteer/enrollment-requests")       return [];
    // Knowledge graph
    if (clean === "/api/graph/stats")                         return GUEST_GRAPH_STATS;
    if (clean === "/api/graph/hotspots")                      return GUEST_GRAPH_HOTSPOTS;
    if (clean === "/api/graph/nodes")                         return GUEST_GRAPH_NODES;
    if (clean === "/api/graph/needs")                         return GUEST_GRAPH_NEEDS;
    if (clean === "/api/graph/volunteers")                    return { volunteers: GUEST_GRAPH_VOLUNTEERS_DATA };
    if (clean === "/api/graph/tasks")                         return { tasks: GUEST_GRAPH_TASKS_DATA };
    if (clean === "/api/graph/causal-chain")                  return { causal_edges: [], count: 0 };
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (m === "POST") {
    if (clean === "/api/ngo/routes/preview")                  return generateRoute(body);
    if (clean === "/api/ngo/assign-tasks")                    return { assignments: [], count: 0 };
    if (clean.includes("/ai-match"))                          return GUEST_AI_MATCH_RESULT;
    if (clean.match(/\/assignments\/.+\/accept/))             return { status: "accepted" };
    if (clean.match(/\/assignments\/.+\/reject/))             return { status: "rejected" };
    if (clean.match(/\/assignments\/.+\/complete/))           return { status: "completed", task_completed: false };
    if (clean.match(/\/tasks\/.+\/complete/))                 return { message: "Task completed" };
    if (clean.match(/\/tasks\/.+\/ping/))                     return { count: 3 };
    if (clean.match(/\/tasks\/.+\/assign/))                   return { assignment_id: `ga-${Date.now()}`, status: "assigned" };
    if (clean === "/api/ngo/tasks")                           return { id: `gt-${Date.now()}`, title: (body as any)?.title ?? "New Task", status: "open", priority: (body as any)?.priority ?? "medium" };
    if (clean === "/api/ngo/resources")                       return { id: `gr-${Date.now()}`, type: (body as any)?.type ?? "Resource" };
    if (clean === "/api/ngo/events")                          return { id: `ge-${Date.now()}`, title: (body as any)?.title ?? "New Event", status: "upcoming" };
    if (clean.match(/\/events\/.+\/attendance\/.+/))          return { volunteer_id: "demo", status: (body as any)?.status ?? "present" };
    if (clean.includes("/read-all"))                          return { marked: 6 };
    if (clean.includes("/read"))                              return { success: true };
    if (clean.includes("/deactivate"))                        return { status: "inactive" };
    if (clean.includes("/approve"))                           return { status: "approved" };
    if (clean.match(/\/tasks\/.+\/enroll/))                   return { id: `enr-${Date.now()}`, status: "pending" };
    if (clean === "/api/volunteer/sos")                       return { status: "sent", notified: 3 };
    if (clean === "/api/graph/ask")                           return { cypher: "MATCH (n) RETURN n LIMIT 5", results: [], error: null };
    if (clean.match(/\/enrollment-requests\/.+\/approve/))   return { status: "approved" };
    if (clean.match(/\/enrollment-requests\/.+\/reject/))    return { status: "rejected" };
  }

  // ── PUT ───────────────────────────────────────────────────────────────────
  if (m === "PUT") {
    if (clean === "/api/volunteer/profile")                   return { updated: true };
    if (clean === "/api/volunteer/location")                  return { success: true };
    if (clean.match(/\/api\/ngo\/resources\/.+/))             return { id: "demo", availability_status: "available" };
    if (clean.match(/\/api\/ngo\/tasks\/.+/))                 return { id: "demo", status: "open", priority: "medium" };
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (m === "DELETE") {
    if (clean === "/api/volunteer/location")                  return { success: true };
    if (clean.match(/\/api\/ngo\/events\/.+/))                return { message: "Deleted" };
    if (clean.match(/\/api\/ngo\/tasks\/.+/))                 return { message: "Deleted" };
  }

  return {};
}
