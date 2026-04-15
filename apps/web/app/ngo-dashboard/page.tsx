"use client";

import RoleGuard from "../../components/auth/RoleGuard";
import NGODashboard from "../../components/dashboard/NGODashboard";

export default function NGODashboardPage() {
  return (
    <RoleGuard requiredRole="NGO">
      <NGODashboard />
    </RoleGuard>
  );
}
