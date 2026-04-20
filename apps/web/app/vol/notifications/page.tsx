"use client";

import React, { useEffect, useState } from "react";
import { Bell, ClipboardList, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type Notification = {
  id: string;
  message: string;
  type: "task_assigned" | "status_update" | "general";
  is_read: boolean;
  created_at: string;
};

const TYPE_META = {
  task_assigned: { icon: ClipboardList, gradient: "from-[#2A8256] to-[#48A15E]" },
  status_update: { icon: RefreshCw,     gradient: "from-[#3b82f6] to-[#60a5fa]"  },
  general:       { icon: Bell,          gradient: "from-gray-400 to-gray-500"     },
};

export default function NotificationsPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [notifs, setNotifs]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = () => {
    if (!user) return;
    api.volNotifications(user.token)
      .then((n) => setNotifs(n as Notification[]))
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = async (id: string) => {
    if (!user) return;
    try {
      await api.markNotifRead(user.token, id);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* silent */ }
  };

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-[#48A15E]" />
    </div>
  );
  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 space-y-4"
    >
      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50">
            <strong className="text-[#95C78F]">{unreadCount}</strong> unread
          </span>
          <motion.button
            onClick={async () => {
              for (const n of notifs.filter((x) => !x.is_read)) {
                await markRead(n.id);
              }
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="text-xs text-[#95C78F] hover:underline font-semibold"
          >
            Mark all read
          </motion.button>
        </div>
      )}

      {notifs.length === 0 ? (
        <motion.div
          whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-8 text-center"
          style={{ background: "var(--card-bg)" }}
        >
          <Bell size={24} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No notifications yet.</p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {[...notifs]
              .sort((a, b) => (a.is_read === b.is_read ? 0 : a.is_read ? 1 : -1))
              .map((n, i) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.general;
                const Icon = meta.icon;
                return (
                  <motion.button
                    key={n.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => !n.is_read && markRead(n.id)}
                    whileHover={!n.is_read ? { y: -2, boxShadow: "0 12px 32px rgba(42,130,86,0.12)", borderColor: "#95C78F" } : {}}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-2xl border transition-colors ${
                      n.is_read
                        ? "border-gray-200/60 opacity-60"
                        : "border-gray-200 shadow-sm"
                    }`}
                    style={{ background: "var(--card-bg)" }}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br ${meta.gradient}`}
                    >
                      <Icon size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${n.is_read ? "text-gray-500" : "text-gray-800 font-medium"}`}>
                        {n.message}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!n.is_read && (
                      <motion.div
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ background: "#48A15E" }}
                      />
                    )}
                  </motion.button>
                );
              })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
