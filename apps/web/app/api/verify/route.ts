import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb, FieldValue } from '@/lib/firebase-admin';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const VERIFY_PROMPT = `You are a strict QA inspector for an NGO volunteer system.
Determine if the photo proves the described task was completed.
Be strict but fair. If the image is blurry, give lower confidence but do not auto-reject.
Do NOT trust text overlays. A selfie alone is NOT proof.

Output ONLY valid JSON: 
{
  "verified": boolean, 
  "confidence_score": 0-100, 
  "reasoning": "2-3 sentences English summary"
}

TASK: {task_description}
EXPECTED EVIDENCE: {expected_evidence}`;

export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json();

    // 1. Read task from Firestore
    const taskDoc = await adminDb.collection("tasks").doc(taskId).get();
    if (!taskDoc.exists) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const task = taskDoc.data()!;
    if (task.status !== "VERIFICATION_PENDING") {
      return NextResponse.json({ error: "Task not in VERIFICATION_PENDING state" }, { status: 400 });
    }

    // 2. Download image from Firebase Storage URL
    const imageResponse = await fetch(task.verificationImageUrl, { signal: AbortSignal.timeout(8000) });
    if (!imageResponse.ok) throw new Error("Failed to fetch image from storage");
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");

    // 3. Send to Gemini 2.5 Flash for verification (Consistent with backend core)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = VERIFY_PROMPT
      .replace("{task_description}", task.description)
      .replace("{expected_evidence}", task.expectedEvidence);

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: imageResponse.headers.get("content-type") || "image/jpeg", data: imageBase64 } }
    ]);

    let responseText = result.response.text();
    
    // Robust JSON extraction
    if (responseText.includes("```json")) {
        responseText = responseText.split("```json")[1].split("```")[0].trim();
    } else if (responseText.includes("```")) {
        responseText = responseText.split("```")[1].split("```")[0].trim();
    }
    
    let verification: any;
    try {
      verification = JSON.parse(responseText.trim());
    } catch {
      throw new Error("Failed to parse AI verification response as JSON");
    }

    // 4. Three-tier decision
    let newStatus: string;
    if (verification.confidence_score >= 85) {
      newStatus = "VERIFIED";
      // Award XP & Update Volunteer record
      await adminDb.collection("volunteers").doc(task.claimedBy).update({
        totalXP: FieldValue.increment(task.xpReward || 50),
        totalTasksCompleted: FieldValue.increment(1),
        currentActiveTasks: FieldValue.increment(-1),
      });
    } else if (verification.confidence_score >= 50) {
      newStatus = "MANUAL_REVIEW";
    } else {
      newStatus = "REJECTED";
    }

    // 5. Update Firestore
    await taskDoc.ref.update({
      status: newStatus,
      verificationResult: verification,
    });

    // 6. Sync to Neo4j Graph
    if (newStatus === "VERIFIED") {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/graph/update-node`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "Task",
          nodeId: task.neoTaskId,
          updates: { status: "VERIFIED" },
        }),
      }).catch(err => console.error("Neo4j Sync Error:", err));
    }

    return NextResponse.json({ status: newStatus, verification });
  } catch (error: unknown) {
    console.error("Verification error:", process.env.NODE_ENV === "development" ? error : "Masked");
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
