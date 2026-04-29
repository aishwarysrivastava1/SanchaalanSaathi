"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Legacy /register — redirect to landing page where users pick their role
export default function RegisterRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return null;
}
