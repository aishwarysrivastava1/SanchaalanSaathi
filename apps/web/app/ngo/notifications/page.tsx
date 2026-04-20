"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck, Loader2, AlertCircle, Info, ClipboardCheck, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, friendlyError } from "../../../lib/ngo-api";
import { useNGOAuth } from "../../../lib/ngo-auth";

type Notif = {
  id: string;
  message: string;
  type: "task_assigned" | "status_update" | "general";
  is_read: boolean;
  created_at: string;
};

const TYPE_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  task_assigned: { icon: ClipboardCheck, color: "text-[#2A8256]", bg: "rgba(42,130,86,0.1)"  },
  status_update: { icon: Megaphone,      color: "text-amber-600", bg: "rgba(217,119,6,0.1)"  },
  general:       { icon: Info,           color: "text-blue-500",  bg: "rgba(59,130,246,0.1)" },
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NGONotificationsPage() {
  const { user, loading: authLoading } = useNGOAuth();
  const [notifs, setNotifs]   = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [marking, setMarking] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.ngoNotifications(user.token)
      .then((n) => setNotifs(n as Notif[]))
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const markOne = async (id: string) => {
    if (!user) return;
    try {
      await api.markNgoNotifRead(user.token, id);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch (e: any) { setError(friendlyError(e)); }
  };

  const markAll = async () => {
    if (!user) return;
    setMarking(true);
    try {
      await api.markAllNgoNotifsRead(user.token);
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e: any) { setError(friendlyError(e)); }
    finally { setMarking(false); }
  };

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  if (authLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>;
  if (!user) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="p-6 space-y-5 max-w-2xl">

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-[#2A8256]" />
          <span className="text-sm font-bold text-gray-800">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAll}
            disabled={marking}
            className="flex items-center gap-1.5 text-xs text-[#2A8256] hover:text-[#1a6040] font-semibold disabled:opacity-50 transition-colors"
          >
            {marking ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-[#48A15E]" /></div>
      ) : notifs.length === 0 ? (
        <motion.div
          whileHover={{ y: -2, borderColor: "#95C78F" }}
          className="rounded-2xl border border-gray-200 p-10 text-center"
          style={{ background: "var(--card-bg)" }}
        >
          <Bell size={28} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No notifications yet.</p>
          <p className="text-xs text-gray-300 mt-1">Volunteer activity will appear here.</p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {notifs.map((n, i) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.general;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  onClick={() => !n.is_read && markOne(n.id)}
                  className={`rounded-2xl border p-4 flex items-start gap-3 transition-all ${
                    n.is_read ? "border-gray-100 cursor-default" : "border-gray-200 cursor-pointer hover:border-[#95C78F]"
                  }`}
                  style={{ background: n.is_read ? "var(--bg-muted)" : "var(--card-bg)" }}
                  whileHover={!n.is_read ? { y: -1 } : {}}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                    <Icon size={14} className={meta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${n.is_read ? "text-gray-400" : "text-gray-700 font-medium"}`}>
                      {n.message}
                    </p>
                    <p className="text-[10px] text-gray-300 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: "#2A8256" }} />}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
