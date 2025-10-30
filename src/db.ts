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
  assessments!: Table<Assessment, string>;

  constructor() {
    super("talentflow-db");

    // v2 (legacy)
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
function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function nameFromSeed(i: number) {
  const first = ["Alex","Taylor","Jordan","Casey","Morgan","Sam","Riley","Jamie","Avery","Quinn"];
  const last  = ["Lee","Patel","Garcia","Nguyen","Kim","Lopez","Brown","Khan","Singh","Chen"];
  return `${first[i % first.length]} ${last[i % last.length]}`;
}
function emailFromName(n: string, i: number) {
  return n.toLowerCase().replace(/[^a-z]/g, ".") + i + "@example.com";
}
function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

/* ---------------- seeds ---------------- */

/** Seed ~1000 candidates across stages on first need */
export async function seedCandidatesIfEmpty() {
  const count = await db.candidates.count();
  if (count > 0) return;

  type CandidateStage = Candidate["stage"];
  const stages: CandidateStage[] = [
    "applied", "screening", "interview", "offer", "hired", "rejected",
  ];
  const tags = ["remote","hybrid","junior","senior","contract","full-time"];

  const batch: Candidate[] = [];
  const orderByStage: Record<CandidateStage, number> = {
    applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0,
  };

  for (let i = 1; i <= 1000; i++) {
    const name = nameFromSeed(i);
    const stage = pick<CandidateStage>(stages);
    const now = Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 60);

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

/** Seed a handful of jobs for first-time visitors (Netlify/new origin). */
export async function seedJobsIfEmpty() {
  const count = await db.jobs.count();
  if (count > 0) return;

  const now = Date.now();
  const titles = [
    "Frontend Engineer 1",
    "Backend Engineer 2",
    "Fullstack Developer 3",
    "Data Engineer 4",
    "ML Engineer 5",
    "QA Engineer 6",
    "DevOps Engineer 7",
    "Android Engineer 8",
    "iOS Engineer 9",
    "Product Designer 10",
  ];

  const rows: Job[] = titles.map((t, i) => ({
    id: uuid(),
    title: t,
    slug: slugify(`${t}-${i + 1}`), // make uniqueness explicit
    status: i === 3 ? "closed" : "open",
    tags: i % 2 ? ["remote"] : ["hybrid", "full-time"],
    order: i,
    createdAt: now - (titles.length - i) * 3_600_000,
    updatedAt: now - (titles.length - i) * 3_600_000,
  }));

  await db.jobs.bulkAdd(rows);
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
    scheduledAt: status === "draft" ? null : now - i * 3_600_000,
    createdAt: now - i * 7_200_000,
    updatedAt: now - i * 1_800_000,
  });

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
