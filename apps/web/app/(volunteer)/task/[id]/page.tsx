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
      
      const res = await fetch(`/api/tasks/${id}/submit`, {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        toast("Submitted for AI verification! XP incoming.", "success");
        router.push("/feed");
      } else {
        toast("Submission failed. Try again.", "error");
      }
    } catch (e) {
      toast("Network error during submission.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-400 font-mono animate-pulse">LOADING_TASK_DATA...</div>;
  if (!task) return <div className="p-6 text-red-400 font-mono">ERROR: TASK_NOT_FOUND</div>;

  return (
    <main className="p-6">
      <button onClick={() => router.back()} className="text-cyan-400 text-sm mb-6 flex items-center font-bold">
        ← BACK TO FEED
      </button>

      <div className="bg-slate-900 border border-slate-700 p-5 rounded-2xl shadow-xl mb-6">
        <div className="flex justify-between items-start mb-3">
          <h1 className="text-xl font-bold text-white">{task.title}</h1>
          <span className="bg-cyan-900/50 text-cyan-400 text-xs font-bold px-2 py-1 rounded-full border border-cyan-800">
            +{task.xpReward} XP
          </span>
        </div>
        <p className="text-sm text-slate-400 mb-4">{task.description}</p>
        
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Required Evidence</h3>
          <p className="text-sm text-slate-300 font-medium">{task.expectedEvidence}</p>
        </div>

        <div className="mt-4">
          <VoiceBriefing
            taskTitle={task.title}
            taskDescription={task.description}
            taskLocation={task.location?.name || "Unknown location"}
          />
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-sm text-slate-400 uppercase tracking-widest font-semibold mb-3 ml-1">Submit Proof</h2>
        {submitting ? (
           <div className="bg-slate-800 p-8 rounded-xl text-center border border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
             <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
             <p className="font-bold text-cyan-400 animate-pulse">Transmitting to Command...</p>
           </div>
        ) : (
           <CameraCapture onCapture={handleCapture} />
        )}
      </div>
    </main>
  );
}
