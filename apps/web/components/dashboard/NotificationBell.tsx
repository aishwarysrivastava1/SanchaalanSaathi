"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell, Check } from "lucide-react";
import { useNotifications } from "../../hooks/useFirestore";
import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";

export default function NotificationBell() {
  const { notifications, loading } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markRead = async (id: string) => {
    if (!db) return;

    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllRead = async () => {
    if (!db) return;

    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        if (!n.read) batch.update(doc(db, "notifications", n.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg border transition-all relative ${
          unreadCount > 0
            ? "border-[#115E54]/30 bg-[#115E54]/8 text-[#115E54]"
            : "border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300"
        }`}
      >
        <Bell size={18} className={unreadCount > 0 ? "animate-[swing_2s_ease-in-out_infinite]" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-[100] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#115E54] hover:text-[#0d4a42] font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center gap-2">
                <Bell size={22} className="text-gray-300" />
                <p className="text-sm text-gray-400">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-50 last:border-0 relative group/item ${
                    !n.read ? "bg-[#115E54]/4" : "hover:bg-gray-50"
                  }`}
                >
                  {!n.read && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#115E54]" />
                  )}
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                      n.type === "URGENT"
                        ? "border-red-200 text-red-600 bg-red-50"
                        : n.type === "SUCCESS"
                        ? "border-[#48A15E]/30 text-[#2A8256] bg-[#48A15E]/10"
                        : "border-[#115E54]/20 text-[#115E54] bg-[#115E54]/8"
                    }`}>
                      {n.type}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {n.createdAt?.toDate
                        ? n.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Recent"}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-gray-800 mb-0.5 line-clamp-1">{n.title}</h4>
                  <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{n.message}</p>
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="mt-1.5 text-[10px] text-[#115E54] opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-1 hover:underline"
                    >
                      Mark read <Check size={9} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
