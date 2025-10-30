// src/bootstrap.ts
// Opens IndexedDB, runs seeders, then boots MSW (needed in prod demo too).

import * as DB from "./db";

export const bootstrapReady: Promise<void> = (async function start() {
  // 1) Open DB
  if ((DB as any)?.db?.open) {
    await (DB as any).db.open();
  }

  // 2) Seed in order: candidates → jobs → assessments
  const seeders: Array<() => Promise<unknown>> = [];
  if (typeof (DB as any).seedCandidatesIfEmpty === "function") {
    seeders.push((DB as any).seedCandidatesIfEmpty);
  }
  if (typeof (DB as any).seedJobsIfEmpty === "function") {
    seeders.push((DB as any).seedJobsIfEmpty);
  }
  if (typeof (DB as any).seedAssessmentsIfEmpty === "function") {
    seeders.push((DB as any).seedAssessmentsIfEmpty);
  }
  for (const seed of seeders) await seed();

  // 3) Start MSW (also in production; Netlify has no real API)
  const { worker } = await import("./mocks/browser");
  await worker.start({
    serviceWorker: { url: "/mockServiceWorker.js" },
    onUnhandledRequest: "bypass",
  });
})();

// Keep side effect so existing `import "./bootstrap"` still runs it
void bootstrapReady;
