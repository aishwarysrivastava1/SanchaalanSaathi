const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('NEXT_PUBLIC_BACKEND_URL is not set'); })()
    : 'http://localhost:8000'
);

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function handleRes<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function ngoGet<T>(path: string, token: string): Promise<T> {
  return handleRes<T>(await fetch(`${BASE}${path}`, { headers: authHeaders(token) }));
}

export async function ngoPost<T>(path: string, token: string, body?: unknown): Promise<T> {
  return handleRes<T>(await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

export async function ngoPut<T>(path: string, token: string, body: unknown): Promise<T> {
  return handleRes<T>(await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }));
}

export async function ngoDelete<T>(path: string, token: string): Promise<T> {
  return handleRes<T>(await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(token),
  }));
}

// ── Typed convenience wrappers ───────────────────────────────────────────────

export const api = {
  // Auth
  signup: (body: { email: string; password: string; role: string; invite_code?: string }) =>
    fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handleRes<{ token: string; role: string; ngo_id: string | null; needs_ngo_setup?: boolean }>),

  googleAuth: (body: { email: string; firebase_uid: string; role: string; invite_code?: string }) =>
    fetch(`${BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handleRes<{ token: string; role: string; ngo_id: string | null; needs_ngo_setup?: boolean }>),

  createNGO: (token: string, body: { name: string; description: string }) =>
    ngoPost<{ token: string; ngo_id: string; invite_code: string; name: string }>(
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

  ngoTasks: (token: string, params?: { status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return ngoGet<any[]>(`/api/ngo/tasks${q ? `?${q}` : ""}`, token);
  },

  createTask: (token: string, body: { title: string; description: string; required_skills: string[]; deadline?: string }) =>
    ngoPost<{ id: string; title: string; status: string }>("/api/ngo/tasks", token, body),

  updateTask: (token: string, id: string, body: object) =>
    ngoPut<any>(`/api/ngo/tasks/${id}`, token, body),

  deleteTask: (token: string, id: string) =>
    ngoDelete<any>(`/api/ngo/tasks/${id}`, token),

  assignTask: (token: string, taskId: string, volunteerId: string) =>
    ngoPost<any>(`/api/ngo/tasks/${taskId}/assign`, token, { volunteer_id: volunteerId }),

  aiMatch: (token: string, taskId: string) =>
    ngoPost<{ ranked_volunteers: any[] }>(`/api/ngo/tasks/${taskId}/ai-match`, token),

  ngoResources: (token: string) =>
    ngoGet<any[]>("/api/ngo/resources", token),

  createResource: (token: string, body: { type: string; quantity: number; metadata?: object }) =>
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
    ngoGet<any>("/api/volunteer/profile", token),

  updateVolProfile: (token: string, body: { skills?: string[]; availability?: object }) =>
    ngoPut<any>("/api/volunteer/profile", token, body),

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
