import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';



export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const taskId = params.id;
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
    
    // Read file into Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await bucketFile.save(buffer, {
      metadata: { contentType: file.type }
    });
    
    await bucketFile.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // Update Task doc
    await taskRef.update({
      status: 'VERIFICATION_PENDING',
      verificationImageUrl: publicUrl
    });

    // Call the newly migrated serverless verifier instead of PubSub
    try {
        const verifyUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL || req.headers.get("origin")}/api/verify`;
        fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: taskId,
              imageUrl: publicUrl,
              expectedEvidence: taskSnap.data()?.expectedEvidence || "Generic verification"
            })
        }).catch(e => console.error("Async verification trigger failed", e));
    } catch (e) {
        console.error("Verification trigger failed", e);
    }

    return NextResponse.json({ success: true, url: publicUrl, status: 'VERIFICATION_PENDING' });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
