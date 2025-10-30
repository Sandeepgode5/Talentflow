// src/pages/Jobs.tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { createJob, fetchJobs, setArchive, reorderJob } from "../api/jobs";
import { useToast } from "../components/ui/Toast";
import { ListSkeleton } from "../components/ui/Skeleton";
import { toCSV, downloadText, stamp } from "../lib/download";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

function toInt(v: string | null, fallback: number) {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : fallback;
}
function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

export default function Jobs() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const { push } = useToast();

  // URL state
  const page = toInt(sp.get("page"), 1);
  const limit = toInt(sp.get("limit"), 5);
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const tag = sp.get("tag") ?? "";

  // Restore + persist filters
  useEffect(() => {
    const hasAny = q || status || tag || sp.get("page") || sp.get("limit");
    if (!hasAny) {
      const saved = localStorage.getItem("filters:jobs");
      if (saved) setSp(new URLSearchParams(saved), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(sp);
    localStorage.setItem("filters:jobs", p.toString());
  }, [q, status, tag, limit, sp]);

  const queryKey = useMemo(
    () => ["jobs", { page, limit, q, status, tag }],
    [page, limit, q, status, tag]
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      fetchJobs({
        page,
        limit,
        q: q || undefined,
        status: status || undefined,
        tag: tag || undefined,
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

  // Create modal state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const computedSlug = slugify(title);

  const createMut = useMutation({
    mutationFn: () => createJob({ title }),
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      push({ text: "Job created ✓", tone: "success" });
    },
    onError: (e) => push({ text: (e as Error).message || "Create failed", tone: "error" }),
  });

  // Archive / Unarchive (optimistic)
  const archiveMut = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setArchive(id, archived),
    onMutate: async ({ id, archived }) => {
      await qc.cancelQueries({ queryKey: ["jobs"] });
      const prev = qc.getQueriesData({ queryKey: ["jobs"] });

      prev.forEach(([key, value]) => {
        if (!value || typeof value !== "object") return;
        const v = value as { data?: any[]; total?: number };
        if (!v.data) return;
        v.data = v.data.map((j: any) =>
          j.id === id ? { ...j, status: archived ? "archived" : "open" } : j
        );
        qc.setQueryData(key as any, { ...v });
      });

      return { prev };
    },
    onError: (e, _v, ctx) => {
      ctx?.prev?.forEach(([key, value]: any) => qc.setQueryData(key, value));
      push({ text: (e as Error).message || "Update failed", tone: "error" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      push({ text: "Status updated ✓", tone: "success" });
    },
  });

  // Reorder (DnD) with optimistic update + rollback
  const [reorderError, setReorderError] = useState<string | null>(null);
  const reorderMut = useMutation({
    mutationFn: reorderJob,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);

      if (prev?.data) {
        const items = [...prev.data];
        const from = items.findIndex((j) => j.id === vars.sourceId);
        const to = items.findIndex((j) => j.id === vars.destinationId);
        if (from !== -1 && to !== -1) {
          const [moved] = items.splice(from, 1);
          const insertIndex = vars.position === "after" ? to + (from < to ? 0 : 1) : to + (from < to ? -1 : 0);
          items.splice(Math.max(0, insertIndex), 0, moved);
          qc.setQueryData(queryKey, { ...prev, data: items });
        }
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      setReorderError((err as Error).message || "Reorder failed");
      push({ text: "Reorder failed", tone: "error" });
      setTimeout(() => setReorderError(null), 3000);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      push({ text: "Order updated ✓", tone: "success" });
    },
  });

  function onDragEnd(result: DropResult) {
    const dest = result.destination;
    if (!dest) return;
    if (!data?.data) return;

    const sourceIndex = result.source.index;
    const destIndex = dest.index;
    if (sourceIndex === destIndex) return;

    const source = data.data[sourceIndex];
    const target = data.data[destIndex];
    const position = destIndex < sourceIndex ? "before" : "after";

    reorderMut.mutate({
      sourceId: source.id,
      destinationId: target.id,
      position,
    });
  }

  // Export CSV (current page with active filters)
  function onExport() {
    if (!data?.data) return;
    const headers = ["id", "title", "slug", "status", "tags", "order", "createdAt", "updatedAt"];
    const rows = data.data.map((j: any) => ({
      ...j,
      tags: (j.tags || []).join("|"),
    }));
    const csv = toCSV(rows, headers);
    downloadText(stamp("jobs"), csv);
  }

  const total = data?.total ?? 0;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const canPrev = page > 1;
  const canNext = end < total;

  return (
    <section className="panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Jobs</h2>
          <p className="mt-2 muted">
            Drag rows to reorder (optimistic with rollback). Create, edit, and archive are supported.
          </p>
          {reorderError && <div className="mt-2 text-xs text-red-500">{reorderError}</div>}
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <span className="muted">Updating…</span>}
          <button 
            data-hotkey="export"
            className="btn" onClick={onExport} title="Export current results to CSV">
            Export CSV
          </button>
          <button 
            data-hotkey="new" 
            className="btn-primary" onClick={() => setOpen(true)}>
            + New Job
          </button>
          

        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input
          className="input"
          placeholder="Search title or slug…"
          value={q}
          onChange={(e) => updateParam("q", e.target.value)}
          aria-label="Search jobs"
        />
        <select
          className="select"
          value={status}
          onChange={(e) => updateParam("status", e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </select>
        <input
          className="input"
          placeholder="Filter by tag (e.g., remote)…"
          value={tag}
          onChange={(e) => updateParam("tag", e.target.value)}
          aria-label="Filter by tag"
        />
        <select
          className="select"
          value={String(limit)}
          onChange={(e) => updateParam("limit", e.target.value)}
          aria-label="Items per page"
        >
          <option value="5">5 / page</option>
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
        </select>
      </div>

      {/* List */}
      {isLoading && <ListSkeleton rows={8} />}
      {isError && (
        <div className="mt-6">
          <p className="text-red-500">Error: {(error as Error).message}</p>
          <button onClick={() => refetch()} className="mt-2 btn-primary">
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="muted">
              Showing <span className="font-medium text-gray-700 dark:text-gray-200">{start}</span>–
              <span className="font-medium text-gray-700 dark:text-gray-200">{end}</span> of{" "}
              <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span>
            </p>
            <div className="flex items-center gap-2">
              <button className="btn disabled:opacity-50" onClick={() => setPage(page - 1)} disabled={!canPrev}>
                ← Prev
              </button>
              <button className="btn disabled:opacity-50" onClick={() => setPage(page + 1)} disabled={!canNext}>
                Next →
              </button>
            </div>
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="jobs">
              {(provided) => (
                <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-800" ref={provided.innerRef} {...provided.droppableProps}>
                  {data.data.map((job, index) => (
                    <Draggable key={job.id} draggableId={job.id} index={index}>
                      {(p, snapshot) => (
                        <li
                          ref={p.innerRef}
                          {...p.draggableProps}
                          {...p.dragHandleProps}
                          className={
                            "py-3 transition " +
                            (snapshot.isDragging ? "bg-gray-50 dark:bg-gray-900 rounded-lg px-3 -mx-3 shadow" : "")
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                <Link to={`/jobs/${job.id}`} className="hover:underline">
                                  {job.title}
                                </Link>
                              </div>
                              <div className="muted">
                                slug: {job.slug} • status: {job.status} • tags: {job.tags.join(", ")}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="chip">order {job.order}</span>
                              <button
                                className="btn text-xs"
                                onClick={() => archiveMut.mutate({ id: job.id, archived: job.status !== "archived" })}
                              >
                                {job.status === "archived" ? "Unarchive" : "Archive"}
                              </button>
                            </div>
                          </div>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        </>
      )}

      {/* Create Job Modal */}
      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md panel">
            <h3 className="text-lg font-semibold">Create Job</h3>
            <p className="mt-1 muted">Title is required. Slug must be unique.</p>

            <label className="mt-4 block text-sm font-medium">
              Title
              <input
                autoFocus
                className="mt-1 w-full input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Frontend Engineer"
              />
            </label>
            <div className="mt-2 muted">Slug preview: {computedSlug || "—"}</div>

            {createMut.isError && (
              <div className="mt-3 text-xs text-red-500">{(createMut.error as Error).message}</div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button className="btn" onClick={() => { setOpen(false); setTitle(""); }}>
                Cancel
              </button>
              <button
                className="btn-primary disabled:opacity-50"
                disabled={!title.trim() || createMut.isPending}
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
