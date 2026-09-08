export interface FirestoreTask {
  id: string;
  neoTaskId: string;
  neoNeedId: string;
  title: string;
  description: string;
  requiredSkill: string;
  expectedEvidence: string;
  xpReward: number;
  status: "OPEN" | "CLAIMED" | "SUBMITTED" | "VERIFIED" | "MANUAL_REVIEW" | "REJECTED";
  location: { lat: number; lng: number; name: string };
  claimedBy: string | null;
  claimedAt: any | null;
  verificationImageUrl: string | null;
  verificationResult: {
    verified: boolean;
    confidence_score: number;
    reasoning: string;
  } | null;
  createdAt: any;
  urgency: number;
}

export interface FirestoreVolunteer {
  uid: string;
  name: string;
  phone: string;
  skills: string[];
  location: { lat: number; lng: number };
  reputationScore: number;
  totalXP: number;
  totalTasksCompleted: number;
  currentActiveTasks: number;
  availabilityStatus: "ACTIVE" | "BUSY" | "OFFLINE";
  role: "NGO" | "Volunteer" | null;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "INFO" | "URGENT" | "SUCCESS";
  timestamp: any;
  createdAt?: any;
  read: boolean;
}

export interface FirestoreNeed {
  id: string;
  type: string;
  sub_type: string;
  description: string;
  urgency_score: number;
  population_affected: number;
  status: "PENDING" | "CLAIMED" | "RESOLVED";
  location: { lat: number; lng: number; name: string };
  reported_at: any;
  tasks_spawned: number;
}

export interface ActivityEvent {
  id: string;
  type: "NEED_REPORTED" | "TASK_ASSIGNED" | "TASK_VERIFIED" | "VOLUNTEER_JOINED" | string;
  title: string;
  description: string;
  timestamp: any;
  metadata?: Record<string, any>;
}

export interface UserResponse {
  user_id: string;
  email: string;
  role: "ngo_admin" | "volunteer";
  ngo_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  preferred_language: string;
  communication_opt_in: boolean;
  consent_analytics: boolean;
  consent_personalization: boolean;
  consent_ai_training: boolean;
  profile_completed_at?: string | null;
  last_login_at?: string | null;
  email_verified: boolean;
  created_at: string;
}

export interface NGOResponse {
  id: string;
  name: string;
  description: string;
  sector?: string | null;
  website?: string | null;
  headquarters_city?: string | null;
  primary_contact_name?: string | null;
  primary_contact_phone?: string | null;
  operating_regions: string[];
  mission_focus: string[];
  invite_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VolunteerProfileResponse {
  id: string;
  user_id: string;
  email?: string | null;
  ngo_id: string;
  skills: string[];
  availability: Record<string, any>;
  status: string;
  share_location: boolean;
  lat?: number | null;
  lng?: number | null;
  full_name?: string | null;
  phone?: string | null;
  city?: string | null;
  bio?: string | null;
  date_of_birth?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  education_level?: string | null;
  years_experience?: number | null;
  preferred_roles: string[];
  certifications: string[];
  languages: string[];
  causes_supported: string[];
  motivation_statement?: string | null;
  availability_notes?: string | null;
  work_preferences: Record<string, any>;
  last_active_at?: string | null;
  profile_completeness_score: number;
  completed_tasks: number;
  total_assigned: number;
  acceptance_rate: number;
  performance_score: number;
}

export interface TaskResponse {
  id: string;
  ngo_id: string;
  title: string;
  description?: string;
  required_skills?: string[];
  priority: "low" | "medium" | "high" | string;
  status: "open" | "in_progress" | "completed" | "cancelled" | string;
  deadline?: string | null;
  lat?: number | null;
  lng?: number | null;
  created_at?: string;
  updated_at?: string;
  task_category?: string | null;
  estimated_hours?: number | null;
  urgency_score?: number;
  impact_tags?: string[];
}

export interface AssignmentResponse {
  id: string;
  task_id: string;
  volunteer_id: string;
  ngo_id: string;
  status: "assigned" | "accepted" | "rejected" | "completed" | string;
  assigned_at: string;
  accepted_at?: string | null;
  completed_at?: string | null;
  updated_at: string;
  hours_spent?: number | null;
  completion_rating?: number | null;
  ngo_feedback?: string | null;
  match_score?: number | null;
}

export interface ConsentEventResponse {
  id: string;
  user_id: string;
  scope: "analytics" | "personalization" | "ai_training" | string;
  granted: boolean;
  source: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  /** Long-lived and rotating. Exchanged for a new access token before expiry. */
  refresh_token?: string | null;
  role: "ngo_admin" | "volunteer" | string;
  ngo_id?: string | null;
  ngo_name?: string | null;
  needs_ngo_setup?: boolean | null;
  invite_code?: string | null;
}

/** Every event the backend actually publishes on the realtime bus. */
export type RealtimeEventName =
  | "connected"
  | "pong"
  | "ping"
  | "task_created"
  | "task_updated"
  | "assignment_updated"
  | "enrollment_requested"
  | "volunteer_location"
  | "volunteer_location_cleared"
  | "sos_alert";

export interface RealtimeEventEnvelope<T = Record<string, unknown>> {
  event: RealtimeEventName | string;
  payload: T;
  timestamp?: string;
}



// ── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  tasks: {
    total: number;
    open: number;
    in_progress: number;
    completed: number;
    completion_rate_pct: number;
  };
  volunteers: { total: number; active: number; utilization_pct: number };
  assignments: { total: number; completed: number; avg_match_score: number };
}

export interface SkillGap {
  skill: string;
  demand: number;
  supply: number;
  gap: number;
}

export interface LeaderboardRow {
  rank: number;
  volunteer_id: string;
  name: string;
  completed_tasks: number;
  avg_match_score: number;
  avg_rating: number;
  hours_contributed: number;
}

export interface UrgencyDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface Hotzone {
  zone: string;
  need_count: number;
  total_urgency: number;
  total_affected: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface VolunteerActivity {
  name: string;
  tasks_completed: number;
  xp: number;
  reputation: number;
}

export interface CoverageRun {
  run_id: string;
  strategy: string;
  coverage_pct: number;
  timestamp: string;
}
