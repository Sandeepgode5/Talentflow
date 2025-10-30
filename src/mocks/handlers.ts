// src/mocks/handlers.ts
import { http, HttpResponse, delay } from "msw";
import { db, seedCandidatesIfEmpty, seedJobsIfEmpty } from "../db";

import type { Job, JobsListResponse } from "../types";
import type { Assessment, AssessmentsListResponse, AssessmentStatus } from "../types";






/** Utils */
function toInt(value: string | null, fallback: number) {
  const n = Number(value ?? "");
  return Number.isFinite(n) ? n : fallback;
}
function includesInsensitive(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}
function uuid() {
  
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function randomLatency() {
  return 200 + Math.floor(Math.random() * 1000);
}
function shouldFailWrite() {
  return Math.random() < 0.08; // ~8% failure for writes/reorder
}

export const handlers = [
  /** LIST: GET /api/jobs
   * Accepts q|search and limit|pageSize to match the spec.
   */
  http.get("/api/jobs", async ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? url.searchParams.get("search") ?? "").trim();
    const status = url.searchParams.get("status"); // open|closed|archived
    const tag = url.searchParams.get("tag");
    const page = toInt(url.searchParams.get("page"), 1);
    const limit = toInt(url.searchParams.get("limit") ?? url.searchParams.get("pageSize"), 10);
    const offset = (page - 1) * limit;

    let all = await db.jobs.orderBy("order").toArray();
      // Safety net: if this is a brand-new origin, seed before responding
    if ((await db.jobs.count()) === 0) {
      await seedJobsIfEmpty();
    }

    if (q) all = all.filter(j => includesInsensitive(j.title, q) || includesInsensitive(j.slug, q));
    if (status) all = all.filter(j => j.status === status);
    if (tag) all = all.filter(j => (j.tags ?? []).includes(tag));


    const total = all.length;
    const data = all.slice(offset, offset + limit);

    await delay(randomLatency());
    const body: JobsListResponse = { data, total };
    return HttpResponse.json(body);
  }),

  /** GET ONE: /api/jobs/:id */
  http.get("/api/jobs/:id", async ({ params }) => {
    const job = await db.jobs.get(params.id as string);
    await delay(randomLatency());
    if (!job) return HttpResponse.json({ message: "Not found" }, { status: 404 });
    return HttpResponse.json(job);
  }),

  /** CREATE: POST /api/jobs */
  http.post("/api/jobs", async ({ request }) => {
    if (shouldFailWrite()) {
      await delay(randomLatency());
      return HttpResponse.json({ message: "Random write failure" }, { status: 500 });
    }

    const body = (await request.json()) as Partial<Job> & { title: string };
    const title = (body.title ?? "").trim();
    if (!title) {
      await delay(randomLatency());
      return HttpResponse.json({ message: "Title is required" }, { status: 400 });
    }

    const computedSlug = slugify(title);
    const existing = await db.jobs.where("slug").equals(computedSlug).first();
    if (existing) {
      await delay(randomLatency());
      return HttpResponse.json({ message: "Slug already exists" }, { status: 409 });
    }

    const now = Date.now();
    const maxOrder = (await db.jobs.toArray()).reduce((m, j) => Math.max(m, j.order), -1);
    const newJob: Job = {
      id: uuid(),
      title,
      slug: computedSlug,
      status: "open",
      tags: Array.isArray(body.tags) ? body.tags : [],
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.jobs.add(newJob);
    await delay(randomLatency());
    return HttpResponse.json(newJob, { status: 201 });
  }),

  /** EDIT/ARCHIVE: PATCH /api/jobs/:id */
  http.patch("/api/jobs/:id", async ({ params, request }) => {
    if (shouldFailWrite()) {
      await delay(randomLatency());
      return HttpResponse.json({ message: "Random write failure" }, { status: 500 });
    }

    const id = params.id as string;
    const job = await db.jobs.get(id);
    if (!job) {
      await delay(randomLatency());
      return HttpResponse.json({ message: "Not found" }, { status: 404 });
    }

    const patch = (await request.json()) as Partial<Job> & { title?: string; status?: Job["status"] };
    const updates: Partial<Job> = { updatedAt: Date.now() };

    if (typeof patch.title === "string") {
      const newTitle = patch.title.trim();
      if (!newTitle) {
        await delay(randomLatency());
        return HttpResponse.json({ message: "Title is required" }, { status: 400 });
      }
      const newSlug = slugify(newTitle);
      if (newSlug !== job.slug) {
        const dup = await db.jobs.where("slug").equals(newSlug).first();
        if (dup) {
          await delay(randomLatency());
          return HttpResponse.json({ message: "Slug already exists" }, { status: 409 });
        }
      }
      updates.title = newTitle;
      updates.slug = slugify(newTitle);
    }

    if (patch.status && ["open", "closed", "archived"].includes(patch.status)) {
      updates.status = patch.status;
    }
    if (Array.isArray(patch.tags)) {
      updates.tags = patch.tags;
    }

    await db.jobs.update(id, updates);
    const updated = await db.jobs.get(id);
    await delay(randomLatency());
    return HttpResponse.json(updated);
  }),

  /** REORDER: POST /api/jobs/reorder */
  http.post("/api/jobs/reorder", async ({ request }) => {
    if (shouldFailWrite()) {
      await delay(400);
      return HttpResponse.json({ message: "Random reorder failure" }, { status: 500 });
    }

    const { sourceId, destinationId, position } = (await request.json()) as {
      sourceId: string;
      destinationId: string;
      position: "before" | "after";
    };

    const list = await db.jobs.orderBy("order").toArray();
    const from = list.findIndex((j) => j.id === sourceId);
    const to = list.findIndex((j) => j.id === destinationId);
    if (from === -1 || to === -1) {
      await delay(200);
      return HttpResponse.json({ message: "Bad ids" }, { status: 400 });
    }

    let newIndex = to + (position === "after" ? 1 : 0);
    if (from < newIndex) newIndex--;

    const [moved] = list.splice(from, 1);
    list.splice(newIndex, 0, moved);

    const updated = list.map((j, idx) => ({ ...j, order: idx, updatedAt: Date.now() }));
    await db.jobs.bulkPut(updated);

    await delay(250 + Math.random() * 600);
    return HttpResponse.json({ ok: true });
  }),

  /** REORDER alias (spec): PATCH /api/jobs/:id/reorder
   * Accepts { toOrder } or { destinationId }.
   */
  http.patch("/api/jobs/:id/reorder", async ({ params, request }) => {
    const id = params.id as string;
    const body = (await request.json().catch(() => ({}))) as {
      toOrder?: number;
      destinationId?: string;
    };

    const list = await db.jobs.orderBy("order").toArray();
    const fromIndex = list.findIndex((j) => j.id === id);
    if (fromIndex === -1) return HttpResponse.json({ message: "Not found" }, { status: 404 });

    let toIndex: number | null = null;
    if (typeof body.toOrder === "number") {
      toIndex = Math.max(0, Math.min(list.length - 1, body.toOrder));
    } else if (typeof body.destinationId === "string") {
      toIndex = list.findIndex((j) => j.id === body.destinationId);
    }
    if (toIndex == null || toIndex === -1) {
      return HttpResponse.json({ message: "Bad destination" }, { status: 400 });
    }

    if (shouldFailWrite()) {
      await delay(400);
      return HttpResponse.json({ message: "Random reorder failure" }, { status: 500 });
    }

    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);

    const updated = list.map((j, idx) => ({ ...j, order: idx, updatedAt: Date.now() }));
    await db.jobs.bulkPut(updated);
    await delay(250 + Math.random() * 600);
    return HttpResponse.json({ ok: true });
  }),

  // ---------- CANDIDATES ----------

  // List with pagination + search (name/email) + stage filter
  http.get("/api/candidates", async ({ request }) => {
    await seedCandidatesIfEmpty?.();

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const stage = url.searchParams.get("stage") ?? "";
    const page = Number(url.searchParams.get("page") ?? "1") || 1;
    const limit = Number(url.searchParams.get("limit") ?? "50") || 50;
    const offset = (page - 1) * limit;

    let all = await db.candidates.toArray();
    // stable order: by stage, then by "order" inside
    all.sort((a, b) => (a.stage === b.stage ? a.order - b.order : a.stage.localeCompare(b.stage)));

    if (q) {
      all = all.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      );
    }
    if (stage) {
      all = all.filter((c) => c.stage === stage);
    }

    const total = all.length;
    const data = all.slice(offset, offset + limit);

    await delay(200 + Math.random() * 600);
    return HttpResponse.json({ data, total });
  }),

  // Get one
  http.get("/api/candidates/:id", async ({ params }) => {
    const c = await db.candidates.get(params.id as string);
    await delay(150 + Math.random() * 400);
    if (!c) return HttpResponse.json({ message: "Not found" }, { status: 404 });
    return HttpResponse.json(c);
  }),

  // Edit / Move stage
  http.patch("/api/candidates/:id", async ({ params, request }) => {
    const id = params.id as string;
    const c = await db.candidates.get(id);
    if (!c) {
      await delay(150);
      return HttpResponse.json({ message: "Not found" }, { status: 404 });
    }

    const patch = (await request.json().catch(() => ({}))) as Partial<{
      name: string; tags: string[]; stage: string;
    }>;

    // ~6% simulated failure to exercise optimistic rollback later
    if (Math.random() < 0.06) {
      await delay(300);
      return HttpResponse.json({ message: "Random update failure" }, { status: 500 });
    }

    const updates: Partial<typeof c> = {};
    if (typeof patch.name === "string" && patch.name.trim()) updates.name = patch.name.trim();
    if (Array.isArray(patch.tags)) updates.tags = patch.tags;

    if (typeof patch.stage === "string" && patch.stage !== c.stage) {
      // moving stages → append to end of target column
      const max = (await db.candidates.where("stage").equals(patch.stage).toArray())
        .reduce((m, it) => Math.max(m, it.order), -1);
      updates.stage = patch.stage as any;
      updates.order = max + 1;
    }

    updates.updatedAt = Date.now();
    await db.candidates.update(id, updates);
    const updated = await db.candidates.get(id);

    await delay(200 + Math.random() * 400);
    return HttpResponse.json(updated);
  }),

  
http.post("/api/candidates/reorder", async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    sourceId?: string;
    destinationId?: string;
    position?: "before" | "after";
  };

  const { sourceId, destinationId, position } = body;
  if (!sourceId || !destinationId || (position !== "before" && position !== "after")) {
    await delay(150);
    return HttpResponse.json({ message: "Bad payload" }, { status: 400 });
  }

  const source = await db.candidates.get(sourceId);
  const dest = await db.candidates.get(destinationId);
  if (!source || !dest) {
    await delay(150);
    return HttpResponse.json({ message: "Bad ids" }, { status: 400 });
  }

  // Reorder is only for same-column (same stage)
  if (source.stage !== dest.stage) {
    await delay(150);
    return HttpResponse.json({ message: "Stages differ" }, { status: 400 });
  }

  // Candidates in this stage, ordered
  const list = (await db.candidates.where("stage").equals(source.stage).toArray())
    .sort((a, b) => a.order - b.order);

  const from = list.findIndex((c) => c.id === sourceId);
  const to = list.findIndex((c) => c.id === destinationId);
  if (from === -1 || to === -1) {
    await delay(150);
    return HttpResponse.json({ message: "Not found in stage" }, { status: 404 });
  }

  // Compute insertion index; allow inserting at the end
  let insertIndex =
    position === "after"
      ? (from < to ? to : to + 1)
      : (from < to ? to - 1 : to);

  insertIndex = Math.max(0, Math.min(list.length, insertIndex)); // note: list.length (not -1)

  const [moved] = list.splice(from, 1);
  list.splice(insertIndex, 0, moved);

  // Reassign contiguous order values
  const updated = list.map((c, i) => ({ ...c, order: i, updatedAt: Date.now() }));
  await db.candidates.bulkPut(updated);

  await delay(200 + Math.random() * 500);
  return HttpResponse.json({ ok: true });
}),

  
    

// Optional alias to support { toOrder } or { destinationId }
http.patch("/api/candidates/:id/reorder", async ({ params, request }) => {
  const id = params.id as string;
  const body = (await request.json().catch(() => ({}))) as {
    toOrder?: number;
    destinationId?: string;
  };

  const source = await db.candidates.get(id);
  if (!source) return HttpResponse.json({ message: "Not found" }, { status: 404 });

  const list = (await db.candidates.where("stage").equals(source.stage).toArray())
    .sort((a, b) => a.order - b.order);

  const from = list.findIndex((c) => c.id === id);
  if (from === -1) return HttpResponse.json({ message: "Not found in stage" }, { status: 404 });

  let to = -1;
  if (typeof body.toOrder === "number") {
    to = Math.max(0, Math.min(list.length - 1, body.toOrder));
  } else if (typeof body.destinationId === "string") {
    to = list.findIndex((c) => c.id === body.destinationId);
  }
  if (to < 0) return HttpResponse.json({ message: "Bad destination" }, { status: 400 });

  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);

  const updated = list.map((c, i) => ({ ...c, order: i, updatedAt: Date.now() }));
  await db.candidates.bulkPut(updated);
  await delay(200 + Math.random() * 500);
  return HttpResponse.json({ ok: true });
}),




// List with pagination + q + status
http.get("/api/assessments", async ({ request }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") as AssessmentStatus | "" ;
  const jobId = (url.searchParams.get("jobId") ?? "").trim();
  const candidateId = url.searchParams.get("candidateId") ?? ""; 
  const page = Number(url.searchParams.get("page") ?? "1") || 1;
  const limit = Number(url.searchParams.get("limit") ?? "20") || 20;
  const offset = (page - 1) * limit;

  let all = await db.assessments.toArray();

  if (q) {
    all = all.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.candidateId.toLowerCase().includes(q)
    );
  }
  if (status) {
    all = all.filter(a => a.status === status);
  }
  if (candidateId) {                            
    all = all.filter(a => a.candidateId === candidateId);
  }
  if (jobId) {                                         
    all = all.filter(a => a.jobId === jobId);
  }

  all.sort((a, b) => b.createdAt - a.createdAt);

  const total = all.length;
  const data = all.slice(offset, offset + limit);

  await delay(200 + Math.random() * 400);
  const body: AssessmentsListResponse = { data, total };
  return HttpResponse.json(body);
}),


// Get one
http.get("/api/assessments/:id", async ({ params }) => {
  const a = await db.assessments.get(params.id as string);
  await delay(150 + Math.random() * 300);
  if (!a) return HttpResponse.json({ message: "Not found" }, { status: 404 });
  return HttpResponse.json(a);
}),

// Create
http.post("/api/assessments", async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as Partial<Assessment>;

  const title = (body.title ?? "").trim();
  if (!title) {
    await delay(150);
    return HttpResponse.json({ message: "Title is required" }, { status: 400 });
  }
  const candidateId = (body.candidateId ?? "").trim();
  if (!candidateId) {
    await delay(150);
    return HttpResponse.json({ message: "candidateId is required" }, { status: 400 });
  }

  if (Math.random() < 0.06) {
    await delay(200);
    return HttpResponse.json({ message: "Random create failure" }, { status: 500 });
  }

  const now = Date.now();
  const newItem: Assessment = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2)}-${Date.now()}`,
    title,
    candidateId,
    jobId: body.jobId ?? null,
    status: (body.status as AssessmentStatus) ?? "draft",
    scheduledAt: body.scheduledAt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.assessments.add(newItem);
  await delay(150 + Math.random() * 300);
  return HttpResponse.json(newItem, { status: 201 });
}),

// Update (status, title, schedule, jobId)
http.patch("/api/assessments/:id", async ({ params, request }) => {
  const id = params.id as string;
  const a = await db.assessments.get(id);
  if (!a) {
    await delay(120);
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }

  const patch = (await request.json().catch(() => ({}))) as Partial<Assessment>;

  if (Math.random() < 0.06) {
    await delay(200);
    return HttpResponse.json({ message: "Random update failure" }, { status: 500 });
  }

  const updates: Partial<Assessment> = { updatedAt: Date.now() };

  if (typeof patch.title === "string" && patch.title.trim()) {
    updates.title = patch.title.trim();
  }
  if (typeof patch.status === "string") {
    updates.status = patch.status as AssessmentStatus;
  }
  if (typeof patch.candidateId === "string") {
    updates.candidateId = patch.candidateId;
  }
  if (typeof patch.jobId === "string" || patch.jobId === null) {
    updates.jobId = patch.jobId ?? null;
  }
  if (typeof patch.scheduledAt === "number" || patch.scheduledAt === null) {
    updates.scheduledAt = patch.scheduledAt ?? null;
  }

  await db.assessments.update(id, updates);
  const updated = await db.assessments.get(id);

  await delay(150 + Math.random() * 300);
  return HttpResponse.json(updated);
}),




// ---------- CANDIDATE NOTES ----------

// List notes for a candidate (newest first)
http.get("/api/candidates/:id/notes", async ({ params }) => {
  const candidateId = params.id as string;
  const list = (await db.candidateNotes.where("candidateId").equals(candidateId).toArray())
    .sort((a, b) => b.createdAt - a.createdAt);
  await delay(120 + Math.random() * 200);
  return HttpResponse.json(list);
}),

// Create a note
http.post("/api/candidates/:id/notes", async ({ params, request }) => {
  const candidateId = params.id as string;
  const body = (await request.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim();
  if (!text) {
    await delay(120);
    return HttpResponse.json({ message: "Note body is required" }, { status: 400 });
  }

  // small chance of failure to exercise optimistic rollback
  if (Math.random() < 0.05) {
    await delay(150);
    return HttpResponse.json({ message: "Random create failure" }, { status: 500 });
  }

  const note = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    candidateId,
    body: text,
    author: "Recruiter",
    createdAt: Date.now(),
  };
  await db.candidateNotes.add(note);
  await delay(120 + Math.random() * 200);
  return HttpResponse.json(note, { status: 201 });
}),

// Delete a note
http.delete("/api/notes/:noteId", async ({ params }) => {
  const noteId = params.noteId as string;
  // small chance of failure
  if (Math.random() < 0.05) {
    await delay(150);
    return HttpResponse.json({ message: "Random delete failure" }, { status: 500 });
  }
  await db.candidateNotes.delete(noteId);
  await delay(100 + Math.random() * 150);
  return HttpResponse.json({ ok: true });
}),

// Delete
http.delete("/api/assessments/:id", async ({ params }) => {
  const id = params.id as string;
  const found = await db.assessments.get(id);
  if (!found) {
    await delay(120);
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }
  await db.assessments.delete(id);
  await delay(120 + Math.random() * 200);
  return HttpResponse.json({}, { status: 204 });
}),

// Lightweight totals for nav badges
http.get("/api/_counts", async () => {
  const [jobs, candidates, assessments] = await Promise.all([
    db.jobs.count(),
    db.candidates.count(),
    db.assessments.count(),
  ]);
  await delay(80);
  return HttpResponse.json({ jobs, candidates, assessments });
}),


];
