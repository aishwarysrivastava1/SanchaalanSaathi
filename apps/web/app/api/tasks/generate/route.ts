import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken, requireAuth } from '@/lib/verify-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEM_KEY || '');
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('NEXT_PUBLIC_BACKEND_URL is not set'); })()
    : 'http://localhost:8000'
);

const MAX_NEED_IDS = 20;

const PROMPT = `Given these community needs, generate 1-2 specific volunteer micro-tasks per need.
Each task must be completable in 1-4 hours by one person.
Output ONLY a JSON array.
[{"title":"...", "description":"...", "required_skill":"...", "expected_evidence":"What the photo should show", "xp_reward":50, "for_need_id":"..."}]

NEEDS: `;

export async function POST(req: Request) {
  // Auth guard — requires a valid Firebase ID token
  const decoded = await verifyFirebaseToken(req);
  const deny = requireAuth(decoded);
  if (deny) return deny;

  try {
    const body = await req.json();
    const { needIds } = body;

    if (!needIds || !Array.isArray(needIds) || needIds.length === 0) {
      return NextResponse.json({ error: 'needIds must be a non-empty array' }, { status: 400 });
    }
    if (needIds.length > MAX_NEED_IDS) {
      return NextResponse.json({ error: `Maximum ${MAX_NEED_IDS} needIds per request` }, { status: 400 });
    }
    if (needIds.some((id: unknown) => typeof id !== 'string' || !id.trim())) {
      return NextResponse.json({ error: 'All needIds must be non-empty strings' }, { status: 400 });
    }

    const fetchedNeeds: unknown[] = [];
    for (const id of needIds) {
      const res = await fetch(`${BACKEND_URL}/api/graph/needs/${encodeURIComponent(id)}`);
      if (res.ok) fetchedNeeds.push(await res.json());
    }

    if (!fetchedNeeds.length) {
      return NextResponse.json({ error: 'No needs found for provided IDs' }, { status: 404 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(PROMPT + JSON.stringify(fetchedNeeds));
    const text = result.response.text();

    let parsedText = text.trim();
    if (parsedText.includes('```json')) {
      parsedText = parsedText.split('```json')[1].split('```')[0].trim();
    } else if (parsedText.includes('```')) {
      parsedText = parsedText.split('```')[1].split('```')[0].trim();
    }

    let tasks: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(parsedText);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      tasks = parsed;
    } catch {
      return NextResponse.json({ error: 'AI returned malformed task list' }, { status: 502 });
    }

    const generatedTasks = [];
    const serviceSecret = process.env.INTERNAL_SERVICE_SECRET ?? '';

    for (const t of tasks) {
      const taskRef = adminDb.collection('tasks').doc();
      const neoTaskId = `t_${taskRef.id}`;

      const firestoreTask = {
        neoTaskId,
        neoNeedId: typeof t.for_need_id === 'string' ? t.for_need_id : null,
        title: String(t.title ?? '').slice(0, 300),
        description: String(t.description ?? '').slice(0, 2000),
        requiredSkill: String(t.required_skill ?? ''),
        expectedEvidence: String(t.expected_evidence ?? ''),
        xpReward: typeof t.xp_reward === 'number' ? Math.min(Math.max(t.xp_reward, 0), 500) : 50,
        status: 'OPEN',
        location: { lat: 0, lng: 0, name: 'Pending' },
        claimedBy: null,
        claimedAt: null,
        verificationImageUrl: null,
        verificationResult: null,
        createdBy: decoded!.uid,
        createdAt: new Date(),
      };

      await taskRef.set(firestoreTask);

      // Sync to Neo4j
      const syncHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (serviceSecret) syncHeaders['x-service-secret'] = serviceSecret;

      await fetch(`${BACKEND_URL}/api/graph/update-node`, {
        method: 'POST',
        headers: syncHeaders,
        body: JSON.stringify({
          nodeType: 'Task',
          nodeId: neoTaskId,
          updates: { id: neoTaskId, title: firestoreTask.title, status: 'OPEN' },
        }),
      });

      generatedTasks.push({ id: taskRef.id, ...firestoreTask });
    }

    return NextResponse.json({ success: true, tasks: generatedTasks });

  } catch (error: unknown) {
    const msg = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
