"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  CheckCircle,
  ClipboardList,
  Clock,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";

import { api, friendlyError, RecommendedTask } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";
import { isGuestMode } from "../../../lib/guest-mode";
import { GUEST_RECOMMENDATIONS, GUEST_VOL_DASHBOARD } from "../../../lib/guest-mock-data";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingCard,
  PageHeader,
  PRIORITY_TONES,
  StatTile,
  StatusBadge,
} from "../../../components/ui/primitives";

/** Shape returned by /api/volunteer/dashboard — counts, not a task list. */
type DashData = {
  active_assignments: number;
  completed_tasks: number;
  unread_notifications: number;
  upcoming_deadlines: { task_id: string; title: string; deadline?: string }[];
};

/** Shape returned by /api/volunteer/tasks. */
type VolTask = {
  assignment_id: string;
  task_id: string;
  title: string;
  description?: string;
  required_skills?: string[];
  priority?: string;
  assignment_status: string;
  deadline?: string;
};

const ACTIVE = new Set(["assigned", "accepted"]);

export default function VolDashboardPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const router = useRouter();

  const [data, setData] = useState<DashData | null>(null);
  const [tasks, setTasks] = useState<VolTask[]>([]);
  const [recs, setRecs] = useState<RecommendedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    if (isGuestMode()) {
      setData(GUEST_VOL_DASHBOARD as unknown as DashData);
      setTasks(((GUEST_VOL_DASHBOARD as any).assignments ?? []) as VolTask[]);
      setRecs(GUEST_RECOMMENDATIONS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      api.volDashboard(user.token),
      // The dashboard endpoint returns counts only, so the actionable list
      // comes from the tasks endpoint.
      api.volTasks(user.token).catch(() => []),
      api.getRecommendations(user.token).catch(() => []),
    ])
      .then(([dashboard, volTasks, recommendations]) => {
        setData(dashboard as DashData);
        setTasks(volTasks as VolTask[]);
        setRecs(recommendations as RecommendedTask[]);
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    load();
  }, [user, authLoading, router, load]);

  const act = async (assignmentId: string, action: "accept" | "reject" | "complete") => {
    if (isGuestMode()) {
      const next =
        action === "accept" ? "accepted" : action === "reject" ? "rejected" : "completed";
      setTasks((prev) =>
        prev.map((t) => (t.assignment_id === assignmentId ? { ...t, assignment_status: next } : t)),
      );
      return;
    }
    if (!user) return;

    setBusy(assignmentId);
    try {
      if (action === "accept") await api.acceptAssignment(user.token, assignmentId);
      else if (action === "reject") await api.rejectAssignment(user.token, assignmentId);
      else await api.completeAssignment(user.token, assignmentId);
      load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="p-6">
        <PageHeader title="My dashboard" description="Your assignments and what is coming up." />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <LoadingCard key={i} lines={1} />
          ))}
        </div>
        <div className="mt-6">
          <LoadingCard lines={5} />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const active = tasks.filter((t) => ACTIVE.has(t.assignment_status));
  const deadlines = data?.upcoming_deadlines ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      <PageHeader
        title="My dashboard"
        description="Your assignments and what is coming up."
        action={
          <Button variant="secondary" onClick={() => router.push("/vol/all-tasks")}>
            Browse open tasks
          </Button>
        }
      />

      {isGuestMode() && (
        <Card className="mb-4 flex items-center gap-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Star size={14} className="shrink-0" />
          Demo mode — showing simulated data. Nothing is saved.
        </Card>
      )}

      {error && (
        <Card className="mb-4">
          <ErrorState message={error} onRetry={load} />
        </Card>
      )}

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Active assignments"
          value={data?.active_assignments ?? 0}
          icon={<ClipboardList size={16} />}
        />
        <StatTile
          label="Completed"
          value={data?.completed_tasks ?? 0}
          icon={<CheckCircle size={16} />}
        />
        <StatTile
          label="Upcoming deadlines"
          value={deadlines.length}
          hint={data?.unread_notifications ? `${data.unread_notifications} unread` : undefined}
          tone={data?.unread_notifications ? "info" : "neutral"}
          icon={<Clock size={16} />}
        />
      </section>

      <Card className="mt-6">
        <CardHeader
          title="Your assignments"
          description="Accept what you can take on, then mark it done when finished."
        />
        {active.length === 0 ? (
          <EmptyState
            title="Nothing assigned right now"
            description="Browse the open tasks and pick up something that matches your skills."
            icon={<ClipboardList size={28} />}
            action={<Button onClick={() => router.push("/vol/all-tasks")}>Browse open tasks</Button>}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {active.map((task) => (
              <li key={task.assignment_id} className="flex flex-wrap gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{task.title}</p>
                    <StatusBadge value={task.assignment_status} />
                    {task.priority && (
                      <Badge tone={PRIORITY_TONES[task.priority] ?? "neutral"}>
                        {task.priority}
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-white/50">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-white/45">
                    {task.deadline && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} />
                        Due {new Date(task.deadline).toLocaleDateString()}
                      </span>
                    )}
                    {(task.required_skills ?? []).length > 0 && (
                      <span>{task.required_skills!.join(", ")}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-start gap-2">
                  {task.assignment_status === "assigned" ? (
                    <>
                      <Button
                        loading={busy === task.assignment_id}
                        onClick={() => act(task.assignment_id, "accept")}
                      >
                        <CheckCheck size={14} />
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy === task.assignment_id}
                        onClick={() => act(task.assignment_id, "reject")}
                      >
                        <XCircle size={14} />
                        Decline
                      </Button>
                    </>
                  ) : (
                    <Button
                      loading={busy === task.assignment_id}
                      onClick={() => act(task.assignment_id, "complete")}
                    >
                      <CheckCircle size={14} />
                      Mark done
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {deadlines.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Upcoming deadlines" description="Soonest first." />
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {deadlines.map((item) => (
              <li
                key={item.task_id}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <span className="truncate text-gray-900 dark:text-gray-100">{item.title}</span>
                <span className="shrink-0 text-gray-500 dark:text-white/50">
                  {item.deadline ? new Date(item.deadline).toLocaleDateString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader
          title="Recommended for you"
          description="Ranked by how well each task matches your skills."
          action={
            <Button variant="ghost" onClick={() => router.push("/vol/all-tasks")}>
              See all
            </Button>
          }
        />
        {recs.length === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="Add skills to your profile and we will match you to suitable tasks."
            icon={<Sparkles size={28} />}
            action={
              <Button variant="secondary" onClick={() => router.push("/vol/profile")}>
                Update profile
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {recs.slice(0, 5).map((rec) => (
              <li
                key={rec.task_id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                    {rec.title}
                  </p>
                  {(rec.matched_skills ?? []).length > 0 && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-white/45">
                      Matches: {rec.matched_skills!.join(", ")}
                    </p>
                  )}
                </div>
                <Badge tone={rec.match_score >= 0.6 ? "success" : "info"}>
                  {Math.round(rec.match_score * 100)}% match
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </motion.div>
  );
}
