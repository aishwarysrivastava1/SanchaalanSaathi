import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb, FieldValue } from "@/lib/firebase-admin";

const genAI = new GoogleGenerativeAI(process.env.GEM_KEY!);

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

// Internal-only endpoint — only the submit route should call this
function isAuthorised(req: NextRequest): boolean {
  const serviceSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (!serviceSecret) return true; // no secret configured — allow (dev mode)
  return req.headers.get("x-service-secret") === serviceSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { taskId } = body;

    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    // Read task from Firestore
    const taskDoc = await adminDb.collection("tasks").doc(taskId).get();
    if (!taskDoc.exists) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const task = taskDoc.data()!;
    if (task.status !== "VERIFICATION_PENDING") {
      return NextResponse.json(
        { error: `Task not in VERIFICATION_PENDING state (current: ${task.status})` },
        { status: 400 },
      );
    }
    if (!task.verificationImageUrl) {
      return NextResponse.json({ error: "No verification image attached to task" }, { status: 400 });
    }

    // Download image from Firebase Storage
    const imageResponse = await fetch(task.verificationImageUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch verification image (HTTP ${imageResponse.status})`);
    }
    const imageBase64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
    const imageMime   = imageResponse.headers.get("content-type") || "image/jpeg";

    // Call Gemini 2.5 Flash for AI verification
    const model  = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = VERIFY_PROMPT
      .replace("{task_description}",  String(task.description     ?? "").slice(0, 1000))
      .replace("{expected_evidence}", String(task.expectedEvidence ?? "").slice(0, 500));

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: imageMime, data: imageBase64 } },
    ]);

    let responseText = result.response.text();
    if (responseText.includes("```json")) {
      responseText = responseText.split("```json")[1].split("```")[0].trim();
    } else if (responseText.includes("```")) {
      responseText = responseText.split("```")[1].split("```")[0].trim();
    }

    let verification: { verified: boolean; confidence_score: number; reasoning: string };
    try {
      verification = JSON.parse(responseText.trim());
      if (
        typeof verification.verified        !== "boolean" ||
        typeof verification.confidence_score !== "number"  ||
        typeof verification.reasoning        !== "string"
      ) {
        throw new Error("Schema mismatch in AI response");
      }
    } catch {
      throw new Error("Failed to parse AI verification response as valid JSON");
    }

    // Three-tier decision
    let newStatus: string;
    if      (verification.confidence_score >= 85) newStatus = "VERIFIED";
    else if (verification.confidence_score >= 50) newStatus = "MANUAL_REVIEW";
    else                                          newStatus = "REJECTED";

    // Update task
    await taskDoc.ref.update({ status: newStatus, verificationResult: verification });

    // Award XP on VERIFIED
    if (newStatus === "VERIFIED" && task.claimedBy) {
      const volRef = adminDb.collection("volunteers").doc(task.claimedBy);
      const xp     = typeof task.xpReward === "number" ? task.xpReward : 50;
      await volRef.set(
        {
          totalXP:             FieldValue.increment(xp),
          totalTasksCompleted: FieldValue.increment(1),
          currentActiveTasks:  FieldValue.increment(-1),
        },
        { merge: true },
      );

      // Sync to Neo4j — fire-and-forget, non-critical path
      const backendUrl    = process.env.NEXT_PUBLIC_BACKEND_URL;
      const serviceSecret = process.env.INTERNAL_SERVICE_SECRET ?? "";
      if (backendUrl && task.neoTaskId) {
        fetch(`${backendUrl}/api/graph/update-node`, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            ...(serviceSecret ? { "x-service-secret": serviceSecret } : {}),
          },
          body: JSON.stringify({
            nodeType: "Task",
            nodeId:   task.neoTaskId,
            updates:  { status: "VERIFIED" },
          }),
        }).catch(() => {
          // Non-critical — Firestore is source of truth; Neo4j sync retried on next poll
        });
      }
    }

    return NextResponse.json({ status: newStatus, verification });

  } catch (error: unknown) {
    const msg = process.env.NODE_ENV === "production"
      ? "Verification failed"
      : (error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
