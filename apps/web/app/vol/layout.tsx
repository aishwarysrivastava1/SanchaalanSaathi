"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, User, Bell, BarChart2, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "motion/react";
import { NGOAuthProvider, useNGOAuth } from "../../lib/ngo-auth";
import { ThemeToggle } from "../../components/ui/ThemeToggle";

const NAV_ITEMS = [
  { href: "/vol/dashboard",     icon: LayoutDashboard, label: "Dashboard",     sub: "Tasks & overview"      },
  { href: "/vol/profile",       icon: User,            label: "My Profile",    sub: "Skills & availability" },
  { href: "/vol/notifications", icon: Bell,            label: "Notifications", sub: "Updates & alerts"      },
  { href: "/vol/analytics",     icon: BarChart2,       label: "Insights",      sub: "Performance & AI"      },
];

function VolSidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useNGOAuth();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 transition-all duration-300 ease-in-out ${
        collapsed ? "w-[60px]" : "w-[220px]"
      }`}
      style={{ background: "linear-gradient(180deg, #0d4a42 0%, #072921 100%)" }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 border-b border-white/10 shrink-0 transition-all duration-300 ${
        collapsed ? "px-0 py-4 justify-center" : "px-4 py-4"
      }`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/logo-icon.png" alt="logo" className="h-7 w-7 object-contain shrink-0" />
        {!collapsed && (
          <div className="leading-none overflow-hidden">
            <p className="text-sm font-bold text-white truncate">Sanchaalan Saathi</p>
            <p className="text-[10px] text-white/45 mt-0.5">Volunteer Portal</p>
          </div>
        )}
      </div>

      {/* User pill */}
      {!collapsed && user && (
        <div className="mx-2 mt-2 rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="w-5 h-5 rounded-full bg-emerald-500/30 flex items-center justify-center shrink-0">
            <User size={10} className="text-emerald-300" />
          </div>
          <p className="text-[10px] text-white/50 truncate">{user.email}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-hidden">
        {NAV_ITEMS.map(({ href, icon: Icon, label, sub }) => {
          const isActive = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-xl transition-colors duration-150 relative ${
                collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2.5"
              } ${isActive ? "text-white" : "text-white/50 hover:text-white/85"}`}
            >
              {isActive && (
                <motion.div
                  layoutId="vol-active-nav"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon size={15} strokeWidth={isActive ? 2.5 : 1.8} className="shrink-0 relative z-10" />
              {!collapsed && (
                <div className="flex-1 min-w-0 relative z-10">
                  <p className="text-xs font-semibold truncate">{label}</p>
                  <p className="text-[10px] text-white/35 truncate">{sub}</p>
                </div>
              )}
              {isActive && !collapsed && <div className="w-0.5 h-5 bg-white/50 rounded-full shrink-0 relative z-10" />}
              {isActive && collapsed && (
                <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white/50 rounded-full z-10" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`px-2 pb-3 border-t border-white/10 pt-3 space-y-1 ${collapsed ? "flex flex-col items-center" : ""}`}>
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          className={`flex items-center gap-2 text-white/35 hover:text-red-400 transition-all active:scale-90 rounded-lg text-xs py-1.5 w-full ${
            collapsed ? "w-10 h-10 justify-center rounded-xl" : "px-3"
          }`}
        >
          <LogOut size={13} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

function VolLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const activeItem = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname?.startsWith(i.href + "/")
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0B3D36" }}>
      <VolSidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Desktop header */}
        <header className="hidden md:flex items-center h-13 px-4 shrink-0 gap-3" style={{ background: "#115E54" }}>
          <motion.button
            onClick={() => setCollapsed((c) => !c)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </motion.button>
          <div className="w-px h-5 bg-white/15 shrink-0" />
          <p className="text-sm font-bold text-white">{activeItem?.label ?? "Volunteer Portal"}</p>
          {activeItem?.sub && (
            <p className="ml-1 text-[11px] text-white/45">{activeItem.sub}</p>
          )}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] text-white/40">
              <div className="w-1.5 h-1.5 rounded-full bg-[#48A15E] animate-pulse" />
              Live
            </div>
            <ThemeToggle size="sm" />
          </div>
        </header>

        {/* Mobile header */}
        <header className="md:hidden px-4 py-3 flex items-center gap-2.5 shrink-0" style={{ background: "#115E54" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="logo" className="h-6 w-6 object-contain" />
          <span className="text-sm font-bold text-white">Sanchaalan Saathi</span>
          <span className="text-[10px] text-white/45 ml-1">Volunteer Portal</span>
        </header>

        <div className="flex-1 overflow-y-auto pb-16 md:pb-0 custom-scrollbar" style={{ background: "#0B3D36" }}>
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-1.5 z-50 shadow-[0_-2px_16px_rgba(0,0,0,0.07)]">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg transition-all active:scale-95 ${
                  isActive ? "text-[#115E54]" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>{label}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-[#115E54]" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default function VolLayout({ children }: { children: React.ReactNode }) {
  return (
    <NGOAuthProvider>
      <VolLayoutInner>{children}</VolLayoutInner>
    </NGOAuthProvider>
  );
}
