import type { AuthResponse, TaskResponse, VolunteerProfileResponse } from "./types";
import { isGuestMode } from "./guest-mode";
import { interceptGuestRequest } from "./guest-api-interceptor";

const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const DEFAULT_TIMEOUT = 30000;

type GoogleAuthBody = {
  email: string;
  firebase_uid: string;
  role: string;
  invite_code?: string;
  full_name?: string;
  phone?: string;
  city?: string;
  preferred_language?: string;
  communication_opt_in?: boolean;
  consent_analytics?: boolean;
  consent_personalization?: boolean;
  consent_ai_training?: boolean;
  motivation_statement?: string;
  languages?: string[];
  causes_supported?: string[];
  education_level?: string;
  years_experience?: number;
  skills?: string[];
  bio?: string;
  date_of_birth?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  preferred_roles?: string[];
  certifications?: string[];
  availability_notes?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map any thrown value to a user-friendly message — never show raw backend detail. */
export function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)) || "";
  const lower = msg.toLowerCase();

  if (process.env.NODE_ENV === "development") {
    console.warn("[NGO-API ERROR]:", e);
  }

  // Network-level failures: only match known browser-native network error patterns
  if (
    lower.includes("request timed out") ||
    lower.includes("deadline exceeded")
  ) {
    return "The server is taking too long to respond. Please try again shortly.";
  }

  if (
    msg === "Failed to fetch" ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("net::err_") ||
    lower.includes("the internet connection appears to be offline") ||
    lower.includes("load failed") ||
    (e instanceof TypeError && !msg)  // TypeError with empty message = fetch network error
  ) {
    const target = BASE.includes("localhost") ? " (at " + BASE + ")" : "";
    return `Cannot reach server${target}. Check your connection and try again.`;
  }
  if (msg.includes("401") || lower.includes("unauthorized") || lower.includes("not authenticated"))
    return "Session expired. Please sign in again.";
  if (msg.includes("429") || lower.includes("too many requests") || lower.includes("throttled"))
    return "System is busy. Please wait a moment before trying again.";
  if (msg.includes("403") || lower.includes("forbidden") || lower.includes("permission"))
    return "You don't have permission to do that.";
  if (msg.includes("404") || lower.includes("not found"))
    return "The requested item was not found.";
  if (lower.includes("invite") || lower.includes("invite_code"))
    return "Invalid or expired invite code. Ask your NGO admin for a new one.";
  if (msg.includes("500") || msg.includes("503") || lower.includes("server error") || lower.includes("database") || lower.includes("service unavailable"))
    return "Something went wrong on our end. Please try again shortly.";
  if (!msg)
    return "Something went wrong. Please try again.";
  if (msg.length <= 120 && !msg.includes("Traceback") && !msg.includes("sqlalchemy") && !msg.includes("asyncpg"))
    return msg;
  return "Something went wrong. Please try again.";
}

function authHeaders(token: string): HeadersInit {
  return { 
    Authorization: `Bearer ${token}`, 
    "Content-Type": "application/json",
    "X-Request-ID": crypto.randomUUID(),
  };
}

async function handleRes<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

/** 
 * Centralized, fault-tolerant fetch with:
 * 1. Hardware-enforced timeout (AbortController)
 * 2. Exponential backoff retries for transient errors (500s, 429s)
 * 3. Network fault detection
 */
export async function fetchSafe(url: string, init?: RequestInit, opts: { attempts?: number; timeoutMs?: number } = {}): Promise<Response> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const backoff = [800, 1600, 3200];
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      // Retry on internal server errors or rate limits
      if (res.status >= 500 || res.status === 429) {
        lastError = new Error(`Server returned ${res.status}`);
      } else {
        return res;
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      lastError = e;
      if (e.name === "AbortError") {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      }
    }

    if (attempt < attempts) {
      await sleep(backoff[attempt - 1]);
    }
  }
  throw lastError;
}

export async function ngoGet<T>(path: string, token: string): Promise<T> {
  if (isGuestMode()) return interceptGuestRequest("GET", path) as T;
  return handleRes<T>(await fetchSafe(`${BASE}${path}`, { headers: authHeaders(token) }));
}

export async function ngoPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  if (isGuestMode()) return interceptGuestRequest("POST", path, body) as T;
  return handleRes<T>(await fetchSafe(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

export async function ngoPut<T>(path: string, token: string, body: unknown): Promise<T> {
  if (isGuestMode()) return interceptGuestRequest("PUT", path, body) as T;
  return handleRes<T>(await fetchSafe(`${BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }));
}

export async function ngoDelete<T>(path: string, token: string): Promise<T> {
  if (isGuestMode()) return interceptGuestRequest("DELETE", path) as T;
  return handleRes<T>(await fetchSafe(`${BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(token),
  }));
}

// ── Typed convenience wrappers ───────────────────────────────────────────────

export const api = {
  // Auth
  signup: (body: {
    email: string;
    password: string;
    role: string;
    invite_code?: string;
    full_name?: string;
    phone?: string;
    city?: string;
    preferred_language?: string;
    communication_opt_in?: boolean;
    consent_analytics?: boolean;
    consent_personalization?: boolean;
    consent_ai_training?: boolean;
    motivation_statement?: string;
    languages?: string[];
    causes_supported?: string[];
    education_level?: string;
    years_experience?: number;
    skills?: string[];
    bio?: string;
    date_of_birth?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    preferred_roles?: string[];
    certifications?: string[];
    availability_notes?: string;
  }): Promise<AuthResponse> =>
    fetchSafe(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handleRes<AuthResponse>),

  googleAuth: (body: GoogleAuthBody): Promise<AuthResponse> =>
    fetchSafe(`${BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handleRes<AuthResponse>),

  checkEmail: (email: string): Promise<{ exists: boolean; role: string | null; ngo_id: string | null }> =>
    fetch(`${BASE}/api/auth/check-email?email=${encodeURIComponent(email)}`)
      .then(res => res.ok ? res.json() : res.json().then((e: { detail?: string }) => { throw new Error(e.detail ?? "check-email failed"); })),

  chatbotProxy: (token: string | null, body: any) =>
    fetchSafe(`${BASE}/api/chatbot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),

  guestAuth: (): Promise<AuthResponse> =>
    fetchSafe(`${BASE}/api/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then(handleRes<AuthResponse>),

  guestVolunteerAuth: (): Promise<AuthResponse> =>
    fetchSafe(`${BASE}/api/auth/guest-volunteer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then(handleRes<AuthResponse>),

  lookupNGO: (inviteCode: string) =>
    fetchSafe(`${BASE}/api/auth/ngo/lookup/${encodeURIComponent(inviteCode)}`)
      .then(handleRes<{ ngo_name: string; invite_code: string }>),

  createNGO: (token: string, body: {
    name: string;
    description: string;
    sector?: string;
    website?: string;
    headquarters_city?: string;
    primary_contact_name?: string;
    primary_contact_phone?: string;
    operating_regions?: string[];
    mission_focus?: string[];
  }): Promise<AuthResponse> =>
    ngoPost<AuthResponse>(
      "/api/auth/ngo/create", token, body
    ),

  // NGO admin
  ngoDashboard: (token: string) =>
    ngoGet<any>("/api/ngo/dashboard", token),

  ngoVolunteers: (token: string, params?: { skill?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return ngoGet<any[]>(`/api/ngo/volunteers${q ? `?${q}` : ""}`, token);
  },

  deactivateVolunteer: (token: string, id: string) =>
    ngoPost<any>(`/api/ngo/volunteers/${id}/deactivate`, token),

  volunteerLocations: (token: string) =>
    ngoGet<any[]>("/api/ngo/volunteer-locations", token),

  volunteerProfile: (token: string, userId: string) =>
    ngoGet<any>(`/api/ngo/volunteers/${userId}/profile`, token),

  ngoTasks: (token: string, params?: { status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return ngoGet<TaskResponse[]>(`/api/ngo/tasks${q ? `?${q}` : ""}`, token);
  },

  ngoAssignments: (token: string, params?: { status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return ngoGet<{ id: string; task_id: string; volunteer_id: string; status: string; assigned_at: string }[]>(
      `/api/ngo/assignments${q ? `?${q}` : ""}`,
      token,
    );
  },

  createTask: (token: string, body: { title: string; description: string; required_skills: string[]; deadline?: string; lat?: number; lng?: number }) =>
    ngoPost<TaskResponse>("/api/ngo/tasks", token, body),

  updateTask: (token: string, id: string, body: object) =>
    ngoPut<any>(`/api/ngo/tasks/${id}`, token, body),

  deleteTask: (token: string, id: string) =>
    ngoDelete<any>(`/api/ngo/tasks/${id}`, token),

  assignTask: (token: string, taskId: string, volunteerId: string) =>
    ngoPost<any>(`/api/ngo/tasks/${taskId}/assign`, token, { volunteer_id: volunteerId }),

  assignTasksOptimized: (token: string, max_assignments?: number) =>
    ngoPost<{ assignments: { assignment_id: string; task_id: string; volunteer_id: string; match_score: number }[]; count: number }>(
      "/api/ngo/assign-tasks",
      token,
      max_assignments ? { max_assignments } : {},
    ),

  routePreview: (token: string, volunteerId: string, taskId: string) =>
    ngoPost<{ volunteer_id: string; task_id: string; source: string; distance_km: number; duration_s: number; polyline: { lat: number; lng: number }[] }>(
      "/api/ngo/routes/preview",
      token,
      { volunteer_id: volunteerId, task_id: taskId },
    ),

  aiMatch: (token: string, taskId: string) =>
    ngoPost<{ ranked_volunteers: any[] }>(`/api/ngo/tasks/${taskId}/ai-match`, token),

  ngoResources: (token: string) =>
    ngoGet<any[]>("/api/ngo/resources", token),

  createResource: (token: string, body: { type: string; quantity: number; metadata?: object; lat?: number; lng?: number }) =>
    ngoPost<any>("/api/ngo/resources", token, body),

  updateResource: (token: string, id: string, body: object) =>
    ngoPut<any>(`/api/ngo/resources/${id}`, token, body),

  allocateResource: (token: string, resourceId: string, taskId: string) =>
    ngoPost<any>(`/api/ngo/resources/${resourceId}/allocate`, token, { task_id: taskId }),

  ngoAnalytics: (token: string) =>
    ngoGet<any>("/api/ngo/analytics", token),

  ngoAlerts: (token: string) =>
    ngoGet<{ alerts: any[] }>("/api/ngo/alerts", token),

  // Volunteer
  volDashboard: (token: string) =>
    ngoGet<any>("/api/volunteer/dashboard", token),

  volProfile: (token: string) =>
    ngoGet<VolunteerProfileResponse>("/api/volunteer/profile", token),

  updateVolProfile: (token: string, body: {
    skills?: string[];
    availability?: object;
    full_name?: string;
    phone?: string;
    city?: string;
    bio?: string;
    date_of_birth?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    education_level?: string;
    years_experience?: number;
    preferred_roles?: string[];
    certifications?: string[];
    languages?: string[];
    causes_supported?: string[];
    motivation_statement?: string;
    availability_notes?: string;
  }) =>
    ngoPut<any>("/api/volunteer/profile", token, body),

  updateVolLocation: (token: string, lat: number, lng: number) =>
    ngoPut<any>("/api/volunteer/location", token, { lat, lng, share_location: true }),

  clearVolLocation: (token: string) =>
    fetchSafe(`${BASE}/api/volunteer/location`, { method: "DELETE", headers: authHeaders(token) })
      .then(handleRes<any>),

  triggerSOS: (token: string, body?: { message?: string; lat?: number; lng?: number }) =>
    ngoPost<{ status: string; notified: number }>("/api/volunteer/sos", token, body ?? {}),

  volTasks: (token: string) =>
    ngoGet<any[]>("/api/volunteer/tasks", token),

  acceptAssignment: (token: string, id: string) =>
    ngoPost<any>(`/api/volunteer/assignments/${id}/accept`, token),

  rejectAssignment: (token: string, id: string) =>
    ngoPost<any>(`/api/volunteer/assignments/${id}/reject`, token),

  volNotifications: (token: string) =>
    ngoGet<any[]>("/api/volunteer/notifications", token),

  markNotifRead: (token: string, id: string) =>
    ngoPost<any>(`/api/volunteer/notifications/${id}/read`, token),

  completeAssignment: (token: string, id: string) =>
    ngoPost<{ status: string; task_completed: boolean }>(`/api/volunteer/assignments/${id}/complete`, token),

  completeTask: (token: string, taskId: string) =>
    ngoPost<{ message: string }>(`/api/ngo/tasks/${taskId}/complete`, token),

  getRecommendations: (token: string) =>
    ngoGet<RecommendedTask[]>("/api/volunteer/recommendations", token),

  volOpenTasks: (token: string) =>
    ngoGet<any[]>("/api/volunteer/open-tasks", token),

  volEnroll: (token: string, taskId: string, body: { reason: string; why_useful: string }) =>
    ngoPost<any>(`/api/volunteer/tasks/${taskId}/enroll`, token, body),

  volEnrollmentRequests: (token: string) =>
    ngoGet<any[]>("/api/volunteer/enrollment-requests", token),

  ngoEnrollmentRequests: (token: string, status?: string) =>
    ngoGet<any[]>(`/api/ngo/enrollment-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`, token),

  approveEnrollment: (token: string, reqId: string) =>
    ngoPost<any>(`/api/ngo/enrollment-requests/${reqId}/approve`, token),

  rejectEnrollment: (token: string, reqId: string) =>
    ngoPost<any>(`/api/ngo/enrollment-requests/${reqId}/reject`, token),

  pingTask: (token: string, taskId: string, message?: string) =>
    ngoPost<{ count: number }>(`/api/ngo/tasks/${taskId}/ping`, token, { message }),

  ngoNotifications: (token: string) =>
    ngoGet<any[]>("/api/ngo/notifications", token),

  markNgoNotifRead: (token: string, id: string) =>
    ngoPost<any>(`/api/ngo/notifications/${id}/read`, token),

  markAllNgoNotifsRead: (token: string) =>
    ngoPost<{ marked: number }>("/api/ngo/notifications/read-all", token),

  // Events
  listEvents: (token: string) =>
    ngoGet<any[]>("/api/ngo/events", token),

  createEvent: (token: string, body: {
    title: string; event_type: string; date: string; location: string;
    max_volunteers: number; description?: string; status?: string;
  }) => ngoPost<{ id: string; title: string; status: string }>("/api/ngo/events", token, body),

  deleteEvent: (token: string, id: string) =>
    ngoDelete<{ message: string }>(`/api/ngo/events/${id}`, token),

  getAttendance: (token: string, eventId: string) =>
    ngoGet<{ volunteer_id: string; email: string; status: string }[]>(
      `/api/ngo/events/${eventId}/attendance`, token
    ),

  markAttendance: (token: string, eventId: string, volId: string, status: string) =>
    ngoPost<{ volunteer_id: string; status: string }>(
      `/api/ngo/events/${eventId}/attendance/${volId}`, token, { status }
    ),
};

export async function googleAuthWithRetry(
  body: GoogleAuthBody,
  opts: { attempts?: number; timeoutMs?: number } = {},
): Promise<{ token: string; role: string; ngo_id: string | null; needs_ngo_setup?: boolean }> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const timeoutMs = Math.max(5000, opts.timeoutMs ?? 30000);
  const backoffMs = [800, 1600, 3200];

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return res.json();
      }

      if (res.status >= 500 || res.status === 429) {
        const err = await res.json().catch(() => ({}));
        lastError = new Error(err.detail || `Request failed: ${res.status}`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed: ${res.status}`);
      }
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const aborted = (e as { name?: string })?.name === "AbortError";
      const msg = (e as Error)?.message ?? "";
      const transient = aborted || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch");
      if (!transient) {
        throw e;
      }
      lastError = aborted ? new Error(`Request timeout after ${timeoutMs}ms`) : e;
    }

    if (attempt < attempts) {
      await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]);
    }
  }

  throw lastError ?? new Error("Authentication request failed");
}

export type RecommendedTask = {
  task_id: string;
  title: string;
  description: string;
  required_skills: string[];
  deadline?: string;
  priority: string;
  match_score: number;
  matched_skills: string[];
};
