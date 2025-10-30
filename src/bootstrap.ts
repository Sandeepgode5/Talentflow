// src/bootstrap.ts
// Opens IndexedDB, runs seeders, then boots MSW (both dev and prod for demo).

import * as DB from "./db";

(async function start() {
  // Open DB (Dexie) first
  if ((DB as any)?.db?.open) {
    await (DB as any).db.open();
  }

  // Seed: candidates → jobs → assessments
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

  // IMPORTANT: start MSW in production too (no real API on Netlify)
  const { worker } = await import("./mocks/browser");
  await worker.start({
    serviceWorker: { url: "/mockServiceWorker.js" },
    onUnhandledRequest: "bypass",
  });
})();
