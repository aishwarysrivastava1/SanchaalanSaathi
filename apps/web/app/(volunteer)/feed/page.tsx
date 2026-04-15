"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTasks } from "../../../hooks/useFirestore";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../hooks/useToast";
import TaskCard from "../../../components/volunteer/TaskCard";
import { Inbox } from "lucide-react";

export default function TaskFeed() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"ALL" | "OPEN">("OPEN");

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
    } catch {
      toast("Network error while claiming task.", "error");
    }
  };

  return (
    <main className="p-5 pb-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Active Tasks</h1>
        <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Claim a task and submit photo proof to earn XP</p>
      </div>

      {/* Filter pill toggle + count */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {(["OPEN", "ALL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-xs rounded-lg font-medium transition-all ${
                filter === f
                  ? "bg-white dark:bg-gray-700 text-[#115E54] dark:text-[#48A15E] font-semibold shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {f === "OPEN" ? "Available" : "All Tasks"}
            </button>
          ))}
        </div>
        {!loading && (
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
        )}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl h-28 animate-pulse border border-gray-200 dark:border-gray-800" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Inbox size={22} className="text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No tasks available</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center max-w-[200px]">
            {filter === "OPEN" ? "All tasks have been claimed. Check back soon." : "No tasks have been generated yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClaim={handleClaim} />
          ))}
        </div>
      )}
    </main>
  );
}
