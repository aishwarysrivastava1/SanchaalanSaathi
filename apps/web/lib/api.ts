import { NeedNode, HotspotResult, SimulationComparison } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * SECURITY HELPERS
 */

function sanitizeInput(input: string): string {
  // Basic sanitization: strip HTML/script tags and limit length
  return input
    .replace(/<[^>]*>?/gm, '') 
    .trim()
    .slice(0, 2000); 
}

function handleApiError(error: any, context: string) {
  if (!IS_PROD) {
    console.error(`[API ERROR] ${context}:`, error);
  } else {
    // In production, log a generic event without exposing details
    console.error(`[API ERROR] Security masked error in ${context}`);
  }
}

/**
 * GRAPH DATA FETCHING
 */

export async function fetchNeeds(status?: string, type?: string): Promise<NeedNode[]> {
  try {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (type) params.append("type", type);
    
    const res = await fetch(`${API_BASE}/api/graph/needs?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch needs");
    
    const data = await res.json();
    return data.needs.map((item: any) => ({
      ...item.n,
      location: item.l
    }));
  } catch (error) {
    handleApiError(error, "fetchNeeds");
    return [];
  }
}

export async function fetchVolunteers() {
  try {
    const res = await fetch(`${API_BASE}/api/graph/volunteers`);
    if (!res.ok) throw new Error("Failed to fetch volunteers");
    const data = await res.json();
    return data.volunteers;
  } catch (error) {
    handleApiError(error, "fetchVolunteers");
    return [];
  }
}

export async function createVolunteer(data: any): Promise<any> {
    try {
        const res = await fetch(`${API_BASE}/api/volunteers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error("Failed to create volunteer");
        return res.json();
    } catch (error) {
        handleApiError(error, "createVolunteer");
        throw error;
    }
}

export async function fetchHotspots(): Promise<HotspotResult[]> {
  try {
    const res = await fetch(`${API_BASE}/api/graph/hotspots`);
    if (!res.ok) throw new Error("Failed to fetch hotspots");
    const data = await res.json();
    return data.hotspots;
  } catch (error) {
    handleApiError(error, "fetchHotspots");
    return [];
  }
}

export async function askGraphIntelligence(query: string) {
  try {
    const safeQuery = sanitizeInput(query);
    const res = await fetch(`${API_BASE}/api/graph/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: safeQuery })
    });
    if (!res.ok) throw new Error("Graph intelligence query failed");
    return res.json();
  } catch (error) {
    handleApiError(error, "askGraphIntelligence");
    throw new Error("Query could not be processed safely.");
  }
}

/**
 * SIMULATION
 */

export async function runComparisonSim(steps: number = 100): Promise<SimulationComparison | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sim/compare?steps=${steps}`, {
      method: "POST"
    });
    if (!res.ok) throw new Error("Simulation comparison failed");
    return res.json();
  } catch (error) {
    handleApiError(error, "runComparisonSim");
    return null;
  }
}

/**
 * INGESTION
 */

export async function ingestDocument(file: File) {
  try {
    const formData = new FormData();
    formData.append("file", file);
    
    const res = await fetch(`${API_BASE}/api/ingest/document`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) throw new Error("Document ingestion failed");
    return res.json();
  } catch (error) {
    handleApiError(error, "ingestDocument");
    throw error;
  }
}

export async function ingestText(text: string) {
  try {
    const safeText = sanitizeInput(text);
    const res = await fetch(`${API_BASE}/api/ingest/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: safeText, language: "en" })
    });
    
    if (!res.ok) throw new Error("Text ingestion failed");
    return res.json();
  } catch (error) {
    handleApiError(error, "ingestText");
    throw new Error("Intel report could not be ingested safely.");
  }
}
