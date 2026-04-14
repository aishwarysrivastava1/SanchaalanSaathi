"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { FirestoreVolunteer } from "../lib/types";

export function useLeaderboard(top: number = 20) {
  const [leaders, setLeaders] = useState<FirestoreVolunteer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "volunteers"),
      orderBy("totalXP", "desc"),
      limit(top)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: FirestoreVolunteer[] = [];
      snapshot.forEach(doc => {
        data.push({ uid: doc.id, ...doc.data() } as FirestoreVolunteer);
      });
      setLeaders(data);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => unsubscribe();
  }, [top]);

  return { leaders, loading };
}
