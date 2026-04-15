"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, UserRole } from "../../lib/auth";

interface RoleGuardProps {
  requiredRole: UserRole;
  children: React.ReactNode;
}

export default function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (role === null) {
      router.replace("/select-role");
      return;
    }
    if (role !== requiredRole) {
      router.replace(role === "NGO" ? "/ngo-dashboard" : "/volunteer-dashboard");
    }
  }, [user, role, loading, requiredRole, router]);

  if (loading || !user || role !== requiredRole) {
    return (
      <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#115E54] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
