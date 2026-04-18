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
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
