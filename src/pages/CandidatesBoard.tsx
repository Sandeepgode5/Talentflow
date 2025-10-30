// src/pages/CandidatesBoard.tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCandidates,
  moveCandidateStage,
  reorderCandidatesWithinStage,
} from "../api/candidates";
import type { Candidate, CandidatesListResponse } from "../types";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

// IMPORTANT: keep in sync with CandidateStage type (uses "screen", not "screening")
const STAGES = ["applied", "screen", "interview", "offer", "hired", "rejected"] as const;

export default function CandidatesBoard() {
  const qc = useQueryClient();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const queryKey = useMemo(() => ["candidatesBoard"], []);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useQuery<CandidatesListResponse>({
      queryKey,
      queryFn: () => fetchCandidates({ page: 1, limit: 1000 }),
      retry: 1,
    });

  // Build stage groups (always return all keys)
  const groups = useMemo(() => {
    const g: Record<string, Candidate[]> = STAGES.reduce((acc, k) => {
      acc[k] = [];
      return acc;
    }, {} as Record<string, Candidate[]>);

    if (data?.data) {
      for (const c of data.data) {
        const k = (STAGES as readonly string[]).includes(c.stage) ? c.stage : STAGES[0];
        g[k].push(c);
      }
      STAGES.forEach((k) => g[k].sort((a, b) => a.order - b.order));
    }
    return g;
  }, [data]);

  function optimisticallyReorderInStage(
    cache: { data: Candidate[]; total: number },
    stage: string,
    sourceId: string,
    destinationId: string,
    position: "before" | "after"
  ) {
    const all = [...cache.data];
    const stageItems = all
      .filter((c) => c.stage === stage)
      .sort((a, b) => a.order - b.order);

    const from = stageItems.findIndex((c) => c.id === sourceId);
    const to = stageItems.findIndex((c) => c.id === destinationId);
    if (from === -1 || to === -1) return cache;

    const [moved] = stageItems.splice(from, 1);
    let insertIndex =
      position === "after" ? to + (from < to ? 0 : 1) : to + (from < to ? -1 : 0);
    insertIndex = Math.max(0, Math.min(stageItems.length, insertIndex));
    stageItems.splice(insertIndex, 0, moved);

    const orderMap = new Map(stageItems.map((c, i) => [c.id, i]));
    const patched = all.map((c) =>
      c.stage === stage ? { ...c, order: orderMap.get(c.id)! } : c
    );

    return { ...cache, data: patched };
  }

  const moveMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      moveCandidateStage(id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<{ data: Candidate[]; total: number }>(queryKey);
      if (prev?.data) {
        const nextData = prev.data.map((c) =>
          c.id === id ? { ...c, stage, order: 999999 } : c
        );
        qc.setQueryData(queryKey, { ...prev, data: nextData });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      setErrMsg((err as Error).message || "Move failed");
      setTimeout(() => setErrMsg(null), 3000);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const reorderMut = useMutation({
    mutationFn: reorderCandidatesWithinStage,
    // NOTE: destinationId can be undefined at type level; guard it.
    onMutate: async (vars: {
      sourceId: string;
      destinationId?: string;
      position: "before" | "after";
    }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<{ data: Candidate[]; total: number }>(queryKey);
      if (!prev?.data) return { prev };

      if (!vars.destinationId) {
        // Nothing to reorder against; just bail out without touching cache
        return { prev };
      }

      const src = prev.data.find((c) => c.id === vars.sourceId);
      if (!src) return { prev };

      const next = optimisticallyReorderInStage(
        prev,
        src.stage,
        vars.sourceId,
        vars.destinationId, // safe due to guard above
        vars.position
      );
      qc.setQueryData(queryKey, next);
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      setErrMsg((err as Error).message || "Reorder failed");
      setTimeout(() => setErrMsg(null), 3000);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;

    const fromStage = source.droppableId;
    const toStage = destination.droppableId;

    const idsByStage: Record<string, string[]> = STAGES.reduce((acc, s) => {
      acc[s] = (groups[s] ?? []).map((c) => c.id);
      return acc;
    }, {} as Record<string, string[]>);

    // Same-column reorder
    if (fromStage === toStage) {
      if (source.index === destination.index) return;

      const list = idsByStage[fromStage];
      const clampedDestIndex = Math.max(
        0,
        Math.min(destination.index, Math.max(0, list.length - 1))
      );

      const destId = list[clampedDestIndex];
      if (!destId) return; // GUARD: destinationId may be undefined

      const position = destination.index < source.index ? "before" : "after";

      reorderMut.mutate({
        sourceId: draggableId,
        destinationId: destId,
        position,
      });
      return;
    }

    // Cross-column move + then reorder into target
    const targetList = idsByStage[toStage];

    // If target column is empty, just move
    if (targetList.length === 0) {
      moveMut.mutate({ id: draggableId, stage: toStage });
      return;
    }

    let position: "before" | "after" = "before";
    let targetIndex = destination.index;

    if (destination.index >= targetList.length) {
      targetIndex = targetList.length - 1;
      position = "after";
    } else if (destination.index <= 0) {
      targetIndex = 0;
      position = "before";
    }

    const destinationId = targetList[Math.max(0, Math.min(targetIndex, targetList.length - 1))];
    if (!destinationId) return; // GUARD

    moveMut.mutate({ id: draggableId, stage: toStage });
    reorderMut.mutate({ sourceId: draggableId, destinationId, position });
  }

  return (
    <section className="rounded-2xl bg-white/60 shadow p-6 dark:bg-white/5 dark:border dark:border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Candidates · Board</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Drag cards between stages, or reorder within a stage.
          </p>
          {errMsg && <div className="mt-2 text-xs text-red-600">{errMsg}</div>}
        </div>
        <div className="flex items-center gap-3">
          {isFetching && <span className="text-xs text-gray-500 dark:text-gray-400">Updating…</span>}
          <Link
            to="/candidates"
            className="rounded-lg px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/10"
          >
            ← Back to list
          </Link>
        </div>
      </div>

      {isLoading && <p className="mt-6 text-gray-500 dark:text-gray-400">Loading board…</p>}
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
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {STAGES.map((stageKey) => (
              <Droppable droppableId={stageKey} key={stageKey}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={
                      "rounded-xl border bg-gray-50 dark:bg-gray-900 dark:border-gray-700 " +
                      (snapshot.isDraggingOver ? "ring-2 ring-black/40 dark:ring-white/30" : "")
                    }
                  >
                    <div className="px-3 py-2 border-b bg-white rounded-t-xl flex items-center justify-between dark:bg-gray-900 dark:border-gray-700">
                      <div className="text-sm font-semibold">
                        {stageKey[0].toUpperCase() + stageKey.slice(1)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {groups[stageKey]?.length ?? 0}
                      </div>
                    </div>

                    <ul className="p-3 min-h-[120px]">
                      {(groups[stageKey] ?? []).map((c, index) => (
                        <Draggable key={c.id} draggableId={c.id} index={index}>
                          {(p, snap) => (
                            <li
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              className={
                                "mb-3 last:mb-0 rounded-lg bg-white shadow-sm border px-3 py-2 transition dark:bg-gray-800 dark:border-gray-700 " +
                                (snap.isDragging ? "shadow-md ring-1 ring-black/10 dark:ring-white/10" : "")
                              }
                            >
                              <div className="font-medium text-sm truncate">
                                <Link to={`/candidates/${c.id}`} className="hover:underline">
                                  {c.name}
                                </Link>
                              </div>
                              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 truncate">
                                {c.email}
                              </div>
                              <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                tags: {(c.tags || []).join(", ") || "—"}
                              </div>
                            </li>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </ul>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}
    </section>
  );
}
