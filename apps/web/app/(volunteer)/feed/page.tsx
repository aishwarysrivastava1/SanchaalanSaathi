"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTasks } from "../../../hooks/useFirestore";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../hooks/useToast";
import TaskCard from "../../../components/volunteer/TaskCard";

export default function TaskFeed() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"ALL" | "OPEN">("OPEN");
  
  // Use custom firestore hook
  const { tasks, loading } = useTasks(filter === "OPEN" ? "OPEN" : undefined);

  const handleClaim = async (taskId: string) => {
    if (!user) { toast("You must be logged in to claim tasks", "warning"); return; }
    try {
      const res = await fetch(`/api/tasks/${taskId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteerId: user.uid }),
      });
      if (res.ok) {
        toast("Task claimed! Head to your mission.", "success");
        router.push(`/task/${taskId}`);
      } else {
        toast("Couldn't claim — someone else may have taken it.", "error");
      }
    } catch (e) {
      toast("Network error while claiming task.", "error");
    }
  };

  return (
    <main className="p-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-green-500 font-mono tracking-tight">
            ACTIVE_TASKS
          </h1>
          <p className="text-slate-400 text-sm mt-1">Available missions near you</p>
        </div>
        <select 
          className="bg-slate-800 text-xs px-2 py-1.5 rounded-lg text-cyan-400 border border-slate-700 outline-none focus:border-cyan-500 font-bold"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "ALL" | "OPEN")}
        >
          <option value="OPEN">Open Only</option>
          <option value="ALL">All Status</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-slate-800/50 p-4 rounded-xl h-32 animate-pulse border border-slate-800"></div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClaim={handleClaim} />
          ))}
          {tasks.length === 0 && (
            <div className="text-center p-8 bg-slate-900 border border-slate-800 rounded-xl mt-8">
              <span className="text-slate-500 block mb-2 text-2xl">📡</span>
              <p className="text-slate-400 text-sm">No tasks currently broadcasted in your sector.</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
