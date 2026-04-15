"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Home, User, Trophy } from "lucide-react";
import RoleGuard from "../../components/auth/RoleGuard";
import { ThemeToggle } from "../../components/ui/ThemeToggle";

const NAV_ITEMS = [
  { href: "/feed",        icon: Home,   label: "Feed"    },
  { href: "/leaderboard", icon: Trophy, label: "Ranks"   },
  { href: "/profile",     icon: User,   label: "Profile" },
];

function VolunteerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-[#F5F6F1] dark:bg-gray-950 shadow-xl overflow-hidden relative">
      {/* Top Header */}
      <header className="bg-[#115E54] px-4 py-3 flex items-center gap-2.5 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/logo-icon.png" alt="logo" className="h-6 w-6 object-contain" />
        <span className="text-sm font-bold text-white tracking-tight">Sanchaalan Saathi</span>
        <span className="text-[10px] text-white/50 ml-1 hidden sm:block">Field Portal</span>
        <div className="ml-auto">
          <ThemeToggle size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:border-white/30" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-16">
        {children}
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around py-1.5 z-50 shadow-[0_-1px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-1px_12px_rgba(0,0,0,0.3)]">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));
          return (
            <a
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg transition-all ${
                isActive ? "text-[#115E54] dark:text-[#48A15E]" : "text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>{label}</span>
              {isActive && <span className="w-1 h-1 rounded-full bg-[#115E54] dark:bg-[#48A15E] mt-0.5" />}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

export default function VolunteerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard requiredRole="Volunteer">
      <VolunteerShell>{children}</VolunteerShell>
    </RoleGuard>
  );
}
