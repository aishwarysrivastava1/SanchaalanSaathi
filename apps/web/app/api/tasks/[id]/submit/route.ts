import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await context.params;
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const volunteerId = formData.get('volunteerId') as string;

    if (!file || !volunteerId) {
      return NextResponse.json({ error: 'file and volunteerId required' }, { status: 400 });
    }

    const taskRef = adminDb.collection('tasks').doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Upload to Firebase Storage
    const bucket = adminStorage.bucket();
    const storagePath = `verifications/${taskId}_${Date.now()}.jpg`;
    const bucketFile = bucket.file(storagePath);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await bucketFile.save(buffer, { metadata: { contentType: file.type } });
    await bucketFile.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // Mark task VERIFICATION_PENDING and store image URL
    await taskRef.update({
      status: 'VERIFICATION_PENDING',
      verificationImageUrl: publicUrl,
    });

    // Derive the app origin from the incoming request (works on Vercel and locally)
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
    const verifyUrl = `${proto}://${host}/api/verify`;

    // Run verification synchronously so the response carries the final status.
    // The verify route reads taskId, fetches the image from Storage, calls Gemini,
    // and updates Firestore — all self-contained.
    let finalStatus = 'VERIFICATION_PENDING';
    try {
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        finalStatus = verifyData.status || 'VERIFICATION_PENDING';
      }
    } catch (e) {
      console.error('Verification call failed, status remains VERIFICATION_PENDING:', e);
    }

    return NextResponse.json({ success: true, url: publicUrl, status: finalStatus });

  } catch (error: unknown) {
    console.error('Submit route error:', error);
    const msg = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
