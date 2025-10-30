// src/db.ts
import Dexie, { type Table } from "dexie";
import type {
  Job,
  Candidate,
  CandidateNote,
  Assessment,
  AssessmentStatus,
} from "./types";

class AppDB extends Dexie {
  jobs!: Table<Job, string>;
  candidates!: Table<Candidate, string>;
  candidateNotes!: Table<CandidateNote, string>;
  assessments!: Table<Assessment, string>; // NEW

  constructor() {
    super("talentflow-db");

    // v2 (your existing schema)
    this.version(2).stores({
      jobs: "id, slug, status, order",
      candidates: "id, email, stage, order",
      candidateNotes: "id, candidateId, createdAt",
    });

    // v3: add "assessments" and migrate stage "screen" -> "screening"
    this.version(3)
      .stores({
        jobs: "id, slug, status, order",
        candidates: "id, email, stage, order",
        candidateNotes: "id, candidateId, createdAt",
        assessments: "id, status, candidateId, jobId, createdAt, updatedAt",
      })
      .upgrade(async (tx) => {
        // Normalize legacy stage value
        await tx
          .table("candidates")
          .toCollection()
          .modify((c: any) => {
            if (c.stage === "screen") c.stage = "screening";
          });
      });
  }
}

export const db = new AppDB();

/* ---------------- helpers ---------------- */
function uuid() {
  // @ts-expect-error crypto may be undefined in some envs
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function nameFromSeed(i: number) {
  const first = [
    "Alex",
    "Taylor",
    "Jordan",
    "Casey",
    "Morgan",
    "Sam",
    "Riley",
    "Jamie",
    "Avery",
    "Quinn",
  ];
  const last = [
    "Lee",
    "Patel",
    "Garcia",
    "Nguyen",
    "Kim",
    "Lopez",
    "Brown",
    "Khan",
    "Singh",
    "Chen",
  ];
  return `${first[i % first.length]} ${last[i % last.length]}`;
}
function emailFromName(n: string, i: number) {
  return n.toLowerCase().replace(/[^a-z]/g, ".") + i + "@example.com";
}

/* ---------------- seeds ---------------- */

/** Seed ~1000 candidates across stages on first need */
export async function seedCandidatesIfEmpty() {
  const count = await db.candidates.count();
  if (count > 0) return;

  // IMPORTANT: align with UI/handlers
  const stages = [
    "applied",
    "screening",
    "interview",
    "offer",
    "hired",
    "rejected",
  ] as const;

  const tags = ["remote", "hybrid", "junior", "senior", "contract", "full-time"];

  const batch: Candidate[] = [];
  const orderByStage: Record<string, number> = {
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
  };

  for (let i = 1; i <= 1000; i++) {
    const name = nameFromSeed(i);
    const stage = pick(stages);
    const now =
      Date.now() -
      Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 60); // random last 60 days
    batch.push({
      id: uuid(),
      name,
      email: emailFromName(name, i),
      stage,
      tags: [pick(tags)],
      appliedAt: now,
      updatedAt: now,
      order: orderByStage[stage]++,
    });
  }

  await db.candidates.bulkAdd(batch);
}

/** Seed a handful of assessments */
export async function seedAssessmentsIfEmpty() {
  const count = await db.assessments.count();
  if (count > 0) return;

  const now = Date.now();

  const mk = (
    i: number,
    candidateId: string,
    jobId: string | null,
    status: AssessmentStatus
  ): Assessment => ({
    id: uuid(),
    title: `Frontend Skills v${i}`,
    candidateId,
    jobId,
    status,
    scheduledAt: status === "draft" ? null : now - i * 3600_000,
    createdAt: now - i * 7200_000,
    updatedAt: now - i * 1800_000,
  });

  // Use a few existing candidates/jobs if present; otherwise fall back
  const candidates = await db.candidates.limit(6).toArray();
  const jobs = await db.jobs.limit(3).toArray();

  const cid = (i: number) =>
    candidates[i % Math.max(1, candidates.length)]?.id ?? `CAND-${i}`;
  const jid = (i: number) =>
    jobs[i % Math.max(1, jobs.length)]?.id ?? null;

  const seed: Assessment[] = [
    mk(1, cid(0), jid(0), "draft"),
    mk(2, cid(1), jid(1), "pending"),
    mk(3, cid(2), jid(2), "sent"),
    mk(4, cid(3), jid(0), "completed"),
    mk(5, cid(4), jid(1), "sent"),
    mk(6, cid(5), jid(2), "expired"),
  ];

  await db.assessments.bulkAdd(seed);
}
