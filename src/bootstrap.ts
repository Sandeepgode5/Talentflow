// src/bootstrap.ts
// Open IndexedDB (if present), seed mock data (if seeders exist), then start MSW.
// We start MSW in BOTH dev and production so Netlify has working /api/* mocks.

import * as DB from "./db";

async function maybeStartMSW() {
  // Only in the browser
  if (typeof window === "undefined") return;

  const { worker } = await import("./mocks/browser");
  await worker.start({
    // ensure Netlify serves the committed SW file
    serviceWorker: { url: "/mockServiceWorker.js" },
    onUnhandledRequest: "bypass",
  });
}

(async () => {
  // 1) Open DB if this project exposes it
  const anyDB = DB as any;
  if (anyDB?.db?.open && typeof anyDB.db.open === "function") {
    try {
      await anyDB.db.open();
    } catch {
      // ignore if DB not needed
    }
  }

  // 2) Seed in a sensible order (only if the functions exist)
  const seeders: Array<() => Promise<unknown>> = [];
  if (typeof anyDB.seedCandidatesIfEmpty === "function") seeders.push(anyDB.seedCandidatesIfEmpty);
  if (typeof anyDB.seedJobsIfEmpty === "function")       seeders.push(anyDB.seedJobsIfEmpty);
  if (typeof anyDB.seedAssessmentsIfEmpty === "function") seeders.push(anyDB.seedAssessmentsIfEmpty);

  for (const seed of seeders) {
    try { await seed(); } catch { /* ignore */ }
  }

  // 3) Start MSW (dev + prod) so API routes resolve everywhere
  await maybeStartMSW();
})();
