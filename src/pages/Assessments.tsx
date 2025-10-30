// src/pages/Assessments.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useHotkeys from "../hooks/useHotkeys";

import {
  fetchAssessments,
  createAssessment,
  updateAssessment,
} from "../api/assessments";
import { fetchCandidates } from "../api/candidates";
import { fetchJobs } from "../api/jobs";

import type {
  Assessment,
  AssessmentStatus,
  Candidate,
  Job,
  AssessmentsListResponse,
  CandidatesListResponse,
  JobsListResponse,
} from "../types";

const STATUSES: AssessmentStatus[] = [
  "draft",
  "pending",
  "sent",
  "completed",
  "expired",
  "cancelled",
];

function toInt(v: string | null, fallback: number) {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Assessments() {
  useHotkeys();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();

  // URL state
  const page = toInt(sp.get("page"), 1);
  const limit = toInt(sp.get("limit"), 20);
  const q = sp.get("q") ?? "";
  const status = (sp.get("status") as AssessmentStatus | "") ?? "";

  const queryKey = useMemo(
    () => ["assessments", { page, limit, q, status }],
    [page, limit, q, status]
  );

  // MAIN LIST (v5: add generic, remove keepPreviousData)
  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery<AssessmentsListResponse>({
    queryKey,
    queryFn: () =>
      fetchAssessments({
        page,
        limit,
        q: q || undefined,
        status: status || undefined,
      }),
    retry: 1,
  });

  const total = data?.total ?? 0;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const canPrev = page > 1;
  const canNext = end < total;

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

  // Create modal state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string | "">("");
  const [scheduleAt, setScheduleAt] = useState<string>("");

  const debCand = useDebounced(candidateQuery, 350);
  const debJob = useDebounced(jobQuery, 350);

  // MINI LISTS (v5: add generics, remove keepPreviousData)
  const candList = useQuery<CandidatesListResponse>({
    queryKey: ["cand-mini", { q: debCand }],
    queryFn: () =>
      fetchCandidates({ page: 1, limit: 20, q: debCand || undefined }),
  });

  const jobList = useQuery<JobsListResponse>({
    queryKey: ["job-mini", { q: debJob }],
    queryFn: () => fetchJobs({ page: 1, limit: 20, q: debJob || undefined }),
  });

  // Create Assessment
  const createMut = useMutation({
    mutationFn: () =>
      createAssessment({
        title: title.trim(),
        candidateId: selectedCandidateId,
        jobId: selectedJobId || null,
        status: scheduleAt ? "pending" : "draft",
        scheduledAt: scheduleAt ? Date.parse(scheduleAt) : null,
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setCandidateQuery("");
      setJobQuery("");
      setSelectedCandidateId("");
      setSelectedJobId("");
      setScheduleAt("");
      qc.invalidateQueries({ queryKey: ["assessments"] });
    },
  });

  // Inline row update (status/title/etc.)
  const rowMut = useMutation({
    mutationFn: (payload: { id: string; patch: Partial<Assessment> }) =>
      updateAssessment(payload.id, payload.patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<AssessmentsListResponse>(queryKey);
      if (prev?.data) {
        const next = prev.data.map((a) =>
          a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a
        );
        qc.setQueryData(queryKey, { ...prev, data: next });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  function sendNow(a: Assessment) {
    rowMut.mutate({
      id: a.id,
      patch: { status: "sent", scheduledAt: Date.now() },
    });
  }

  return (
    <section className="rounded-2xl bg-white/60 shadow p-6 dark:bg-white/5 dark:border dark:border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Assessments</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            List with search & status filter. Create and edit assessments; status
            changes are optimistic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Updating…
            </span>
          )}
          <button
            className="rounded-lg px-3 py-2 text-sm border dark:border-gray-700"
            onClick={() => {
              // simple CSV export of current page
              const headers = [
                "id",
                "title",
                "candidateId",
                "jobId",
                "status",
                "scheduledAt",
                "createdAt",
                "updatedAt",
              ];
              const rows = (data?.data ?? []).map((r: Assessment) => ({
                ...r,
                scheduledAt: r.scheduledAt ?? "",
              }));
              const csv = [
                headers.join(","),
                ...rows.map((r) =>
                  headers
                    .map((h) => JSON.stringify((r as any)[h] ?? ""))
                    .join(",")
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `assessments_${Date.now()}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export CSV
          </button>
          <button
            data-hotkey="new"
            className="rounded-lg px-3 py-2 text-sm bg-black text-white dark:bg-white dark:text-black"
            onClick={() => setOpen(true)}
          >
            + New Assessment
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 dark:bg-gray-800 dark:border-gray-700"
          placeholder="Search title or candidate id…"
          value={q}
          onChange={(e) => updateParam("q", e.target.value)}
        />
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 dark:bg-gray-800 dark:border-gray-700"
          value={status}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 dark:bg-gray-800 dark:border-gray-700"
          value={String(limit)}
          onChange={(e) => updateParam("limit", e.target.value)}
        >
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
        </select>
        <div />
      </div>

      {isLoading && (
        <p className="mt-6 text-gray-500 dark:text-gray-400">
          Loading assessments…
        </p>
      )}
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
                className="rounded-lg px-3 py-1 text-sm border border-gray-300 disabled:opacity-50 dark:border-gray-700"
                onClick={() => setPage(page - 1)}
                disabled={!canPrev}
              >
                ← Prev
              </button>
              <button
                className="rounded-lg px-3 py-1 text-sm border border-gray-300 disabled:opacity-50 dark:border-gray-700"
                onClick={() => setPage(page + 1)}
                disabled={!canNext}
              >
                Next →
              </button>
            </div>
          </div>

          <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-800">
            {data.data.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      <Link
                        to={`/assessments/${a.id}`}
                        className="hover:underline"
                      >
                        {a.title}
                      </Link>{" "}
                      <span className="text-gray-500 dark:text-gray-400">
                        · candidate: {a.candidateId}
                      </span>
                      {a.jobId && (
                        <span className="text-gray-500 dark:text-gray-400">
                          {" "}
                          · job: {a.jobId}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      created: {new Date(a.createdAt).toLocaleString()} ·
                      updated: {new Date(a.updatedAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      scheduled:{" "}
                      {a.scheduledAt
                        ? new Date(a.scheduledAt).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-black/40 dark:bg-gray-800 dark:border-gray-700"
                      value={a.status}
                      onChange={(e) =>
                        rowMut.mutate({
                          id: a.id,
                          patch: {
                            status: e.target.value as AssessmentStatus,
                          },
                        })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-lg px-2 py-1 text-xs border border-gray-300 dark:border-gray-700"
                      onClick={() => sendNow(a)}
                      disabled={
                        a.status === "sent" || a.status === "completed"
                      }
                      title="Set status to 'sent' and schedule now"
                    >
                      Send now
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Create Assessment Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white text-gray-900 p-6 shadow space-y-4 dark:bg-gray-900 dark:text-gray-100 dark:border dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create Assessment</h3>
              <button
                className="text-sm text-gray-500 dark:text-gray-400"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <label className="block text-sm font-medium">
              Title
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 dark:bg-gray-800 dark:border-gray-700"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Frontend Skills Test"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">
                  Candidate (search name/email)
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Type to search…"
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                />
                <select
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  size={5}
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                >
                  {(candList.data?.data ?? []).map((c: Candidate) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.email}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Showing {candList.data?.data.length ?? 0} result(s)
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Job (optional, search title)
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Type to search…"
                  value={jobQuery}
                  onChange={(e) => setJobQuery(e.target.value)}
                />
                <select
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  size={5}
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                >
                  <option value="">(No job)</option>
                  {(jobList.data?.data ?? []).map((j: Job) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.status}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Showing {jobList.data?.data.length ?? 0} result(s)
                </div>
              </div>
            </div>

            <label className="block text-sm font-medium">
              Schedule (optional)
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50 dark:bg-gray-800 dark:border-gray-700"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
              <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                If set, initial status will be <b>pending</b>; otherwise it’s{" "}
                <b>draft</b>.
              </div>
            </label>

            {createMut.isError && (
              <div className="text-xs text-red-600">
                {(createMut.error as Error).message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                className="rounded-lg px-3 py-2 text-sm border dark:border-gray-700"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg px-3 py-2 text-sm bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black"
                disabled={
                  !title.trim() || !selectedCandidateId || createMut.isPending
                }
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
