"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { useAuth } from "../../../../lib/auth";
import { useToast } from "../../../../hooks/useToast";
import CameraCapture from "../../../../components/volunteer/CameraCapture";
import { VoiceBriefing } from "../../../../components/volunteer/VoiceBriefing";
import { FirestoreTask } from "../../../../lib/types";
import { ArrowLeft, Zap } from "lucide-react";

export default function TaskDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [task, setTask] = useState<FirestoreTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchTask = async () => {
      const snap = await getDoc(doc(db, "tasks", id as string));
      if (snap.exists()) {
        setTask({ id: snap.id, ...snap.data() } as FirestoreTask);
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  const handleCapture = async (file: File) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("volunteerId", user.uid);
      const res = await fetch(`/api/tasks/${id}/submit`, { method: "POST", body: formData });
      if (res.ok) {
        toast("Submitted for AI verification! XP incoming.", "success");
        router.push("/feed");
      } else {
        toast("Submission failed. Try again.", "error");
      }
    } catch {
      toast("Network error during submission.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 bg-white dark:bg-gray-900 rounded-xl animate-pulse border border-gray-200 dark:border-gray-800" />
        ))}
      </div>
    );
  }
  if (!task) return <div className="p-6 text-red-500 text-sm">Task not found.</div>;

  return (
    <main className="p-5 pb-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-[#115E54] text-sm font-medium mb-5 hover:opacity-75 transition-opacity"
      >
        <ArrowLeft size={15} />
        Back to Feed
      </button>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm mb-4">
        <div className="flex justify-between items-start mb-3">
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-snug pr-3">{task.title}</h1>
          <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 text-xs font-semibold px-2 py-1 rounded-full shrink-0">
            <Zap size={11} />
            +{task.xpReward} XP
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">{task.description}</p>

        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Required Evidence</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{task.expectedEvidence}</p>
        </div>

        <div className="mt-4">
          <VoiceBriefing
            taskTitle={task.title}
            taskDescription={task.description}
            taskLocation={task.location?.name || "Unknown location"}
          />
        </div>
      </div>

      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Submit Proof</h2>
      {submitting ? (
        <div className="bg-white dark:bg-gray-900 border border-[#115E54]/30 p-8 rounded-xl text-center shadow-sm">
          <div className="w-8 h-8 border-4 border-[#115E54]/20 border-t-[#115E54] rounded-full animate-spin mx-auto mb-3" />
          <p className="font-semibold text-[#115E54] text-sm">Submitting for verification...</p>
        </div>
      ) : (
        <CameraCapture onCapture={handleCapture} />
      )}
    </main>
  );
}
