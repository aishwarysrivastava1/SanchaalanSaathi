"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, UserRole } from "../../lib/auth";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { Building2, Users, AlertCircle } from "lucide-react";

export default function SelectRolePage() {
  const { user, role, loading, setUserRole } = useAuth();
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if role already assigned
  useEffect(() => {
    if (loading) return;
    if (!user)              { router.replace("/");                  return; }
    if (role === "NGO")     { router.replace("/ngo-dashboard");     return; }
    if (role === "Volunteer"){ router.replace("/volunteer-dashboard"); return; }
  }, [user, role, loading, router]);

  const handleSelect = async (selected: UserRole) => {
    setSelecting(true);
    setError(null);
    try {
      await setUserRole(selected);
      router.replace(selected === "NGO" ? "/ngo-dashboard" : "/volunteer-dashboard");
    } catch (err: any) {
      console.error("[SelectRole] setUserRole failed:", err);
      setError(err?.message ?? "Failed to save role. Please try again.");
      setSelecting(false);
    }
  };

  // Show spinner only while the initial auth check is running
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#115E54] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Already has a role — redirect handled by useEffect above; show nothing
  if (!user || role !== null) return null;

  return (
    <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute top-[-20%] right-[-15%] w-[55%] h-[55%] rounded-full bg-[#115E54]/6 dark:bg-[#115E54]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-15%] w-[55%] h-[55%] rounded-full bg-[#48A15E]/6 dark:bg-[#48A15E]/8 blur-3xl" />

      <div className="absolute top-4 right-4">
        <ThemeToggle size="sm" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/logo-icon.png"
            alt="Sanchaalan Saathi"
            className="h-16 w-16 mx-auto mb-4 object-contain drop-shadow-sm"
          />
          <h1 className="text-xl font-bold text-[#115E54]">Choose your role</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1.5">
            This determines which portal you access
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3.5 text-sm text-red-700 dark:text-red-400">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Could not save role</p>
              <p className="text-xs mt-0.5 opacity-80">{error}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleSelect("NGO")}
            disabled={selecting}
            className="w-full bg-white dark:bg-gray-900 hover:bg-[#115E54]/5 dark:hover:bg-[#115E54]/10 border border-gray-200 dark:border-gray-800 hover:border-[#115E54]/30 dark:hover:border-[#115E54]/40 rounded-2xl p-5 flex items-center gap-4 transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-xl bg-[#115E54]/10 dark:bg-[#115E54]/20 flex items-center justify-center shrink-0">
              <Building2 size={22} className="text-[#115E54]" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900 dark:text-gray-100">I&apos;m an NGO</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage needs, assign tasks, view intelligence</p>
            </div>
          </button>

          <button
            onClick={() => handleSelect("Volunteer")}
            disabled={selecting}
            className="w-full bg-white dark:bg-gray-900 hover:bg-[#48A15E]/5 dark:hover:bg-[#48A15E]/10 border border-gray-200 dark:border-gray-800 hover:border-[#48A15E]/30 dark:hover:border-[#48A15E]/40 rounded-2xl p-5 flex items-center gap-4 transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 rounded-xl bg-[#48A15E]/10 dark:bg-[#48A15E]/20 flex items-center justify-center shrink-0">
              <Users size={22} className="text-[#48A15E]" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900 dark:text-gray-100">I&apos;m a Volunteer</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Claim tasks, submit proof, earn XP</p>
            </div>
          </button>
        </div>

        {selecting && (
          <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="w-4 h-4 border-2 border-[#115E54] border-t-transparent rounded-full animate-spin" />
            Saving your role…
          </div>
        )}
      </div>
    </div>
  );
}
