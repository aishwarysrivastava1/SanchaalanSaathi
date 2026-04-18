import { NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase-admin';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await context.params;
    const { volunteerId } = await req.json();

    if (!volunteerId) return NextResponse.json({ error: 'volunteerId required' }, { status: 400 });

    const taskRef = adminDb.collection('tasks').doc(taskId);
    await taskRef.update({
      status: 'CLAIMED',
      claimedBy: volunteerId,
      claimedAt: new Date()
    });

    const volRef = adminDb.collection('volunteers').doc(volunteerId);
    await volRef.update({
      currentActiveTasks: FieldValue.increment(1)
    });

    return NextResponse.json({ success: true, status: 'CLAIMED' });
  } catch (error: unknown) {
    console.error(error);
    const msg = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
