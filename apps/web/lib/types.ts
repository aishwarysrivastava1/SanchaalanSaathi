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
}

export interface NeedNode {
  id: string;
  type: string;
  sub_type: string;
  description: string;
  urgency_score: number;
  population_affected: number;
  status: string;
  location: { lat: number; lng: number; name: string };
}

export interface HotspotResult {
  area: string;
  need_count: number;
  sample_needs: string[];
}

export interface SimulationResult {
  strategy: string;
  steps_simulated: number;
  tasks_completed: number;
  total_tasks: number;
  completion_rate: number;
  estimated_hours: number;
}

export interface SimulationComparison {
  comparison: {
    baseline: SimulationResult;
    optimized: SimulationResult;
    delta_completion_rate: number;
  };
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

