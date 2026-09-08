"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ClipboardCopy,
  ClipboardList,
  Clock,
  Package,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";

import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";
import { isGuestMode } from "../../../lib/guest-mode";
import { GUEST_NGO_ALERTS, GUEST_NGO_DASHBOARD } from "../../../lib/guest-mock-data";
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

type DashData = {
  total_volunteers: number;
  active_tasks: number;
  open_tasks: number;
  completed_tasks: number;
  resource_count: number;
  pending_assignments: number;
  recent_tasks?: {
    id: string;
    title: string;
    status: string;
    deadline?: string;
    priority?: string;
  }[];
  invite_code?: string;
};

type Alert = {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
};

export default function NGODashboardPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const router = useRouter();

  const [data, setData] = useState<DashData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!user.ngo_id) router.replace("/ngo/setup");
  }, [user, authLoading, router]);

  const load = useCallback(() => {
    if (!user) return;
    if (isGuestMode()) {
      setData(GUEST_NGO_DASHBOARD as DashData);
      setAlerts(GUEST_NGO_ALERTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      api.ngoDashboard(user.token),
      api.ngoAlerts(user.token).catch(() => ({ alerts: [] })),
    ])
      .then(([dashboard, alertPayload]) => {
        setData(dashboard as DashData);
        setAlerts(((alertPayload as any).alerts ?? []) as Alert[]);
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const copyInviteCode = () => {
    if (!data?.invite_code) return;
    navigator.clipboard.writeText(data.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading || loading) {
    return (
      <div className="p-6">
        <PageHeader title="Dashboard" description="Your operation at a glance." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
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

  if (error) {
    return (
      <div className="p-6">
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      </div>
    );
  }

  const pending = data?.pending_assignments ?? 0;
  const recentTasks = data?.recent_tasks ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      <PageHeader
        title="Dashboard"
        description="Your operation at a glance."
        action={
          <Button variant="secondary" onClick={() => router.push("/ngo/tasks")}>
            Manage tasks
          </Button>
        }
      />

      <div className="mb-6 space-y-3">
        {isGuestMode() && (
          <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <Star size={14} className="shrink-0" />
            Demo mode — showing simulated data. Nothing is saved.
          </Card>
        )}

        {data?.invite_code && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Your NGO invite code
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-white/50">
                Volunteers need this to join your organisation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="select-all rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-gray-900 dark:border-white/15 dark:bg-white/5 dark:text-gray-100">
                {data.invite_code}
              </code>
              <Button variant="secondary" onClick={copyInviteCode}>
                {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </Card>
        )}

        {alerts.map((alert, index) => (
          <Card
            key={`${alert.type}-${index}`}
            role="alert"
            className={
              "flex items-start gap-3 px-4 py-3 text-sm " +
              (alert.severity === "high"
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200")
            }
          >
            {alert.type === "shortage" ? (
              <Zap size={15} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            )}
            <span>{alert.message}</span>
          </Card>
        ))}

        {pending > 0 && (
          <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <Clock size={15} className="shrink-0" />
            <span>
              <strong>{pending}</strong> assignment{pending === 1 ? "" : "s"} awaiting a volunteer
              response.
            </span>
          </Card>
        )}
      </div>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Volunteers" value={data?.total_volunteers ?? 0} icon={<Users size={16} />} />
        <StatTile
          label="Active tasks"
          value={data?.active_tasks ?? 0}
          hint={`${data?.open_tasks ?? 0} still open`}
          icon={<ClipboardList size={16} />}
        />
        <StatTile
          label="Completed"
          value={data?.completed_tasks ?? 0}
          icon={<CheckCircle size={16} />}
        />
        <StatTile
          label="Resources"
          value={data?.resource_count ?? 0}
          icon={<Package size={16} />}
        />
      </section>

      <Card className="mt-6">
        <CardHeader
          title="Recent tasks"
          description="The five most recently created."
          action={
            recentTasks.length > 0 ? (
              <Button variant="ghost" onClick={() => router.push("/ngo/tasks")}>
                View all
              </Button>
            ) : undefined
          }
        />
        {recentTasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            description="Create your first task and it will show up here."
            icon={<ClipboardList size={28} />}
            action={<Button onClick={() => router.push("/ngo/tasks")}>Create a task</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-white/50">
                  <th className="px-5 py-3 font-medium">Task</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-gray-50 transition-colors last:border-0 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {task.title}
                    </td>
                    <td className="px-5 py-3">
                      {task.priority && (
                        <Badge tone={PRIORITY_TONES[task.priority] ?? "neutral"}>
                          {task.priority}
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge value={task.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-500 dark:text-white/50">
                      {task.deadline ? new Date(task.deadline).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
