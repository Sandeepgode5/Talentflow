// src/pages/Candidates.tsx
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useHotkeys from "../hooks/useHotkeys";

import {
  fetchCandidates,
  moveCandidateStage,
  type Candidate,
} from "../api/candidates";
import { downloadCsv } from "../lib/download";

function toInt(v: string | null, fallback: number) {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : fallback;
}

// Keep this in sync with whatever you seed in db.ts
const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"];

export default function Candidates() {
  useHotkeys();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();

  // URL state
  const page = toInt(sp.get("page"), 1);
  const limit = toInt(sp.get("limit"), 50);
  const q = sp.get("q") ?? "";
  const stageFilter = sp.get("stage") ?? "";

  const queryKey = useMemo(
    () => ["candidates", { page, limit, q, stage: stageFilter }],
    [page, limit, q, stageFilter]
  );

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      fetchCandidates({
        page,
        limit,
        q: q || undefined,
        stage: stageFilter || undefined,
      }),
    keepPreviousData: true,
    retry: 1,
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    setSp(next, { replace: true });
  }
  function setPage(nextPage: number) {
    const next = new URLSearchParams(sp);
    next.set("page", String(nextPage));
    setSp(next, { replace: true });
  }

  // --- Optimistic stage change ---
  const [stageError, setStageError] = useState<string | null>(null);
  const stageMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      moveCandidateStage(id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey });

      const prev = qc.getQueryData<{ data: Candidate[]; total: number }>(queryKey);
      if (prev?.data) {
        const copy = prev.data.map((c) =>
          c.id === id ? { ...c, stage } : c
        );
        qc.setQueryData(queryKey, { ...prev, data: copy });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      setStageError((err as Error).message || "Stage update failed");
      setTimeout(() => setStageError(null), 3000);
    },
    onSettled: () => {
      // ensure server truth wins across pages/filters
      qc.invalidateQueries({ queryKey: ["candidates"] });
    },
  });

  const total = data?.total ?? 0;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const canPrev = page > 1;
  const canNext = end < total;

  // ---------- Export CSV (ALL rows for current filters) ----------
  const [exporting, setExporting] = useState(false);
  async function onExportAll() {
    try {
      setExporting(true);
      const PAGE_LIMIT = 1000;
      let all: Candidate[] = [];
      let cur = 1;
      let fetched = 0;
      let totalAll = Infinity;

      while (fetched < totalAll) {
        const res = await fetchCandidates({
          page: cur,
          limit: PAGE_LIMIT,
          q: q || undefined,
          stage: stageFilter || undefined,
        });
        all = all.concat(res.data);
        fetched += res.data.length;
        totalAll = res.total;
        if (res.data.length === 0) break;
        cur += 1;
      }

      const rows = all
        .sort((a, b) => a.order - b.order)
        .map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          stage: c.stage,
          tags: (c.tags || []).join("; "),
          order: c.order,
          appliedAt: new Date(c.appliedAt).toLocaleString(),
          updatedAt: new Date(c.updatedAt).toLocaleString(),
        }));

      const fname = `candidates_${stageFilter || "all"}_${
        q ? `q-${q.replace(/\s+/g, "_")}` : "all"
      }_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

      downloadCsv(fname, rows);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      className="rounded-2xl bg-white shadow p-6 text-slate-900
                 dark:bg-slate-800 dark:text-slate-100 dark:shadow-none dark:border dark:border-slate-700"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Candidates</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Virtualized list (1,000+) with search &amp; stage filter. Kanban and profile pages are next.
          </p>
          {stageError && (
            <div className="mt-2 text-xs text-red-600">{stageError}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFetching && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Updating…</span>
          )}
          <button
            data-hotkey="export"
            className="rounded-lg px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-50
                       dark:border-slate-700 dark:hover:bg-white/10"
            onClick={onExportAll}
            disabled={exporting}
            title="Export all results (matching current filters) to CSV"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50
                     bg-white text-slate-900
                     dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => updateParam("q", e.target.value)}
          aria-label="Search candidates"
        />
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50
                     bg-white text-slate-900
                     dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
          value={stageFilter}
          onChange={(e) => updateParam("stage", e.target.value)}
          aria-label="Filter by stage"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50
                     bg-white text-slate-900
                     dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
          value={String(limit)}
          onChange={(e) => updateParam("limit", e.target.value)}
          aria-label="Items per page"
        >
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
        </select>
        {/* spacer */}
        <div />
      </div>

      {/* Results */}
      {isLoading && <p className="mt-6 text-gray-500 dark:text-gray-400">Loading candidates…</p>}
      {isError && (
        <div className="mt-6">
          <p className="text-red-600">Error: {(error as Error).message}</p>
          <button
            onClick={() => refetch()}
            className="mt-2 rounded-lg px-3 py-1 text-sm bg-black text-white dark:bg-white dark:text-black"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing <span className="font-medium">{start}</span>–
              <span className="font-medium">{end}</span> of{" "}
              <span className="font-medium">{total}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg px-3 py-1 text-sm border border-gray-300 disabled:opacity-50
                           dark:border-slate-700 dark:hover:bg-white/10"
                onClick={() => setPage(page - 1)}
                disabled={!canPrev}
              >
                ← Prev
              </button>
              <button
                className="rounded-lg px-3 py-1 text-sm border border-gray-300 disabled:opacity-50
                           dark:border-slate-700 dark:hover:bg-white/10"
                onClick={() => setPage(page + 1)}
                disabled={!canNext}
              >
                Next →
              </button>
            </div>
          </div>

          <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-800">
            {data.data.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      <Link to={`/candidates/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>{" "}
                      <span className="text-gray-500 dark:text-gray-400">· {c.email}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      tags: {(c.tags || []).join(", ") || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs
                                 bg-white text-slate-900
                                 focus:outline-none focus:ring-2 focus:ring-black/40
                                 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
                      value={c.stage}
                      onChange={(e) =>
                        stageMut.mutate({ id: c.id, stage: e.target.value })
                      }
                      aria-label={`Change stage for ${c.name}`}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    {/* Order pill now visible in dark mode */}
                    <span
                      className="rounded-full border px-2 py-1 text-xs
                                 bg-gray-100 text-gray-700 border-gray-200
                                 dark:bg-white/10 dark:text-gray-200 dark:border-gray-700"
                      title="Order within the stage"
                    >
                      order {c.order}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
