"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { FirestoreTask, FirestoreVolunteer, Notification } from "../lib/types";

export function useTasks(statusFilter?: string) {
  const [tasks, setTasks] = useState<FirestoreTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    
    if (statusFilter) {
      // In a real app we'd composite index this, for hackathon we handle via simplest query
      q = query(collection(db, "tasks"), where("status", "==", statusFilter));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskData: FirestoreTask[] = [];
      snapshot.forEach((doc) => {
        taskData.push({ id: doc.id, ...doc.data() } as FirestoreTask);
      });
      setTasks(taskData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [statusFilter]);

  return { tasks, loading };
}

export function useVolunteer(uid: string | undefined) {
  const [volunteer, setVolunteer] = useState<FirestoreVolunteer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setVolunteer(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, "volunteers", uid), (docSnap) => {
      if (docSnap.exists()) {
        setVolunteer({ uid: docSnap.id, ...docSnap.data() } as FirestoreVolunteer);
      } else {
        setVolunteer(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  return { volunteer, loading };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Notification[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Notification);
      });
      setNotifications(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { notifications, loading };
}
