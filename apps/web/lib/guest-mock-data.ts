import type { RecommendedTask } from "./ngo-api";

// ── Shared volunteer IDs & coords ────────────────────────────────────────────

const V = [
  { id: "gv-001", name: "Amit Kumar",   email: "amit.k@demo.synapse",  lat: 19.0760, lng: 72.8777, city: "Mumbai",    skills: ["medical_aid", "search_rescue", "first_aid"],           avail: { mon: true,  tue: true,  wed: true,  thu: true,  fri: true,  sat: false, sun: false } },
  { id: "gv-002", name: "Priya Sharma", email: "priya.s@demo.synapse",  lat: 19.0178, lng: 72.8478, city: "Mumbai",    skills: ["logistics", "water_purification", "community_outreach"], avail: { mon: true,  tue: true,  wed: false, thu: true,  fri: true,  sat: true,  sun: false } },
  { id: "gv-003", name: "Rahul Singh",  email: "rahul.s@demo.synapse",  lat: 19.1136, lng: 72.8697, city: "Pune",      skills: ["logistics", "community_outreach", "teaching"],           avail: { mon: false, tue: true,  wed: true,  thu: true,  fri: false, sat: true,  sun: true  } },
  { id: "gv-004", name: "Meera Patel",  email: "meera.p@demo.synapse",  lat: 19.0460, lng: 72.8953, city: "Bangalore", skills: ["medical_aid", "teaching", "first_aid"],                  avail: { mon: true,  tue: false, wed: true,  thu: false, fri: true,  sat: true,  sun: false } },
  { id: "gv-005", name: "Arjun Nair",   email: "arjun.n@demo.synapse",  lat: 18.9647, lng: 72.8258, city: "Chennai",   skills: ["search_rescue", "structural_assessment", "first_aid"],   avail: { mon: true,  tue: true,  wed: true,  thu: false, fri: true,  sat: false, sun: false } },
];

// ── Volunteer locations (for map) ────────────────────────────────────────────

export const GUEST_VOLUNTEER_LOCATIONS = V.map(v => ({
  volunteer_id: v.id,
  user_id:      v.id,
  email:        v.email,
  lat:          v.lat,
  lng:          v.lng,
  skills:       v.skills,
  availability: v.avail,
  status:       "active",
}));

// ── Volunteer roster (for /ngo/volunteers) ───────────────────────────────────

export const GUEST_VOLUNTEERS = V.map((v, i) => ({
  id:           v.id,
  user_id:      v.id,
  email:        v.email,
  full_name:    v.name,
  skills:       v.skills,
  availability: v.avail,
  status:       "active",
  created_at:   `2026-04-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
}));

// ── Per-volunteer profile lookup (for map popup) ─────────────────────────────

export const GUEST_VOLUNTEER_PROFILE_MAP: Record<string, object> = Object.fromEntries(
  V.map((v, i) => [v.id, {
    user_id:          v.id,
    email:            v.email,
    full_name:        v.name,
    skills:           v.skills,
    availability:     v.avail,
    status:           "active",
    lat:              v.lat,
    lng:              v.lng,
    city:             v.city,
    completed_tasks:  [3, 2, 4, 2, 3][i],
    bio:              `Experienced relief volunteer specialising in ${v.skills[0].replace(/_/g, " ")}.`,
    years_experience: [3, 2, 4, 1, 5][i],
    certifications:   ["First Aid", "CPR"].slice(0, [2, 1, 1, 2, 2][i]),
    languages:        ["English", "Hindi"],
  }])
);

// ── Tasks with geo-coordinates ───────────────────────────────────────────────

export const GUEST_TASKS = [
  { id: "gt-001", title: "Flood Relief — Food Distribution",   description: "Distribute emergency food packages to 500+ flood-affected families in Dharavi. Teams needed for door-to-door delivery.",                         required_skills: ["logistics", "community_outreach"],         priority: "high",   status: "open",        deadline: "2026-05-15T00:00:00Z", created_at: "2026-04-28T00:00:00Z", lat: 19.0414, lng: 72.8560 },
  { id: "gt-002", title: "Medical Camp Setup",                  description: "Set up and operate a temporary medical camp at Versova. Assist physicians with triage, first aid, and patient management.",                        required_skills: ["first_aid", "medical_aid"],               priority: "high",   status: "in_progress", deadline: "2026-05-18T00:00:00Z", created_at: "2026-04-25T00:00:00Z", lat: 19.1331, lng: 72.8106 },
  { id: "gt-003", title: "Drinking Water Distribution",         description: "Distribute 5 000 L of clean drinking water to communities cut off from municipal supply in Chembur.",                                             required_skills: ["logistics", "water_purification"],        priority: "medium", status: "open",        deadline: "2026-05-20T00:00:00Z", created_at: "2026-04-29T00:00:00Z", lat: 19.0606, lng: 72.8988 },
  { id: "gt-004", title: "Rescue Operations — Rooftop",        description: "Assist NDRF in rescuing residents stranded on rooftops across Kurla flood zones. Safety gear provided.",                                           required_skills: ["search_rescue", "first_aid"],             priority: "high",   status: "in_progress", deadline: "2026-05-12T00:00:00Z", created_at: "2026-04-24T00:00:00Z", lat: 19.0669, lng: 72.8944 },
  { id: "gt-005", title: "Temporary Shelter Construction",      description: "Help construct 200 temporary shelters for displaced residents at Malad relief camp. Training provided on-site.",                                   required_skills: ["search_rescue", "logistics"],             priority: "high",   status: "completed",   deadline: "2026-05-10T00:00:00Z", created_at: "2026-04-20T00:00:00Z", lat: 19.1829, lng: 72.8484 },
  { id: "gt-006", title: "Flood Safety Awareness Drive",        description: "Conduct door-to-door awareness sessions on flood safety, evacuation routes, and emergency contacts across Worli.",                                 required_skills: ["community_outreach", "teaching"],        priority: "low",    status: "open",        deadline: "2026-06-01T00:00:00Z", created_at: "2026-04-30T00:00:00Z", lat: 19.0114, lng: 72.8193 },
  { id: "gt-007", title: "Damage Assessment Survey",            description: "Systematic structural damage assessment of 300+ buildings in Andheri East using standardised checklist.",                                          required_skills: ["structural_assessment", "community_outreach"], priority: "medium", status: "in_progress", deadline: "2026-05-25T00:00:00Z", created_at: "2026-04-27T00:00:00Z", lat: 19.1136, lng: 72.8697 },
  { id: "gt-008", title: "Medical Supply Convoy",               description: "Escort and unload medical supplies from central depot to 6 remote relief camps across Mumbai northern suburbs.",                                   required_skills: ["logistics", "medical_aid"],               priority: "high",   status: "completed",   deadline: "2026-05-08T00:00:00Z", created_at: "2026-04-18T00:00:00Z", lat: 19.0330, lng: 72.8456 },
];

// ── Resources with geo-coordinates ───────────────────────────────────────────

export const GUEST_RESOURCES = [
  { id: "gr-001", type: "Medical Kits",               quantity: 150,  availability_status: "available", metadata_: { unit: "boxes",  supplier: "Red Cross India" },      lat: 19.0760, lng: 72.8777 },
  { id: "gr-002", type: "Water Purification Tablets", quantity: 5000, availability_status: "available", metadata_: { unit: "strips", expiry: "2027-12" },                 lat: 19.0178, lng: 72.8478 },
  { id: "gr-003", type: "Food Packages",              quantity: 800,  availability_status: "in_use",    metadata_: { unit: "packs",  contents: "rice / dal / oil" },      lat: 19.1136, lng: 72.8697 },
  { id: "gr-004", type: "Rescue Boats",               quantity: 4,    availability_status: "available", metadata_: { capacity: "8 persons" },                             lat: 19.0460, lng: 72.8953 },
  { id: "gr-005", type: "Temporary Shelters",         quantity: 0,    availability_status: "depleted",  metadata_: { unit: "tents",  size: "6-person" },                  lat: 18.9647, lng: 72.8258 },
  { id: "gr-006", type: "First Aid Boxes",            quantity: 50,   availability_status: "available", metadata_: { unit: "kits",   certified: true },                   lat: 19.0760, lng: 72.8777 },
];

// ── Events ───────────────────────────────────────────────────────────────────

export const GUEST_EVENTS = [
  { id: "ge-001", title: "Flood Relief Mega Drive",          description: "Large-scale volunteer mobilisation for flood relief across Mumbai.",                   event_type: "drive",    date: "2026-05-16T08:00:00Z", location: "Dharavi Community Ground",             max_volunteers: 50, status: "upcoming", attendee_count: 32 },
  { id: "ge-002", title: "Medical Awareness & Free Camp",    description: "Free health checkup camp with doctors from KEM Hospital.",                            event_type: "camp",     date: "2026-05-22T09:00:00Z", location: "Versova Beach Ground",                 max_volunteers: 20, status: "upcoming", attendee_count: 14 },
  { id: "ge-003", title: "Volunteer First Aid Training",     description: "Certified first aid and CPR training for all registered volunteers.",                  event_type: "training", date: "2026-05-28T10:00:00Z", location: "SynapseAI Training Centre, Andheri",  max_volunteers: 30, status: "upcoming", attendee_count: 22 },
  { id: "ge-004", title: "Environmental Cleanup Drive",      description: "Post-flood debris and waste cleanup drive along Mithi River.",                        event_type: "drive",    date: "2026-06-05T07:00:00Z", location: "Mithi River Bank, Kurla",              max_volunteers: 40, status: "upcoming", attendee_count: 18 },
];

export const GUEST_ATTENDANCE = [
  { volunteer_id: "gv-001", email: "amit.k@demo.synapse",  status: "present"  },
  { volunteer_id: "gv-002", email: "priya.s@demo.synapse", status: "invited"  },
  { volunteer_id: "gv-003", email: "rahul.s@demo.synapse", status: "invited"  },
  { volunteer_id: "gv-004", email: "meera.p@demo.synapse", status: "absent"   },
];

// ── Analytics ────────────────────────────────────────────────────────────────

export const GUEST_ANALYTICS = {
  task_completion_rate:   0.75,
  completed_tasks:        6,
  total_tasks:            8,
  volunteer_utilization:  0.82,
  total_assignments:      12,
  completed_assignments:  9,
  avg_assignment_time_hours: 4.5,
  skill_coverage: {
    logistics:             3,
    medical_aid:           2,
    first_aid:             3,
    search_rescue:         2,
    community_outreach:    2,
    water_purification:    1,
    teaching:              2,
    structural_assessment: 1,
  },
  skill_gaps: ["water_purification", "structural_assessment"],
  skill_coverage_gaps: [
    { skill: "water_purification",    demand: 3, supply: 1 },
    { skill: "structural_assessment", demand: 2, supply: 1 },
  ],
  top_skills: [["logistics", 3], ["first_aid", 3], ["medical_aid", 2]],
  volunteer_count: 5,
};

// ── NGO assignments (for map) ─────────────────────────────────────────────────

export const GUEST_NGO_ASSIGNMENTS = [
  { id: "ga-asgn-001", task_id: "gt-001", volunteer_id: "gv-002", status: "accepted", assigned_at: "2026-05-01T08:00:00Z" },
  { id: "ga-asgn-002", task_id: "gt-002", volunteer_id: "gv-004", status: "accepted", assigned_at: "2026-05-02T09:00:00Z" },
  { id: "ga-asgn-003", task_id: "gt-003", volunteer_id: "gv-002", status: "assigned", assigned_at: "2026-05-03T10:00:00Z" },
  { id: "ga-asgn-004", task_id: "gt-004", volunteer_id: "gv-005", status: "accepted", assigned_at: "2026-04-25T07:00:00Z" },
];

// ── NGO notifications ─────────────────────────────────────────────────────────

export const GUEST_NGO_NOTIFICATIONS = [
  { id: "gnn-001", message: "Volunteer Meera Patel accepted the Medical Camp Setup assignment.",           type: "status_update", is_read: false, created_at: "2026-05-02T10:00:00Z" },
  { id: "gnn-002", message: "Task 'Temporary Shelter Construction' completed successfully.",              type: "task_assigned", is_read: false, created_at: "2026-05-10T14:00:00Z" },
  { id: "gnn-003", message: "3 new volunteers joined your NGO this week.",                                type: "general",       is_read: true,  created_at: "2026-05-01T09:00:00Z" },
  { id: "gnn-004", message: "Deadline approaching: Rescue Operations — Rooftop due in 2 days.",           type: "task_assigned", is_read: false, created_at: "2026-05-10T08:00:00Z" },
  { id: "gnn-005", message: "Medical Supply Convoy completed. Supplies delivered to 6 camps.",            type: "status_update", is_read: true,  created_at: "2026-05-08T16:00:00Z" },
  { id: "gnn-006", message: "Knowledge graph updated with 3 new high-urgency needs in Dharavi.",          type: "general",       is_read: true,  created_at: "2026-04-30T12:00:00Z" },
];

// ── Enrollment requests ───────────────────────────────────────────────────────

export const GUEST_ENROLLMENT_REQUESTS = [
  { id: "ger-001", task_id: "gt-006", task_title: "Flood Safety Awareness Drive", volunteer_id: "gv-003", volunteer_email: "rahul.s@demo.synapse", reason: "I have experience conducting community outreach sessions in Pune.", why_useful: "I speak Marathi and can communicate effectively with local residents.", status: "pending", created_at: "2026-05-04T09:00:00Z" },
];

// ── AI match result ───────────────────────────────────────────────────────────

export const GUEST_AI_MATCH_RESULT = {
  ranked_volunteers: [
    { volunteer_id: "gv-001", name: "Amit Kumar",   email: "amit.k@demo.synapse",  score: 0.94, matched_skills: ["medical_aid", "first_aid"],      workload: 1 },
    { volunteer_id: "gv-005", name: "Arjun Nair",   email: "arjun.n@demo.synapse", score: 0.87, matched_skills: ["search_rescue", "first_aid"],     workload: 1 },
    { volunteer_id: "gv-004", name: "Meera Patel",  email: "meera.p@demo.synapse", score: 0.75, matched_skills: ["medical_aid"],                    workload: 1 },
    { volunteer_id: "gv-003", name: "Rahul Singh",  email: "rahul.s@demo.synapse", score: 0.62, matched_skills: ["community_outreach"],              workload: 0 },
    { volunteer_id: "gv-002", name: "Priya Sharma", email: "priya.s@demo.synapse", score: 0.55, matched_skills: ["logistics"],                      workload: 2 },
  ],
};

// ── NGO Dashboard (already used by ngo/dashboard/page.tsx) ───────────────────

export const GUEST_NGO_DASHBOARD = {
  total_volunteers:  5,
  active_tasks:      6,
  completed_tasks:   2,
  resource_count:    6,
  pending_assignments: 3,
  invite_code:       "DEMO-NGO8",
  recent_tasks:      GUEST_TASKS.slice(0, 8).map(({ id, title, status, priority, deadline }) => ({ id, title, status, priority, deadline })),
};

export const GUEST_NGO_ALERTS = [
  { type: "shortage", severity: "high"   as const, message: "Critical shortage of medical supplies for 3 active relief tasks — immediate procurement needed." },
  { type: "staffing", severity: "medium" as const, message: "3 high-priority tasks are awaiting volunteer assignments. Use AI-Match to assign." },
];

// ── Volunteer dashboard ───────────────────────────────────────────────────────

export const GUEST_VOL_DASHBOARD = {
  assigned_tasks:    4,
  completed_tasks:   2,
  upcoming_deadlines: [
    { title: "Flood Relief — Food Distribution", deadline: "2026-05-15T00:00:00Z" },
    { title: "Medical Camp Setup",               deadline: "2026-05-18T00:00:00Z" },
  ],
  assignments: [
    { id: "ga-001", task_title: "Flood Relief — Food Distribution", task_description: "Distribute food packages to flood-affected families in Dharavi. Coordinate with local teams.",      required_skills: ["logistics", "community_outreach"], status: "assigned"  as const, deadline: "2026-05-15T00:00:00Z", assigned_at: "2026-05-01T08:00:00Z" },
    { id: "ga-002", task_title: "Medical Camp Setup",               task_description: "Set up temporary medical camp at Versova community ground. Assist doctors and manage supplies.", required_skills: ["first_aid", "medical_aid"],         status: "accepted"  as const, deadline: "2026-05-18T00:00:00Z", assigned_at: "2026-05-02T09:30:00Z" },
    { id: "ga-003", task_title: "Temporary Shelter Construction",   task_description: "Help construct temporary shelters for displaced residents in Malad West.",                        required_skills: ["search_rescue", "logistics"],       status: "completed" as const, deadline: "2026-05-10T00:00:00Z", assigned_at: "2026-04-28T07:00:00Z" },
    { id: "ga-004", task_title: "Flood Safety Awareness Drive",     task_description: "Conduct awareness sessions on flood safety and evacuation procedures in Kurla.",                  required_skills: ["community_outreach", "teaching"],   status: "rejected"  as const, deadline: "2026-06-01T00:00:00Z", assigned_at: "2026-05-03T10:00:00Z" },
  ],
};

// ── Volunteer profile (for /vol/profile) ──────────────────────────────────────

export const GUEST_VOL_PROFILE = {
  user_id:                   "guest-user-demo-0001",
  email:                     "guest@synapse.demo",
  full_name:                 "Demo Volunteer",
  skills:                    ["search_rescue", "first_aid", "logistics"],
  availability:              { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  status:                    "active",
  lat:                       19.0760,
  lng:                       72.8777,
  city:                      "Mumbai",
  bio:                       "Passionate volunteer with 2 years of emergency relief experience. Certified in first aid and CPR.",
  years_experience:          2,
  certifications:            ["First Aid", "CPR"],
  languages:                 ["English", "Hindi"],
  causes_supported:          ["Disaster Relief", "Healthcare"],
  education_level:           "undergraduate",
  preferred_roles:           ["Field Responder", "Logistics Coordinator"],
  motivation_statement:      "I want to make a tangible difference in the lives of disaster-affected communities.",
  share_location:            false,
  performance_score:         0.85,
  completed_tasks:           2,
  total_assigned:            4,
};

// ── Volunteer tasks (for /vol/tasks) ──────────────────────────────────────────

export const GUEST_VOL_TASKS = [
  { task_id: "gt-001", title: "Flood Relief — Food Distribution", description: "Distribute food packages to flood-affected families.",   required_skills: ["logistics", "community_outreach"], task_status: "open",        deadline: "2026-05-15T00:00:00Z", assignment_id: "ga-001", assignment_status: "assigned",  assigned_at: "2026-05-01T08:00:00Z" },
  { task_id: "gt-002", title: "Medical Camp Setup",               description: "Set up temporary medical camp at Versova.",              required_skills: ["first_aid", "medical_aid"],         task_status: "in_progress", deadline: "2026-05-18T00:00:00Z", assignment_id: "ga-002", assignment_status: "accepted",  assigned_at: "2026-05-02T09:30:00Z" },
  { task_id: "gt-003", title: "Temporary Shelter Construction",   description: "Help construct temporary shelters in Malad West.",       required_skills: ["search_rescue", "logistics"],       task_status: "completed",   deadline: "2026-05-10T00:00:00Z", assignment_id: "ga-003", assignment_status: "completed", assigned_at: "2026-04-28T07:00:00Z" },
  { task_id: "gt-004", title: "Flood Safety Awareness Drive",     description: "Conduct awareness sessions on flood safety in Kurla.",   required_skills: ["community_outreach", "teaching"],   task_status: "open",        deadline: "2026-06-01T00:00:00Z", assignment_id: "ga-004", assignment_status: "rejected",  assigned_at: "2026-05-03T10:00:00Z" },
];

// ── Open tasks (for /vol/all-tasks) ──────────────────────────────────────────

export const GUEST_OPEN_TASKS = [
  { id: "gt-001", title: "Flood Relief — Food Distribution", description: "Distribute emergency food packages to 500+ flood-affected families in Dharavi.",  required_skills: ["logistics", "community_outreach"], priority: "high",   deadline: "2026-05-15T00:00:00Z", created_at: "2026-04-28T00:00:00Z", match_score: 0.78, matched_skills: ["logistics"],      request_status: null },
  { id: "gt-003", title: "Drinking Water Distribution",      description: "Distribute 5 000 L of clean drinking water to communities in Chembur.",           required_skills: ["logistics", "water_purification"], priority: "medium", deadline: "2026-05-20T00:00:00Z", created_at: "2026-04-29T00:00:00Z", match_score: 0.65, matched_skills: ["logistics"],      request_status: null },
  { id: "gt-006", title: "Flood Safety Awareness Drive",     description: "Door-to-door awareness sessions on flood safety across Worli.",                    required_skills: ["community_outreach", "teaching"],   priority: "low",    deadline: "2026-06-01T00:00:00Z", created_at: "2026-04-30T00:00:00Z", match_score: 0.45, matched_skills: [],                 request_status: null },
];

// ── AI recommendations ────────────────────────────────────────────────────────

export const GUEST_RECOMMENDATIONS: RecommendedTask[] = [
  { task_id: "gt-002", title: "Medical Camp Setup",             description: "Set up temporary medical camp at Versova. Assist doctors and manage first-aid supplies.",        required_skills: ["first_aid", "medical_aid"],    deadline: "2026-05-18T00:00:00Z", priority: "high",   match_score: 0.91, matched_skills: ["first_aid", "medical_aid"] },
  { task_id: "gt-004", title: "Rescue Operations — Rooftop",   description: "Assist in rescue operations for residents stranded on rooftops in Chembur flood zones.",          required_skills: ["search_rescue", "first_aid"],  deadline: "2026-05-12T00:00:00Z", priority: "high",   match_score: 0.83, matched_skills: ["search_rescue", "first_aid"] },
  { task_id: "gt-001", title: "Flood Relief — Food Distribution", description: "Distribute food packages to over 500 flood-affected families in Dharavi.",                    required_skills: ["logistics", "community_outreach"], deadline: "2026-05-15T00:00:00Z", priority: "high",   match_score: 0.78, matched_skills: ["logistics"] },
];

// ── Volunteer notifications ───────────────────────────────────────────────────

export const GUEST_VOL_NOTIFICATIONS = [
  { id: "gvn-001", message: "You have been assigned to 'Flood Relief — Food Distribution'. Please confirm your availability.",   type: "task_assigned", is_read: false, created_at: "2026-05-01T08:30:00Z" },
  { id: "gvn-002", message: "Task 'Temporary Shelter Construction' marked as completed. Great work!",                            type: "status_update", is_read: true,  created_at: "2026-05-10T15:00:00Z" },
  { id: "gvn-003", message: "New task matching your skills: 'Drinking Water Distribution' in Chembur.",                         type: "general",       is_read: false, created_at: "2026-05-03T11:00:00Z" },
  { id: "gvn-004", message: "Reminder: Medical Camp Setup starts tomorrow. Report at Versova by 9 AM.",                          type: "task_assigned", is_read: false, created_at: "2026-05-17T20:00:00Z" },
];

// ── Knowledge graph — stats ──────────────────────────────────────────────────

export const GUEST_GRAPH_STATS = {
  total_needs:      8,
  pending_needs:    5,
  claimed_needs:    2,
  verified_needs:   1,
  total_volunteers: 5,
  active_volunteers: 4,
  coverage_pct:     63,
};

// ── Knowledge graph — hotspots ────────────────────────────────────────────────

export const GUEST_GRAPH_HOTSPOTS = {
  hotspots: [
    { area: "Dharavi",      lat: 19.0414, lng: 72.8560, need_count: 3, avg_urgency: 82.5, total_affected: 12000, sample_needs: ["Food Distribution", "Medical Aid", "Shelter"] },
    { area: "Kurla",        lat: 19.0669, lng: 72.8944, need_count: 2, avg_urgency: 76.0, total_affected: 8500,  sample_needs: ["Rescue Operations", "Water Supply"] },
    { area: "Andheri East", lat: 19.1136, lng: 72.8697, need_count: 1, avg_urgency: 58.0, total_affected: 4200,  sample_needs: ["Damage Assessment"] },
    { area: "Versova",      lat: 19.1331, lng: 72.8106, need_count: 1, avg_urgency: 70.0, total_affected: 3800,  sample_needs: ["Medical Camp"] },
    { area: "Malad West",   lat: 19.1829, lng: 72.8484, need_count: 1, avg_urgency: 65.0, total_affected: 6000,  sample_needs: ["Temporary Shelter"] },
  ],
};

// ── Knowledge graph — full node/edge graph ────────────────────────────────────

export const GUEST_GRAPH_NODES = {
  nodes: [
    { id: "need-001", label: "Need",      type: "FOOD_DISTRIBUTION", urgency_score: 85, status: "PENDING", description: "Emergency food distribution in Dharavi",       lat: 19.0414, lng: 72.8560 },
    { id: "need-002", label: "Need",      type: "MEDICAL_AID",       urgency_score: 78, status: "CLAIMED", description: "Medical camp setup in Versova",                lat: 19.1331, lng: 72.8106 },
    { id: "need-003", label: "Need",      type: "WATER_SUPPLY",      urgency_score: 72, status: "PENDING", description: "Drinking water supply in Chembur",             lat: 19.0606, lng: 72.8988 },
    { id: "need-004", label: "Need",      type: "RESCUE",            urgency_score: 91, status: "CLAIMED", description: "Rooftop rescue operations in Kurla",            lat: 19.0669, lng: 72.8944 },
    { id: "need-005", label: "Need",      type: "SHELTER",           urgency_score: 65, status: "VERIFIED",description: "Temporary shelter for displaced families",      lat: 19.1829, lng: 72.8484 },
    { id: "loc-001",  label: "Location",  name: "Dharavi",                                                                                                                lat: 19.0414, lng: 72.8560 },
    { id: "loc-002",  label: "Location",  name: "Versova",                                                                                                                lat: 19.1331, lng: 72.8106 },
    { id: "loc-003",  label: "Location",  name: "Kurla",                                                                                                                  lat: 19.0669, lng: 72.8944 },
    { id: "loc-004",  label: "Location",  name: "Andheri East",                                                                                                           lat: 19.1136, lng: 72.8697 },
    { id: "vol-001",  label: "Volunteer", name: "Amit Kumar",   xp: 450, category: "MEDICAL"   },
    { id: "vol-002",  label: "Volunteer", name: "Priya Sharma", xp: 320, category: "LOGISTICS"  },
    { id: "vol-003",  label: "Volunteer", name: "Arjun Nair",   xp: 510, category: "RESCUE"     },
    { id: "vol-004",  label: "Volunteer", name: "Meera Patel",  xp: 280, category: "MEDICAL"   },
    { id: "vol-005",  label: "Volunteer", name: "Rahul Singh",  xp: 390, category: "LOGISTICS"  },
    { id: "sk-001",   label: "Skill",     name: "medical_aid"         },
    { id: "sk-002",   label: "Skill",     name: "search_rescue"       },
    { id: "sk-003",   label: "Skill",     name: "logistics"           },
    { id: "sk-004",   label: "Skill",     name: "first_aid"           },
    { id: "sk-005",   label: "Skill",     name: "water_purification"  },
  ],
  edges: [
    { source: "need-001", target: "loc-001", relationship: "LOCATED_IN" },
    { source: "need-002", target: "loc-002", relationship: "LOCATED_IN" },
    { source: "need-003", target: "loc-003", relationship: "LOCATED_IN" },
    { source: "need-004", target: "loc-003", relationship: "LOCATED_IN" },
    { source: "need-005", target: "loc-004", relationship: "LOCATED_IN" },
    { source: "vol-001",  target: "need-002", relationship: "ASSIGNED_TO" },
    { source: "vol-003",  target: "need-004", relationship: "ASSIGNED_TO" },
    { source: "vol-001",  target: "sk-001",   relationship: "HAS_SKILL" },
    { source: "vol-001",  target: "sk-004",   relationship: "HAS_SKILL" },
    { source: "vol-002",  target: "sk-003",   relationship: "HAS_SKILL" },
    { source: "vol-002",  target: "sk-005",   relationship: "HAS_SKILL" },
    { source: "vol-003",  target: "sk-002",   relationship: "HAS_SKILL" },
    { source: "vol-003",  target: "sk-004",   relationship: "HAS_SKILL" },
    { source: "vol-004",  target: "sk-001",   relationship: "HAS_SKILL" },
    { source: "vol-005",  target: "sk-003",   relationship: "HAS_SKILL" },
    { source: "need-001", target: "sk-003",   relationship: "REQUIRES" },
    { source: "need-002", target: "sk-001",   relationship: "REQUIRES" },
    { source: "need-003", target: "sk-005",   relationship: "REQUIRES" },
    { source: "need-004", target: "sk-002",   relationship: "REQUIRES" },
    { source: "need-001", target: "need-003", relationship: "CAUSES" },
    { source: "need-004", target: "need-005", relationship: "CAUSES" },
  ],
  count: 19,
};

// ── Knowledge graph — needs list ──────────────────────────────────────────────

export const GUEST_GRAPH_NEEDS = {
  needs: [
    { n: { id: "need-001", status: "PENDING", type: "FOOD_DISTRIBUTION", urgency_score: 85, description: "Emergency food distribution in Dharavi",  population_affected: 12000 }, l: { name: "Dharavi",      lat: 19.0414, lng: 72.8560 } },
    { n: { id: "need-002", status: "CLAIMED", type: "MEDICAL_AID",       urgency_score: 78, description: "Medical camp in Versova",                  population_affected: 3800  }, l: { name: "Versova",      lat: 19.1331, lng: 72.8106 } },
    { n: { id: "need-003", status: "PENDING", type: "WATER_SUPPLY",      urgency_score: 72, description: "Drinking water supply in Chembur",         population_affected: 8500  }, l: { name: "Kurla",        lat: 19.0606, lng: 72.8988 } },
    { n: { id: "need-004", status: "CLAIMED", type: "RESCUE",            urgency_score: 91, description: "Rooftop rescue in Kurla",                   population_affected: 2200  }, l: { name: "Kurla",        lat: 19.0669, lng: 72.8944 } },
    { n: { id: "need-005", status: "VERIFIED",type: "SHELTER",           urgency_score: 65, description: "Temporary shelter in Malad",                population_affected: 6000  }, l: { name: "Malad West",   lat: 19.1829, lng: 72.8484 } },
  ],
};

// ── Knowledge graph — volunteer & task nodes ──────────────────────────────────

export const GUEST_GRAPH_VOLUNTEERS_DATA = V.map((v, i) => ({
  v: {
    id:                  v.id,
    name:                v.name,
    availabilityStatus:  "ACTIVE",
    reputationScore:     [4.8, 4.5, 4.7, 4.3, 4.9][i],
    totalXP:             [450, 320, 390, 280, 510][i],
    totalTasksCompleted: [3, 2, 4, 2, 3][i],
    currentActiveTasks:  [1, 2, 1, 1, 1][i],
  },
  skills:         v.skills.map(name => ({ name })),
  l:              { name: v.city, lat: v.lat, lng: v.lng },
  assigned_needs: [],
}));

export const GUEST_GRAPH_TASKS_DATA = GUEST_TASKS.slice(0, 5).map(t => ({
  t: { id: t.id, title: t.title, status: t.status, created_at: t.created_at },
  l: { name: ["Dharavi", "Versova", "Chembur", "Kurla", "Malad"][GUEST_TASKS.indexOf(t)] ?? "Mumbai", lat: t.lat, lng: t.lng },
}));
