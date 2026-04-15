"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { Building2, Users, MapPin, BarChart3, Shield, Zap, CheckCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

const NGO_FEATURES = [
  { icon: MapPin,    text: "Live intelligence map & need visualisation" },
  { icon: BarChart3, text: "Real-time analytics & task management" },
  { icon: Users,     text: "Coordinate and register volunteers" },
  { icon: Shield,    text: "AI-powered verification pipeline" },
];

const VOLUNTEER_FEATURES = [
  { icon: MapPin,       text: "Claim open field tasks near you" },
  { icon: CheckCircle,  text: "Submit photo proof for AI verification" },
  { icon: Zap,          text: "Earn XP and climb the leaderboard" },
  { icon: Shield,       text: "Build your reputation score" },
];

export default function LandingPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (loading || !user) return;
    if (role === null)         router.replace("/select-role");
    else if (role === "NGO")   router.replace("/ngo-dashboard");
    else                       router.replace("/volunteer-dashboard");
  }, [user, role, loading, router]);

  // Show spinner while checking auth
  if (loading || user) {
    return (
      <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#115E54] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F1] dark:bg-gray-950 flex flex-col relative overflow-hidden">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#115E54]/6 dark:bg-[#115E54]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#48A15E]/5 dark:bg-[#48A15E]/8 blur-3xl" />

      {/* ── Header ──────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-gray-200/60 dark:border-gray-800/60 bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.png" alt="logo" className="h-8 w-8 object-contain" />
          <div className="leading-none">
            <p className="text-sm font-bold text-[#115E54]">Sanchaalan Saathi</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Emergency Intelligence Platform</p>
          </div>
        </div>
        <ThemeToggle size="sm" />
      </header>

      {/* ── Hero ────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">

        <div className="text-center mb-10 animate-slide-up">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/logo-icon.png"
            alt="Sanchaalan Saathi"
            className="h-16 w-16 mx-auto mb-5 object-contain animate-float drop-shadow-sm"
          />
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-tight">
            Coordinating Crisis Response
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-base mt-2.5 max-w-md mx-auto leading-relaxed">
            India's AI-powered emergency volunteer platform — connecting NGOs with field responders in real time.
          </p>
        </div>

        {/* ── Portal Cards ───────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-5 w-full max-w-3xl animate-slide-up delay-100">

          {/* NGO Portal */}
          <div className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-7 flex flex-col shadow-sm hover:shadow-lg hover:border-[#115E54]/30 dark:hover:border-[#115E54]/40 transition-all duration-300">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#115E54]/10 dark:bg-[#115E54]/20 flex items-center justify-center shrink-0">
                <Building2 size={22} className="text-[#115E54]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">NGO Portal</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500">For organisations &amp; coordinators</p>
              </div>
            </div>

            <ul className="space-y-2.5 mb-7 flex-1">
              {NGO_FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-400">
                  <Icon size={14} className="text-[#115E54] shrink-0" />
                  {text}
                </li>
              ))}
            </ul>

            <Link
              href="/login/ngo"
              className="flex items-center justify-center gap-2 w-full bg-[#115E54] hover:bg-[#0d4a42] text-white font-semibold py-3 px-5 rounded-xl transition-all active:scale-[0.98] group-hover:shadow-md"
            >
              Enter NGO Portal
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Volunteer Portal */}
          <div className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-7 flex flex-col shadow-sm hover:shadow-lg hover:border-[#48A15E]/30 dark:hover:border-[#48A15E]/40 transition-all duration-300">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#48A15E]/10 dark:bg-[#48A15E]/20 flex items-center justify-center shrink-0">
                <Users size={22} className="text-[#48A15E]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">Volunteer Portal</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500">For field responders</p>
              </div>
            </div>

            <ul className="space-y-2.5 mb-7 flex-1">
              {VOLUNTEER_FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-400">
                  <Icon size={14} className="text-[#48A15E] shrink-0" />
                  {text}
                </li>
              ))}
            </ul>

            <Link
              href="/login/volunteer"
              className="flex items-center justify-center gap-2 w-full bg-[#48A15E] hover:bg-[#3a8f4e] text-white font-semibold py-3 px-5 rounded-xl transition-all active:scale-[0.98] group-hover:shadow-md"
            >
              Enter Volunteer Portal
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>

        {/* ── Stats strip ────────────────────────────────── */}
        <div className="flex items-center gap-6 mt-10 animate-slide-up delay-200">
          {[
            { value: "AI-Verified", label: "Task Proofs" },
            { value: "Real-time", label: "Coordination" },
            { value: "Free", label: "To Join" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-sm font-bold text-[#115E54]">{value}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="relative z-10 text-center py-4 text-xs text-gray-400 dark:text-gray-600">
        Sanchaalan Saathi — Team CrownBreakers
      </footer>
    </div>
  );
}
