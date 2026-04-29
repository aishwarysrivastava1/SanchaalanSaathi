"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Bot, X, Send, ImagePlus, Loader2, CheckCircle2, Sparkles,
  ArrowRight, MapPin, ClipboardList, Users, Calendar, BarChart2,
  Bell, Shield, HelpCircle, Zap, Camera, RefreshCw, Navigation,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/ngo-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserCtx = {
  role: "volunteer" | "ngo_admin" | "visitor";
  userName: string;
  token: string | null;
  userId: string | null;
  email: string | null;
};

type HistoryItem = { role: "user" | "model"; text: string };

type BotAction = {
  type: "navigate" | "resolve_task" | "none";
  path?: string;
  label?: string;
  task_resolved?: boolean;
  confidence?: number;
};

type Message = {
  id: string;
  role: "user" | "bot";
  text: string;
  imageUrl?: string;
  statusLog?: string[];
  isSuccess?: boolean;
  action?: BotAction;
  suggestions?: string[];
  pendingCalls?: any[];
};

type VolTask = {
  task_id?: string;
  id?: string;
  assignment_id?: string;
  title: string;
  description?: string;
  status?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseJwt(token: string): Record<string, any> | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function getUserContext(): UserCtx {
  if (typeof window === "undefined")
    return { role: "visitor", userName: "Guest", token: null, userId: null, email: null };
  try {
    const token = localStorage.getItem("ngo_token");
    if (token) {
      const p = parseJwt(token);
      if (p?.sub && p?.role) {
        return {
          role: p.role as "volunteer" | "ngo_admin",
          userName: p.full_name || p.email?.split("@")[0] || "User",
          token,
          userId: p.sub,
          email: p.email ?? null,
        };
      }
    }
  } catch {}
  return { role: "visitor", userName: "Guest", token: null, userId: null, email: null };
}

// ── Quick actions by role ──────────────────────────────────────────────────────

type QuickAction = { label: string; icon: React.ReactNode; message: string };

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  visitor: [
    { label: "What is this?",  icon: <HelpCircle size={12} />, message: "What is Sanchaalan Saathi and what does it do?" },
    { label: "Join as Volunteer", icon: <Users size={12} />,   message: "How do I join the platform as a volunteer?" },
    { label: "Register NGO",   icon: <Shield size={12} />,     message: "How can I register my NGO on this platform?" },
    { label: "Key Features",   icon: <Zap size={12} />,        message: "What features does this platform offer for NGOs and volunteers?" },
    { label: "Invite Code?",   icon: <Bell size={12} />,       message: "What is an invite code and how do I get one?" },
  ],
  volunteer: [
    { label: "My Tasks",       icon: <ClipboardList size={12} />, message: "Show me my current task assignments" },
    { label: "Open Tasks",     icon: <Zap size={12} />,           message: "What open tasks can I join right now?" },
    { label: "Verify Task",    icon: <Camera size={12} />,        message: "I want to upload a photo to verify my task completion" },
    { label: "My Profile",     icon: <Users size={12} />,         message: "How do I update my skills and volunteer profile?" },
    { label: "Notifications",  icon: <Bell size={12} />,          message: "Check my notifications" },
    { label: "My Score",       icon: <BarChart2 size={12} />,     message: "What is my performance score and how is it calculated?" },
    { label: "Events",         icon: <Calendar size={12} />,      message: "What community events are coming up that I can attend?" },
    { label: "Enroll in Task", icon: <RefreshCw size={12} />,     message: "Help me enroll in a new open task" },
  ],
  ngo_admin: [
    { label: "Dashboard",      icon: <BarChart2 size={12} />,    message: "Show me my NGO dashboard metrics and performance" },
    { label: "Create Task",    icon: <ClipboardList size={12} />, message: "Help me create a new task for volunteers" },
    { label: "AI Match",       icon: <Zap size={12} />,           message: "I want to use AI to find the best volunteers for a task" },
    { label: "Volunteers",     icon: <Users size={12} />,         message: "Show me all volunteers in my NGO" },
    { label: "Map View",       icon: <MapPin size={12} />,        message: "How do I view volunteer locations on the map?" },
    { label: "Create Event",   icon: <Calendar size={12} />,      message: "Help me create a new community event" },
    { label: "Enrollments",    icon: <RefreshCw size={12} />,     message: "Show me pending volunteer enrollment requests I need to review" },
    { label: "Analytics",      icon: <BarChart2 size={12} />,     message: "Show me detailed NGO analytics and volunteer performance data" },
    { label: "Alerts",         icon: <Bell size={12} />,          message: "Are there any active alerts or issues I should know about?" },
    { label: "Resources",      icon: <Shield size={12} />,        message: "Help me manage NGO resources and their allocation" },
  ],
};

const WELCOME: Record<string, string> = {
  visitor:   "👋 <b>Namaste! I'm Saathi</b> — your all-in-one helper for Sanchaalan Saathi.<br><br>I can guide you on joining as a volunteer, registering your NGO, or anything else about the platform. What brings you here today?",
  volunteer: "🙏 <b>Welcome back!</b> I'm Saathi, your autonomous assistant.<br><br>I can show your tasks, verify completions with a photo upload, find new opportunities, update your profile, check your score, and much more — all without leaving this chat!",
  ngo_admin: "🏢 <b>Hello, Admin!</b> I'm Saathi, your NGO operations co-pilot.<br><br>Ask me to create tasks, AI-match volunteers, manage enrollments, create events, or pull analytics — I'll execute it for you instantly.",
};

// ── Main Component ─────────────────────────────────────────────────────────────

export function ChatbotWidget() {
  const pathname  = usePathname();
  const router    = useRouter();

  const [userCtx, setUserCtx]       = useState<UserCtx>({ role: "visitor", userName: "Guest", token: null, userId: null, email: null });
  const [open, setOpen]             = useState(false);
  const [unread, setUnread]         = useState(0);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [history, setHistory]       = useState<HistoryItem[]>([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [executing, setExecuting]   = useState<string | null>(null);
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [volTasks, setVolTasks]     = useState<VolTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<VolTask | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);

  const fileRef   = useRef<HTMLInputElement>(null);
  const textRef   = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshCtx = useCallback(() => {
    const ctx = getUserContext();
    setUserCtx(ctx);
    return ctx;
  }, []);

  // Init welcome message on first open
  useEffect(() => {
    if (!open) return;
    const ctx = refreshCtx();
    if (messages.length === 0) {
      setMessages([{
        id: "welcome",
        role: "bot",
        text: WELCOME[ctx.role] ?? WELCOME.visitor,
        suggestions: QUICK_ACTIONS[ctx.role]?.slice(0, 3).map(a => a.label),
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch volunteer tasks
  useEffect(() => {
    if (open && userCtx.token && userCtx.role === "volunteer") {
      api.volTasks(userCtx.token).then(setVolTasks).catch(() => {});
    }
  }, [open, userCtx.token, userCtx.role]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearImage = () => { setImageFile(null); setImagePreview(null); };

  // Run API calls returned by the bot (non-destructive ones auto-run; destructive ones go to pendingCalls)
  const runCalls = async (calls: any[]): Promise<string[]> => {
    if (!calls?.length || !userCtx.token) return [];
    const logs: string[] = [];
    for (const call of calls) {
      const { method, args = [] } = call;
      const methodName = method.replace("api.", "");
      const apiFn = (api as any)[methodName];
      if (typeof apiFn !== "function") continue;
      const label = methodName.replace(/([A-Z])/g, " $1").toLowerCase();
      setExecuting(`Running ${label}...`);
      try {
        const result = await apiFn(userCtx.token, ...args);
        const count = Array.isArray(result) ? result.length : null;
        logs.push(`✅ ${label}${count !== null ? ` — ${count} item${count !== 1 ? "s" : ""}` : " completed"}`);
      } catch (err: any) {
        logs.push(`⚠️ ${label} — ${err.message ?? "failed"}`);
      }
    }
    setExecuting(null);
    return logs;
  };

  // Execute pending destructive calls (called when user confirms task completion)
  const confirmPendingCalls = async (msgId: string, calls: any[]) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, pendingCalls: undefined } : m));
    setExecuting("Marking task as complete...");
    try {
      const logs = await runCalls(calls);
      setMessages(prev => [...prev, {
        id: `bot-${Date.now()}`,
        role: "bot",
        text: "🎉 <b>Task marked as complete!</b> Your NGO admin will be notified. Great work!",
        isSuccess: true,
        statusLog: logs,
      }]);
      if (userCtx.token) api.volTasks(userCtx.token).then(setVolTasks).catch(() => {});
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `bot-${Date.now()}`,
        role: "bot",
        text: `⚠️ Could not complete task: ${err.message}. Please try again or contact your admin.`,
      }]);
    } finally {
      setExecuting(null);
    }
  };

  const pushBotMsg = (text: string, extra: Partial<Message> = {}) =>
    setMessages(prev => [...prev, { id: `bot-${Date.now()}`, role: "bot", text, ...extra }]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text && !imageFile) return;
    if (loading) return;

    // If volunteer said "verify task" without selecting one, prompt picker
    if (
      userCtx.role === "volunteer" &&
      imageFile &&
      volTasks.length > 0 &&
      !selectedTask
    ) {
      setShowTaskPicker(true);
      pushBotMsg("Please select which task this photo is for, then send again.");
      return;
    }

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: text || "I'm uploading this image to verify my task progress.",
      imageUrl: imagePreview ?? undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    if (textRef.current) textRef.current.style.height = "auto";
    clearImage();

    // Encode image
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    if (imageFile) {
      const buf = await imageFile.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      bytes.forEach(b => bin += String.fromCharCode(b));
      imageBase64 = btoa(bin);
      imageMimeType = imageFile.type;
    }

    // Build context object
    const context: Record<string, any> = {
      role: userCtx.role,
      userName: userCtx.userName,
      page: pathname,
    };
    if (volTasks.length > 0) {
      context.activeTasks = volTasks.map(t => ({
        id: t.task_id || t.id,
        assignment_id: t.assignment_id,
        title: t.title,
        desc: t.description,
        status: t.status,
      }));
    }
    if (selectedTask) {
      context.taskId        = selectedTask.task_id || selectedTask.id;
      context.taskTitle     = selectedTask.title;
      context.taskDescription = selectedTask.description;
      context.assignmentId  = selectedTask.assignment_id;
    }

    const consentAccepted = typeof window !== "undefined" && localStorage.getItem("cookie_consent") === "accepted";
    context.consent = consentAccepted;

    try {
      const res = await api.chatbotProxy(userCtx.token, {
        message: userMsg.text,
        imageBase64,
        imageMimeType,
        context,
      });

      if (!res.body) throw new Error("No body returned");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let completeText = "";
      let finalAction: any = { type: "none" };
      let finalCalls: any[] = [];
      let finalSuggestions: any[] = [];
      
      // Initialize an empty bot message placeholder
      const botMsgId = `bot-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: "bot",
        text: "",
      }]);
      setLoading(false); // Stop generic loading, start typing

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                completeText = completeText || parsed.error;
                setMessages(prev => prev.map(m =>
                  m.id === botMsgId ? { ...m, text: parsed.error } : m
                ));
              }
              if (parsed.textChunk) {
                completeText += parsed.textChunk;
                setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: completeText } : m));
              }
              if (parsed.done) {
                finalAction = parsed.action || finalAction;
                finalCalls = parsed.calls || finalCalls;
                finalSuggestions = parsed.suggestions || finalSuggestions;
              }
            } catch (e) {
              console.error("SSE parse error", e, dataStr);
            }
          }
        }
      }

      // Process complete message
      const safeCalls = finalCalls.filter(
        (c: any) => !c.method?.includes("complete") && !c.method?.includes("Complete")
      );
      const destructiveCalls = finalCalls.filter(
        (c: any) => c.method?.includes("complete") || c.method?.includes("Complete")
      );

      const logs = await runCalls(safeCalls);

      if (finalAction?.type === "navigate" && finalAction.path) {
        setTimeout(() => { router.push(finalAction.path); setOpen(false); }, 1400);
      }

      setMessages(prev => prev.map(m => {
        if (m.id === botMsgId) {
          return {
            ...m,
            text: completeText || "I've processed your request.",
            statusLog: logs.length > 0 ? logs : undefined,
            isSuccess: finalAction?.task_resolved && destructiveCalls.length === 0,
            action: finalAction?.type !== "none" ? finalAction : undefined,
            suggestions: finalSuggestions.length ? finalSuggestions : undefined,
            pendingCalls: destructiveCalls.length > 0 ? destructiveCalls : undefined,
          };
        }
        return m;
      }));
      
      setHistory(prev => [
        ...prev,
        { role: "user", text: userMsg.text },
        { role: "model", text: completeText },
      ]);

      if (!open) setUnread(u => u + 1);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        id: `bot-${Date.now()}`,
        role: "bot",
        text: "Connection error. Please try again. [Retry supported via resend]",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setUnread(0);
  };

  const quickActions = QUICK_ACTIONS[userCtx.role] ?? QUICK_ACTIONS.visitor;

  return (
    <>
      {/* ── Floating toggle button ─────────────────────────── */}
      <motion.button
        onClick={open ? () => setOpen(false) : handleOpen}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0B3D36 0%, #115E54 60%, #2A8256 100%)", boxShadow: "0 8px 32px rgba(17,94,84,0.5)" }}
        aria-label="Open Saathi assistant"
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                <X size={22} className="text-white" />
              </motion.div>
            : <motion.div key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }} className="relative">
                <Bot size={22} className="text-white" />
                {unread > 0 && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </motion.span>
                )}
              </motion.div>
          }
        </AnimatePresence>
      </motion.button>

      {/* ── Chat panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.94 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="fixed bottom-24 right-6 z-50 flex flex-col rounded-3xl shadow-2xl overflow-hidden border"
            style={{
              width:       "min(390px, calc(100vw - 20px))",
              height:      "min(620px, calc(100svh - 116px))",
              background:  "var(--bg-surface, #fff)",
              borderColor: "var(--border-color, #E5E7EB)",
            }}
          >
            {/* Header */}
            <div className="px-5 py-3.5 shrink-0 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0B3D36 0%, #115E54 55%, #2A8256 100%)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center border border-white/25 shrink-0">
                  <Bot size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-none">Saathi</p>
                  <div className="flex items-center gap-1.5 mt-[5px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse block shrink-0" />
                    <span className="text-[10px] text-white/65 font-medium">One-stop resolution assistant</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-white/20 text-white/60 uppercase tracking-wider">
                  {userCtx.role === "ngo_admin" ? "Admin" : userCtx.role === "volunteer" ? "Volunteer" : "Guest"}
                </span>
                <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10">
                  <X size={14} className="text-white/60" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} gap-1.5`}>
                  {/* Bubble */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm ${m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                    style={
                      m.role === "user"
                        ? { background: "linear-gradient(135deg, #115E54 0%, #2A8256 100%)", color: "white" }
                        : { background: "var(--bg-muted, #F9FAFB)", color: "var(--text-primary, #111827)", border: "1px solid var(--border-color, #E5E7EB)" }
                    }
                  >
                    {m.imageUrl && (
                      <img src={m.imageUrl} alt="uploaded" className="rounded-xl mb-2.5 max-h-40 w-full object-cover" />
                    )}
                    <div dangerouslySetInnerHTML={{ __html: m.text }} />

                    {/* Status log */}
                    {m.statusLog && (
                      <div className="mt-2.5 pt-2.5 space-y-1" style={{ borderTop: "1px solid currentColor", opacity: 1, borderColor: "rgba(0,0,0,0.08)" }}>
                        {m.statusLog.map((log, i) => (
                          <motion.p key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}
                            className="text-[11px] font-medium"
                          >{log}</motion.p>
                        ))}
                      </div>
                    )}

                    {/* Success badge */}
                    {m.isSuccess && (
                      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                        className="mt-2.5 px-3 py-2 rounded-xl flex items-center gap-2"
                        style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}
                      >
                        <CheckCircle2 size={14} style={{ color: "#10b981" }} />
                        <span className="text-[11px] font-bold" style={{ color: "#059669" }}>TASK RESOLVED</span>
                        <Sparkles size={11} className="ml-auto animate-bounce" style={{ color: "#34d399" }} />
                      </motion.div>
                    )}

                    {/* Navigate button (inline in bubble) */}
                    {m.action?.type === "navigate" && m.action.path && (
                      <motion.button
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                        onClick={() => { router.push(m.action!.path!); setOpen(false); }}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-bold text-white"
                        style={{ background: "linear-gradient(135deg, #115E54, #2A8256)" }}
                      >
                        <Navigation size={12} />
                        {m.action.label ?? "Go there now"}
                      </motion.button>
                    )}
                  </motion.div>

                  {/* Confirm-complete block (shown below bubble) */}
                  {m.pendingCalls && m.pendingCalls.length > 0 && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      className="w-[88%] rounded-2xl px-4 py-3 border"
                      style={{ background: "rgba(17,94,84,0.06)", borderColor: "rgba(17,94,84,0.2)" }}
                    >
                      <p className="text-[11px] font-semibold mb-2.5 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                        <AlertCircle size={12} style={{ color: "#115E54" }} />
                        Confirm marking task as complete?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => confirmPendingCalls(m.id, m.pendingCalls!)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-bold text-white shadow"
                          style={{ background: "linear-gradient(135deg, #115E54, #2A8256)" }}
                        >
                          <CheckCircle2 size={12} /> Yes, complete!
                        </button>
                        <button
                          onClick={() => setMessages(prev => prev.map(p => p.id === m.id ? { ...p, pendingCalls: undefined } : p))}
                          className="px-3.5 py-1.5 rounded-xl text-[12px] font-medium border"
                          style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Suggestion chips */}
                  {m.role === "bot" && m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-w-[88%]">
                      {m.suggestions.map((s, i) => (
                        <motion.button key={i}
                          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }}
                          onClick={() => send(s)}
                          className="text-[11px] px-3 py-1 rounded-full border font-medium transition-all hover:scale-105 active:scale-95"
                          style={{ background: "var(--bg-surface)", borderColor: "rgba(17,94,84,0.3)", color: "#115E54" }}
                        >
                          {s}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Loading */}
              {loading && (
                <div className="flex items-start">
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border" style={{ background: "var(--bg-muted)", borderColor: "var(--border-color)" }}>
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className="flex gap-1">
                        {[0, 0.18, 0.36].map((d, i) => (
                          <motion.span key={i} animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.75, delay: d }}
                            className="w-1.5 h-1.5 rounded-full block" style={{ background: "#2A8256" }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40" style={{ color: "var(--text-primary)" }}>Saathi is thinking</span>
                    </div>
                    {executing && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Loader2 size={9} className="animate-spin" style={{ color: "#2A8256" }} />
                        <span className="text-[10px] opacity-55 italic" style={{ color: "var(--text-primary)" }}>{executing}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick-action chip strip */}
            <div className="px-4 pt-2 pb-1 border-t overflow-x-auto custom-scrollbar" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex gap-1.5 pb-1" style={{ width: "max-content" }}>
                {quickActions.map((qa, i) => (
                  <button key={i} onClick={() => send(qa.message)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-all hover:scale-105 active:scale-95"
                    style={{ background: "var(--bg-muted)", borderColor: "rgba(17,94,84,0.2)", color: "#115E54" }}
                  >
                    {qa.icon}{qa.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Task picker for verification (volunteer only) */}
            {userCtx.role === "volunteer" && showTaskPicker && volTasks.length > 0 && (
              <div className="px-4 py-2 border-t" style={{ borderColor: "var(--border-color)" }}>
                <p className="text-[10px] font-bold mb-1.5 uppercase tracking-wider opacity-50" style={{ color: "var(--text-primary)" }}>
                  Select task to verify
                </p>
                <select
                  value={selectedTask ? (selectedTask.task_id || selectedTask.id || "") : ""}
                  onChange={e => {
                    const t = volTasks.find(t => (t.task_id || t.id) === e.target.value) ?? null;
                    setSelectedTask(t);
                  }}
                  className="w-full text-[12px] rounded-xl px-3 py-2 border outline-none"
                  style={{ background: "var(--bg-muted)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                >
                  <option value="">Choose a task…</option>
                  {volTasks.map(t => (
                    <option key={t.task_id || t.id} value={t.task_id || t.id || ""}>{t.title}</option>
                  ))}
                </select>
                {selectedTask && (
                  <p className="text-[10px] mt-1 opacity-55" style={{ color: "var(--text-secondary)" }}>
                    Now upload your photo and send!
                  </p>
                )}
              </div>
            )}

            {/* Input area */}
            <div className="p-4 border-t space-y-2.5 shrink-0" style={{ background: "var(--bg-surface)", borderColor: "var(--border-color)" }}>
              {/* Image preview */}
              {imagePreview && (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="preview" className="h-16 w-16 rounded-xl object-cover border-2 shadow-md" style={{ borderColor: "#2A8256" }} />
                  <button onClick={clearImage} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow text-[10px] font-bold">
                    <X size={9} />
                  </button>
                  {selectedTask && (
                    <div className="absolute -bottom-1.5 left-0 right-0 text-center">
                      <span className="text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-semibold truncate block max-w-[90px] mx-auto">
                        {selectedTask.title}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-end gap-2">
                <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={handleImageSelect} />

                {/* Photo button — for volunteers shows task picker toggle */}
                <button
                  onClick={() => {
                    if (userCtx.role === "volunteer" && volTasks.length > 0) {
                      setShowTaskPicker(v => !v);
                    }
                    fileRef.current?.click();
                  }}
                  title={userCtx.role === "volunteer" ? "Upload photo to verify task" : "Attach image"}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all hover:scale-105 active:scale-95"
                  style={{ background: "var(--bg-muted)", borderColor: "rgba(17,94,84,0.2)", color: "#2A8256" }}
                >
                  {userCtx.role === "volunteer" ? <Camera size={15} /> : <ImagePlus size={15} />}
                </button>

                {/* Textarea */}
                <textarea
                  ref={textRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
                  }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask Saathi anything…"
                  rows={1}
                  className="flex-1 resize-none rounded-xl px-3 py-2.5 text-[13px] outline-none border transition-all"
                  style={{
                    maxHeight: "96px",
                    background: "var(--bg-muted)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                />

                {/* Send */}
                <motion.button
                  onClick={() => send()}
                  disabled={loading || (!input.trim() && !imageFile)}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md disabled:opacity-35 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #115E54, #2A8256)" }}
                >
                  <Send size={14} className="text-white" />
                </motion.button>
              </div>

              <p className="text-[9px] text-center font-mono opacity-35" style={{ color: "var(--text-secondary)" }}>
                SAATHI · POWERED BY GEMINI · SANCHAALAN SAATHI
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
