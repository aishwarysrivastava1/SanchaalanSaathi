"use client";

/** Notification list for both portals. The two pages differed only cosmetically. */
import React, { useState } from "react";
import { Bell, CheckCheck, ClipboardCheck, Info, Megaphone } from "lucide-react";

import { api } from "../lib/ngo-api";
import { useApi } from "../hooks/useApi";
import { useNGOAuth } from "../lib/ngo-auth";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingCard,
  PageHeader,
} from "./ui/primitives";

type Notif = {
  id: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

const ICONS: Record<string, React.ElementType> = {
  task_assigned: ClipboardCheck,
  status_update: Megaphone,
  urgent: Bell,
  general: Info,
};

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NotificationsView({ role }: { role: "ngo" | "volunteer" }) {
  const { user } = useNGOAuth();
  const isAdmin = role === "ngo";

  const { data, loading, error, reload } = useApi<Notif[]>((token) =>
    isAdmin ? api.ngoNotifications(token) : api.volNotifications(token),
  );

  // Local copy so marking as read updates instantly instead of waiting on a refetch.
  const [items, setItems] = useState<Notif[] | null>(null);
  const notifs = items ?? data ?? [];
  const unread = notifs.filter((n) => !n.is_read).length;

  const markOne = async (id: string) => {
    if (!user?.token) return;
    setItems(notifs.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const call = isAdmin ? api.markNgoNotifRead : api.markNotifRead;
    await call(user.token, id).catch(reload);
  };

  const markAll = async () => {
    if (!user?.token || !isAdmin) return;
    setItems(notifs.map((n) => ({ ...n, is_read: true })));
    await api.markAllNgoNotifsRead(user.token).catch(reload);
  };

  return (
    <div className="max-w-2xl p-6">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You are all caught up."}
        action={
          isAdmin && unread > 0 ? (
            <Button variant="secondary" onClick={markAll}>
              <CheckCheck size={14} />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingCard lines={4} />
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : notifs.length === 0 ? (
        <Card>
          <EmptyState
            title="No notifications yet"
            description={
              isAdmin
                ? "Volunteer activity will appear here."
                : "Assignments and updates will appear here."
            }
            icon={<Bell size={28} />}
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifs.map((n) => {
            const Icon = ICONS[n.type] ?? Info;
            return (
              <li key={n.id}>
                <Card
                  onClick={() => !n.is_read && markOne(n.id)}
                  className={
                    "flex items-start gap-3 p-4 " + (n.is_read ? "opacity-70" : "cursor-pointer")
                  }
                >
                  <span className="mt-0.5 shrink-0 text-secondary dark:text-accent">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 dark:text-gray-100">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-white/40">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && <Badge tone="info">New</Badge>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
