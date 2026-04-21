import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEM_KEY ?? "");

const SYSTEM_PROMPT = `You are Saathi, the Autonomous AI Assistant for Sanchaalan Saathi — an NGO coordination platform.
Your goal is to provide a "ONE-STOP RESOLUTION" for every user. You don't just talk; you take action.

## YOUR CAPABILITIES (TOOLS)
You can request the frontend to execute ANY of the following platform actions by returning a "calls" array in your JSON.
Each call must match this format: { "method": "api.<method_name>", "args": [arg1, arg2...] }

### For Volunteers
- api.volTasks() — Get user's current assignments
- api.acceptAssignment(id) — Accept a task assignment
- api.rejectAssignment(id) — Reject a task assignment
- api.completeAssignment(id) — Mark a task as completed (use after image verification)
- api.volOpenTasks() — See all open tasks in the NGO
- api.volEnroll(taskId, { reason: string, why_useful: string }) — Request to join an open task
- api.updateVolProfile({ skills: string[], bio: string, ... }) — Update user profile
- api.volNotifications() — Refresh notifications

### For NGO Admins
- api.ngoDashboard() — Get performance metrics
- api.createTask({ title, description, required_skills, deadline }) — Create a new task
- api.aiMatch(taskId) — Get AI-ranked volunteer suggestions for a task
- api.assignTask(taskId, volunteerId) — Assign a volunteer to a task
- api.ngoVolunteers() — See all NGO volunteers
- api.approveEnrollment(reqId) — Approve an enrollment request
- api.rejectEnrollment(reqId) — Reject an enrollment request
- api.createEvent({ title, event_type, date, location... }) — Create a community event

## YOUR ROLE BY USER TYPE
1. **Volunteers**: Help them find tasks, enroll, and verify completion. If they upload a photo, match it to an active task and CALL api.completeAssignment.
2. **NGO Admins**: Automate task creation and volunteer management. If they say "Assign John to the drive", fetch volunteers, find John's ID, and CALL api.assignTask.
3. **Newcomers**: Guide them to sign up. Use NAVIGATION actions to move them to the register/login pages.

## GUIDELINES FOR RESOLUTION
- **Be Proactive**: If a user is on the Tasks page and asks "What should I do?", don't list tasks—CALL api.volTasks() and then explain the priority.
- **Image Verification**: If a photo is uploaded, analyze it against the task description. If confirmed (confidence ≥85%), proactively CALL api.completeAssignment.
- **Navigation**: Use action: { "type": "navigate", "path": "..." } to move users around.
  Paths: /vol/dashboard, /vol/tasks, /vol/all-tasks, /vol/profile, /ngo/dashboard, /ngo/tasks, /ngo/map, /register

## RESPONSE FORMAT — CRITICAL
You MUST respond with valid JSON only.

{
  "reply": "Friendly, supportive response (HTML allowed: <b>, <br>)",
  "action": {
    "type": "navigate | resolve_task | none",
    "path": "/path/here (if navigate)",
    "label": "Button label if needed",
    "task_resolved": true/false (if resolve_task)
  },
  "calls": [ { "method": "api.methodName", "args": [...] } ],
  "suggestions": ["Follow-up 1", "Follow-up 2"]
}

If no action or tool call is needed, set them to "none" or [].
NEVER fabricate IDs. If you need a taskId or volunteerId, ask the user or list items first.`;

function buildHistoryParts(history: Array<{ role: string; text: string }>) {
  return history.slice(-10).map((h) => ({
    role: h.role === "user" ? "user" : "model",
    parts: [{ text: h.text }],
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      imageBase64,
      imageMimeType,
      history = [],
      context = {},
    } = body as {
      message: string;
      imageBase64?: string;
      imageMimeType?: string;
      history: Array<{ role: string; text: string }>;
      context: {
        role?: string;
        page?: string;
        activeTasks?: any[];
        userName?: string;
      };
    };

    if (!message && !imageBase64) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    // Build context prefix
    const ctxLines: string[] = [];
    if (context.role) ctxLines.push(`User role: ${context.role}`);
    if (context.userName) ctxLines.push(`User name: ${context.userName}`);
    if (context.page) ctxLines.push(`Current page: ${context.page}`);
    if (context.activeTasks?.length) {
      ctxLines.push(`Active Tasks: ${JSON.stringify(context.activeTasks.map(t => ({ id: t.task_id || t.id, title: t.title, desc: t.description })))}`);
    }
    const ctxPrefix = ctxLines.length ? `[Current Platform Context: ${ctxLines.join(" | ")}]\n` : "";

    const userText = ctxPrefix + (message || (imageBase64 ? "I am uploading this image to verify my progress." : ""));

    // Build the current turn parts
    const currentParts: any[] = [{ text: userText }];
    if (imageBase64 && imageMimeType) {
      currentParts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
    }

    const chat = model.startChat({
      history: buildHistoryParts(history),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    const result = await chat.sendMessage(currentParts);
    const raw = result.response.text().trim();

    // Parse JSON response
    let parsed: any = null;
    try {
      const clean = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { reply: raw, action: { type: "none" }, calls: [], suggestions: [] };
    }

    return NextResponse.json({
      reply: parsed.reply ?? raw,
      action: parsed.action ?? { type: "none" },
      calls: parsed.calls ?? [],
      suggestions: parsed.suggestions ?? [],
    });
  } catch (err: any) {
    const isKey = err?.message?.includes("API_KEY") || err?.message?.includes("API key");
    return NextResponse.json(
      {
        reply: isKey
          ? "The Gemini API key is not configured. Please add GEM_KEY to enable the intelligent assistant."
          : "I encountered a technical issue while processing your request. Please try again.",
        action: { type: "none" },
        calls: [],
        suggestions: [],
      },
      { status: isKey ? 503 : 500 }
    );
  }
}
