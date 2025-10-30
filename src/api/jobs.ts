// src/api/jobs.ts
import type { Job, JobsListResponse } from "../types";

export async function fetchJobs(params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  tag?: string;
} = {}): Promise<JobsListResponse> {
  const u = new URL("/api/jobs", window.location.origin);
  if (params.page) u.searchParams.set("page", String(params.page));
  if (params.limit) u.searchParams.set("limit", String(params.limit));
  if (params.q) u.searchParams.set("q", params.q);
  if (params.status) u.searchParams.set("status", params.status);
  if (params.tag) u.searchParams.set("tag", params.tag);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
  return res.json();
}

export async function createJob(input: { title: string; tags?: string[] }) {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Create failed (${res.status})`);
  }
  return res.json();
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Not found (${res.status})`);
  }
  return res.json();
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<Job, "title" | "status" | "tags">>
): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`, {
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

export async function setArchive(id: string, archived: boolean) {
  return updateJob(id, { status: archived ? "archived" : "open" } as any);
}

/** Reorder jobs globally (same list) */
export async function reorderJob(args: {
  sourceId: string;
  destinationId: string;
  position: "before" | "after";
}) {
  const res = await fetch(`/api/jobs/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Reorder failed (${res.status})`);
  }
  return res.json();
}

export async function patchJob(id: string, patch: Partial<Job>): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`, {
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