// src/api/candidates.ts
import type { CandidatesListResponse, Candidate } from "../types";

export async function fetchCandidates(params: {
  page?: number;
  limit?: number;
  q?: string;
  stage?: string;
} = {}): Promise<CandidatesListResponse> {
  const u = new URL("/api/candidates", window.location.origin);
  if (params.page) u.searchParams.set("page", String(params.page));
  if (params.limit) u.searchParams.set("limit", String(params.limit));
  if (params.q) u.searchParams.set("q", params.q);
  if (params.stage) u.searchParams.set("stage", params.stage);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`Failed to fetch candidates: ${res.status}`);
  return res.json();
}

export async function getCandidate(id: string): Promise<Candidate> {
  const res = await fetch(`/api/candidates/${id}`);
  if (!res.ok) throw new Error(`Not found (${res.status})`);
  return res.json();
}

export async function patchCandidate(
  id: string,
  patch: Partial<Candidate>
): Promise<Candidate> {
  const res = await fetch(`/api/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Update failed (${res.status})`);
  }
  return res.json();
}

/** Move a candidate to a different stage (column) */
export async function moveCandidateStage(id: string, stage: string) {
  const res = await fetch(`/api/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Stage update failed (${res.status})`);
  }
  return res.json();
}

// src/api/candidates.ts
export async function reorderCandidatesWithinStage(args: {
  sourceId: string;
  // for same-column
  toOrder?: number;
  // for cross-column (after stage move)
  destinationId?: string;
  position?: "before" | "after";
}) {
  if (typeof args.toOrder === "number") {
    // index-based alias → same-column reorder
    const res = await fetch(`/api/candidates/${args.sourceId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toOrder: args.toOrder }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Reorder failed (${res.status})`);
    }
    return res.json();
  }

  // id-based API → use when reordering in the target stage after a cross-column move
  const res = await fetch(`/api/candidates/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceId: args.sourceId,
      destinationId: args.destinationId,
      position: args.position || "before",
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Reorder failed (${res.status})`);
  }
  return res.json();
}
