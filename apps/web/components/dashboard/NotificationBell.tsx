"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell, Info, AlertTriangle, CheckCircle, Check } from "lucide-react";
import { useNotifications } from "../../hooks/useFirestore";
import { doc, updateDoc, writeBatch, collection } from "firebase/firestore";
import { db } from "../../lib/firebase";

export default function NotificationBell() {
  const { notifications, loading } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
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
    try {
      const docRef = doc(db, "notifications", id);
      await updateDoc(docRef, { read: true });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        if (!n.read) {
          const docRef = doc(db, "notifications", n.id);
          batch.update(docRef, { read: true });
        }
      });
      await batch.commit();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  return (
    <div className="relative group" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg border transition-all relative ${
          unreadCount > 0 
          ? "border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan shadow-[0_0_10px_rgba(0,243,255,0.2)]" 
          : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-white"
        }`}
      >
        <Bell size={18} className={unreadCount > 0 ? "animate-[swing_2s_ease-in-out_infinite]" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-neon-red text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full animate-pulse ring-2 ring-slate-950">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 hud-panel rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.9)] border border-neon-cyan/20 z-[100] animate-[slice-in_0.2s_ease-out] overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
            <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-neon-cyan/70 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse"></span>
              Neural Notifications
            </h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                className="text-[9px] font-bold text-slate-500 hover:text-neon-cyan uppercase tracking-tighter transition-colors"
              >
                Clear Signal Hub
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-10 text-center text-[10px] font-mono text-slate-500 animate-pulse">SYNCING...</div>
            ) : notifications.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center gap-3 opacity-30">
                <Bell size={24} className="text-slate-700" />
                <p className="text-[10px] font-mono uppercase tracking-[0.2em]">Silence in Grid</p>
              </div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all cursor-default relative group/item ${!n.read ? 'bg-neon-cyan/5' : ''}`}
                >
                  {!n.read && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-neon-cyan shadow-[0_0_8px_#00f3ff]"></div>}
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[9px] font-mono px-1.5 rounded-sm border ${
                      n.type === 'URGENT' ? 'border-neon-red/30 text-neon-red bg-neon-red/10' :
                      n.type === 'SUCCESS' ? 'border-neon-green/30 text-neon-green bg-neon-green/10' :
                      'border-neon-cyan/30 text-neon-cyan bg-neon-cyan/10'
                    }`}>
                      {n.type} SIGNAL
                    </span>
                    <span className="text-[8px] font-mono text-slate-600">
                      {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'RECENT'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-200 mb-1 line-clamp-1">{n.title}</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-3 line-clamp-2">{n.message}</p>
                  
                  {!n.read && (
                    <button 
                      onClick={() => markRead(n.id)}
                      className="text-[9px] font-bold text-neon-cyan opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-1 hover:underline"
                    >
                      Acknowledge <Check size={8} />
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
