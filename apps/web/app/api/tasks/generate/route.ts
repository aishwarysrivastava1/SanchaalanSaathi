import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const PROMPT = `Given these community needs, generate 1-2 specific volunteer micro-tasks per need.
Each task must be completable in 1-4 hours by one person.
Output ONLY a JSON array.
[{"title":"...", "description":"...", "required_skill":"...", "expected_evidence":"What the photo should show", "xp_reward":50, "for_need_id":"..."}]

NEEDS: `;

export async function POST(req: Request) {
  try {
    const { needIds } = await req.json();
    if (!needIds || !needIds.length) {
      return NextResponse.json({ error: 'needIds required' }, { status: 400 });
    }

    // Since we're in Next.js, we call the Python backend to get the actual Need nodes.
    // For expediency in a hackathon, let's assume we pass the full Need objects from the frontend
    // if the frontend already has them, or we fetch them here.
    const fetchedNeeds = [];
    for (const id of needIds) {
       const res = await fetch(`${BACKEND_URL}/api/graph/needs/${id}`);
       if (res.ok) fetchedNeeds.push(await res.json());
    }

    if (!fetchedNeeds.length) {
      return NextResponse.json({ error: 'No needs found' }, { status: 404 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(PROMPT + JSON.stringify(fetchedNeeds));
    const text = result.response.text();
    
    // Parse JSON
    let parsedText = text;
    if (parsedText.includes("```json")) {
       parsedText = parsedText.split("```json")[1].split("```")[0].trim();
    }
    const tasks = JSON.parse(parsedText);

    const generatedTasks = [];

    // Write to Firestore & Neo4j
    for (const t of tasks) {
      // Create Firebase Task Document
      const taskRef = adminDb.collection('tasks').doc();
      const neoTaskId = `t_${taskRef.id}`;
      
      const firestoreTask = {
        neoTaskId: neoTaskId,
        neoNeedId: t.for_need_id,
        title: t.title,
        description: t.description,
        requiredSkill: t.required_skill,
        expectedEvidence: t.expected_evidence,
        xpReward: t.xp_reward || 50,
        status: "OPEN",
        location: { lat: 0, lng: 0, name: "Pending" }, // Would map from need location
        claimedBy: null,
        claimedAt: null,
        verificationImageUrl: null,
        verificationResult: null,
        createdAt: new Date(),
      };
      
      await taskRef.set(firestoreTask);
      
      // Update Neo4j Graph
      await fetch(`${BACKEND_URL}/api/graph/update-node`, {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({
            nodeType: 'Task',
            nodeId: neoTaskId,
            updates: { id: neoTaskId, title: t.title, status: "OPEN" }
         })
      });
      // In a real app we'd also link the SPAWNED_TASK edge here via a custom Cypher endpoint on backend
      
      generatedTasks.push({ id: taskRef.id, ...firestoreTask });
    }

    return NextResponse.json({ success: true, tasks: generatedTasks });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
