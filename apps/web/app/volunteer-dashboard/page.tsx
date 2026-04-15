"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RoleGuard from "../../components/auth/RoleGuard";
import { useAuth } from "../../lib/auth";

function VolunteerRedirect() {
  const router = useRouter();
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      router.replace("/feed");
    }
  }, [loading, router]);

  return (
    <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#115E54] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function VolunteerDashboardPage() {
  return (
    <RoleGuard requiredRole="Volunteer">
      <VolunteerRedirect />
    </RoleGuard>
  );
}
