// src/bootstrap.ts
// Opens IndexedDB, seeds demo data, then starts MSW (dev + prod).

import * as DB from "./db";

export const bootstrapReady: Promise<void> = (async () => {
  try {
    // 1) Open DB
    if ((DB as any)?.db?.open) {
      await (DB as any).db.open();
    }

    // 2) Seed (candidates → jobs → assessments)
    if (typeof (DB as any).seedCandidatesIfEmpty === "function") {
      await (DB as any).seedCandidatesIfEmpty();
    }
    if (typeof (DB as any).seedJobsIfEmpty === "function") {
      await (DB as any).seedJobsIfEmpty();
    }
    if (typeof (DB as any).seedAssessmentsIfEmpty === "function") {
      await (DB as any).seedAssessmentsIfEmpty();
    }

    // 3) Start MSW (Netlify has no real API)
    const { worker } = await import("./mocks/browser");
    await worker.start({
      serviceWorker: { url: "/mockServiceWorker.js" },
      onUnhandledRequest: "bypass",
    });

    // Optional: tiny delay so worker is fully active before first fetch
    await new Promise((r) => setTimeout(r, 50));
    // eslint-disable-next-line no-console
    console.info("[bootstrap] ready");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bootstrap] failed", err);
  }
})();
