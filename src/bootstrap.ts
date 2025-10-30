// src/bootstrap.ts
// Opens IndexedDB, runs available seeders in a safe order, then starts MSW in dev.

import * as DB from "./db";

(async function start() {
  // 1) Open DB if exported
  if (DB && (DB as any).db && typeof (DB as any).db.open === "function") {
    await (DB as any).db.open();
  }

  // 2) Seed in sensible order: candidates → jobs → assessments
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

  for (const seed of seeders) {
    await seed();
  }

  // 3) Start MSW in dev so /api/* is intercepted
  if (import.meta.env.DEV) {
    const { worker } = await import("./mocks/browser");
    await worker.start({
      serviceWorker: { url: "/mockServiceWorker.js" },
      onUnhandledRequest: "bypass",
    });
  }
})();
