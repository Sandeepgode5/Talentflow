// src/api/assessments.ts
import type { Assessment, AssessmentsListResponse, AssessmentStatus } from "../types";





export async function createAssessment(payload: {
  title: string;
  candidateId: string;
  jobId?: string | null;
  status?: Assessment["status"];
  scheduledAt?: number | null;
}): Promise<Assessment> {
  const res = await fetch("/api/assessments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Create failed (${res.status})`);
  return body;
}

export async function updateAssessment(id: string, patch: Partial<Assessment>) {
  const res = await fetch(`/api/assessments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Update failed (${res.status})`);
  return body as Assessment;
}




// fetchAssessments: add candidateId? to the params type
export async function fetchAssessments(params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: AssessmentStatus | string;
  candidateId?: string;            // <-- NEW
} = {}): Promise<AssessmentsListResponse> {
  const u = new URL("/api/assessments", window.location.origin);
  if (params.page) u.searchParams.set("page", String(params.page));
  if (params.limit) u.searchParams.set("limit", String(params.limit));
  if (params.q) u.searchParams.set("q", params.q);
  if (params.status) u.searchParams.set("status", String(params.status));
  if (params.candidateId) u.searchParams.set("candidateId", params.candidateId); // <-- NEW
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`Failed to fetch assessments: ${res.status}`);
  return res.json();
}

export async function getAssessment(id: string): Promise<Assessment> {
  const res = await fetch(`/api/assessments/${id}`);
  if (!res.ok) throw new Error(`Not found (${res.status})`);
  return res.json();
}

export async function deleteAssessment(id: string): Promise<void> {
  const res = await fetch(`/api/assessments/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Delete failed (${res.status})`);
  }
}

export async function fetchAssessmentsForJob(jobId: string, limit = 10): Promise<AssessmentsListResponse> {
  const u = new URL("/api/assessments", window.location.origin);
  u.searchParams.set("jobId", jobId);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("page", "1");
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`Failed to fetch assessments: ${res.status}`);
  return res.json();
}

