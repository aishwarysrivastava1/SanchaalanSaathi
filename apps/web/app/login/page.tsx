"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";

// /login is a legacy entry point — redirect to landing or correct dashboard
export default function LoginRedirect() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (role === null)         router.replace("/select-role");
    else if (role === "NGO")   router.replace("/ngo-dashboard");
    else                       router.replace("/volunteer-dashboard");
  }, [user, role, loading, router]);

  return (
    <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#115E54] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
