"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Mail, Key, LogOut, Loader2, Copy, Check, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useNGOAuth } from "../../../lib/ngo-auth";
import { api } from "../../../lib/ngo-api";

type NGOInfo = { name: string; description: string; invite_code: string; volunteer_count: number };

export default function NGOProfilePage() {
  const { user, logout, loading: authLoading } = useNGOAuth();
  const router = useRouter();
  const [ngo, setNgo]         = useState<NGOInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/"); return; }
    if (!user.ngo_id) { router.replace("/ngo/setup"); return; }
    api.ngoDashboard(user.token)
      .then((d: any) => setNgo({
        name: d.ngo_name ?? "Your NGO",
        description: d.description ?? "",
        invite_code: d.invite_code ?? "",
        volunteer_count: d.total_volunteers ?? 0,
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  const handleLogout = () => { logout(); router.replace("/"); };

  const copyCode = () => {
    if (!ngo?.invite_code) return;
    navigator.clipboard.writeText(ngo.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={22} className="animate-spin text-[#48A15E]" />
    </div>
  );
  if (!user) return null;

  const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--card-border)" }}>
      <div className="text-[#48A15E] shrink-0">{icon}</div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--card-text-muted)" }}>{label}</p>
        <p className="text-sm font-medium mt-0.5" style={{ color: "var(--card-text-primary)" }}>{value}</p>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 max-w-2xl space-y-5"
    >
      {/* Account card */}
      <div className="rounded-2xl border p-6 space-y-4" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#2A8256,#48A15E)" }}>
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: "var(--card-text-primary)" }}>NGO Admin Account</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--card-text-muted)" }}>Manage your organisation settings</p>
          </div>
        </div>
        <div className="space-y-2">
          <Row icon={<Mail size={15} />} label="Email" value={user.email} />
          <Row icon={<Key size={15} />}  label="Role"  value="NGO Administrator" />
        </div>
      </div>

      {/* NGO info card */}
      {ngo && (
        <div className="rounded-2xl border p-6 space-y-4" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(42,130,86,0.15)" }}>
              <Building2 size={18} className="text-[#48A15E]" />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: "var(--card-text-primary)" }}>{ngo.name}</p>
              <p className="text-xs" style={{ color: "var(--card-text-muted)" }}>
                {ngo.volunteer_count} volunteer{ngo.volunteer_count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {ngo.invite_code && (
            <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              style={{ background: "rgba(42,130,86,0.08)", border: "1px solid rgba(72,161,94,0.2)" }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#48A15E]">Invite Code</p>
                <p className="font-mono font-bold tracking-widest text-base mt-0.5" style={{ color: "var(--card-text-primary)" }}>
                  {ngo.invite_code}
                </p>
              </div>
              <button
                onClick={copyCode}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-all shrink-0"
                style={{
                  background: copied ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.08)",
                  border: copied ? "1px solid rgba(52,211,153,0.35)" : "1px solid rgba(255,255,255,0.15)",
                  color: copied ? "#6ee7b7" : "var(--card-text-muted)",
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
      >
        <LogOut size={15} />
        Sign out
      </button>
    </motion.div>
  );
}
