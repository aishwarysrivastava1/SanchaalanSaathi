import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // 0. Security Check
    const authHeader = request.headers.get("x-sync-secret");
    if (process.env.SYNC_SECRET && authHeader !== process.env.SYNC_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();
    // This endpoint proxies webhook events from Firebase to Neo4j
    
    if (data.type === "volunteer_status" && data.neoId) {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/graph/update-node`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "Volunteer",
          nodeId: data.neoId,
          updates: { availabilityStatus: data.status },
        }),
      });
      if (!res.ok) throw new Error("Backend update failed");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SYNC ERROR]:", process.env.NODE_ENV === "development" ? error : "Masked");
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
