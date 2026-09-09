"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, User, Bell, BarChart2, LogOut, PanelLeftClose, PanelLeftOpen, UserCircle, ClipboardList, ListChecks } from "lucide-react";
import { motion } from "motion/react";
import { SPATIAL } from "../../lib/motion";
import { HOVER_LIFT_ICON, TAP_PRESS_ICON } from "../../lib/motion";
import { NGOAuthProvider, useNGOAuth } from "../../lib/ngo-auth";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { ChatbotWidget } from "../../components/ui/ChatbotWidget";
import { BottomNav } from "../../components/ui/BottomNav";

const NAV_ITEMS = [
  { href: "/vol/dashboard",     icon: LayoutDashboard, label: "Dashboard",     sub: "Tasks & overview"      },
  { href: "/vol/tasks",         icon: ClipboardList,   label: "My Tasks",      sub: "Assigned to me"        },
  { href: "/vol/all-tasks",     icon: ListChecks,      label: "All Tasks",     sub: "Browse & enroll"       },
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
      className={`on-dark hidden md:flex flex-col shrink-0 transition-all duration-300 ease-in-out ${
        collapsed ? "w-[60px]" : "w-[220px]"
      }`}
      style={{ background: "linear-gradient(180deg, var(--brand-700) 0%, var(--brand-900) 100%)" }}
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
            <p className="text-[10px] text-white/70 mt-0.5">Volunteer Portal</p>
          </div>
        )}
      </div>

      {/* User pill */}
      {!collapsed && user && (
        <div className="mx-2 mt-2 rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="w-5 h-5 rounded-full bg-emerald-500/30 flex items-center justify-center shrink-0">
            <User size={10} className="text-emerald-300" />
          </div>
          <p className="text-[10px] text-white/70 truncate">{user.email}</p>
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
              } ${isActive ? "text-white" : "text-white/70 hover:text-white/85"}`}
            >
              {isActive && (
                <motion.div
                  layoutId="vol-active-nav"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                  transition={SPATIAL}
                />
              )}
              <Icon size={15} strokeWidth={isActive ? 2.5 : 1.8} className="shrink-0 relative z-10" />
              {!collapsed && (
                <div className="flex-1 min-w-0 relative z-10">
                  <p className="text-xs font-semibold truncate">{label}</p>
                  <p className="text-[10px] text-white/70 truncate">{sub}</p>
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
          className={`flex items-center gap-2 text-white/70 hover:text-red-400 transition-all active:scale-90 rounded-lg text-xs py-1.5 w-full ${
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
  const router     = useRouter();
  const { user }   = useNGOAuth();
  const [collapsed, setCollapsed] = useState(false);
  const activeItem = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname?.startsWith(i.href + "/")
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--content-bg)" }}>
      <VolSidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Desktop header */}
        <header className="on-dark hidden md:flex items-center h-14 px-4 shrink-0 gap-3" style={{ background: "var(--brand-600)" }}>
          <motion.button
            onClick={() => setCollapsed((c) => !c)}
            whileHover={HOVER_LIFT_ICON}
            whileTap={TAP_PRESS_ICON}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </motion.button>
          <div className="w-px h-5 bg-white/15 shrink-0" />
          <p className="text-sm font-bold text-white">{activeItem?.label ?? "Volunteer Portal"}</p>
          {activeItem?.sub && (
            <p className="ml-1 text-[11px] text-white/70">{activeItem.sub}</p>
          )}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] text-white/70">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Live
            </div>
            <ThemeToggle size="sm" />
            <button
              onClick={() => router.push("/vol/profile")}
              title={user?.email ?? "My Profile"}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(72,161,94,0.25)" }}>
                <UserCircle size={16} className="text-emerald-300" />
              </div>
              <span className="text-xs text-white/70 max-w-[140px] truncate hidden lg:block">{user?.email}</span>
            </button>
          </div>
        </header>

        {/* Mobile header */}
        <header className="on-dark md:hidden px-4 py-3 flex items-center gap-2.5 shrink-0" style={{ background: "var(--brand-600)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="logo" className="h-6 w-6 object-contain" />
          <span className="text-sm font-bold text-white">Sanchaalan Saathi</span>
          <span className="text-[10px] text-white/70 ml-1">Volunteer Portal</span>
          <button onClick={() => router.push("/vol/profile")} aria-label="Open your profile" className="ml-auto p-1.5 rounded-lg hover:bg-white/10">
            <UserCircle size={18} className="text-white/70" />
          </button>
        </header>

        <div className="app-canvas flex-1 overflow-y-auto pb-16 md:pb-0 custom-scrollbar">
          {children}
        </div>

        <BottomNav items={NAV_ITEMS} pathname={pathname} accentId="vol-bottom-nav" />
      </div>
      <ChatbotWidget />
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
