// src/pages/JobDetail.tsx
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJob, patchJob } from "../api/jobs";
import { fetchAssessmentsForJob } from "../api/assessments";
import type { Job, Assessment } from "../types";

const STATUSES: Job["status"][] = ["open", "closed", "archived"];

export default function JobDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ------- Queries -------
  const jobKey = useMemo(() => ["job", id], [id]);
  const {
    data: job,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: jobKey,
    queryFn: () => getJob(id),
    enabled: !!id,
    retry: 1,
  });

  const assessKey = useMemo(() => ["assessmentsForJob", id], [id]);
  const assess = useQuery({
    queryKey: assessKey,
    queryFn: () => fetchAssessmentsForJob(id, 12),
    enabled: !!id,
    staleTime: 10_000,
  });

  // ------- Local form state -------
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Job["status"]>("open");
  const [tagsInput, setTagsInput] = useState("");

  // initialize from server once
  const needsInit = !!job && title === "" && tagsInput === "";
  if (needsInit) {
    setTitle(job.title);
    setStatus(job.status);
    setTagsInput((job.tags || []).join(", "));
  }

  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ------- Save (optimistic) -------
  const saveMut = useMutation({
    mutationFn: (patch: Partial<Job>) => patchJob(id, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: jobKey });
      const prev = qc.getQueryData<Job>(jobKey);
      if (prev) {
        const merged: Job = { ...prev, ...patch, updatedAt: Date.now() } as Job;
        qc.setQueryData(jobKey, merged);
      }
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(jobKey, ctx.prev);
      setErrMsg((e as Error).message || "Save failed");
      setTimeout(() => setErrMsg(null), 3000);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  function onSave() {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    saveMut.mutate({ title: title.trim(), status, tags });
  }

  return (
    <section className="panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Job</h2>
          {job && (
            <div className="muted mt-1">
              slug: <span className="font-mono">{job.slug}</span> · created:{" "}
              {new Date(job.createdAt).toLocaleString()} · updated:{" "}
              {new Date(job.updatedAt).toLocaleString()}
            </div>
          )}
          {isFetching && <div className="muted mt-1">Updating…</div>}
          {errMsg && <div className="mt-1 text-xs text-red-500">{errMsg}</div>}
        </div>

        <div className="flex gap-2">
          <Link
            to={`/assessments?new=1&jobId=${id}`}
            className="btn-primary disabled:opacity-50"
            title="Create a new assessment for this job"
          >
            + New Assessment
          </Link>
          <button onClick={() => navigate(-1)} className="btn">
            Back
          </button>
        </div>
      </div>

      {isLoading && <p className="muted mt-6">Loading…</p>}
      {isError && (
        <div className="mt-6">
          <p className="text-red-500">Error: {(error as Error).message}</p>
          <button className="btn-primary mt-2" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {job && (
        <div className="mt-6 grid gap-4 max-w-3xl">
          {/* Title */}
          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input mt-1 w-full"
              placeholder="e.g., Frontend Engineer"
            />
          </div>

          {/* Status + Tags */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Job["status"])}
                className="select mt-1 w-full"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Tags (comma separated)</label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="input mt-1 w-full"
                placeholder="remote, senior, react"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="btn"
              onClick={() => {
                setTitle(job.title);
                setStatus(job.status);
                setTagsInput((job.tags || []).join(", "));
              }}
            >
              Reset
            </button>
            <button
              className="btn-primary disabled:opacity-50"
              disabled={!title.trim() || saveMut.isPending}
              onClick={onSave}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Recent assessments for this job */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recent assessments</h3>
              <Link
                to={`/assessments?jobId=${id}`}
                className="text-sm underline text-gray-700 dark:text-gray-200"
                title="Open assessments filtered by this job"
              >
                View all →
              </Link>
            </div>

            {assess.isLoading && <p className="muted mt-2">Loading…</p>}
            {assess.isError && (
              <p className="mt-2 text-red-500">Failed to load assessments.</p>
            )}

            {assess.data && assess.data.data.length === 0 && (
              <p className="muted mt-2">No assessments yet.</p>
            )}

            {assess.data && assess.data.data.length > 0 && (
              <ul className="mt-3 divide-y">
                {assess.data.data.map((a: Assessment) => (
                  <li key={a.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          <Link
                            to={`/assessments/${a.id}`}
                            className="hover:underline"
                          >
                            {a.title}
                          </Link>
                          <span className="chip ml-2">{a.status}</span>
                        </div>
                        <div className="muted">
                          candidate:{" "}
                          <Link
                            to={`/candidates/${a.candidateId}`}
                            className="underline"
                          >
                            {a.candidateId}
                          </Link>{" "}
                          · scheduled:{" "}
                          {a.scheduledAt
                            ? new Date(a.scheduledAt).toLocaleString()
                            : "—"}
                        </div>
                      </div>
                      <Link to={`/assessments/${a.id}`} className="btn">
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
