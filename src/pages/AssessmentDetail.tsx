// src/pages/AssessmentDetail.tsx
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAssessment,
  updateAssessment,
  deleteAssessment,
} from "../api/assessments";
import type { Assessment, AssessmentStatus } from "../types";
import { useToast } from "../components/ui/Toast";
import { ListSkeleton } from "../components/ui/Skeleton";

const STATUSES: AssessmentStatus[] = [
  "draft",
  "pending",
  "sent",
  "completed",
  "expired",
  "cancelled",
];

// Helpers to handle <input type="datetime-local">
function toLocalInputValue(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromLocalInputValue(v: string): number | null {
  if (!v) return null;
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : null;
}

export default function AssessmentDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { push } = useToast();

  const queryKey = useMemo(() => ["assessment", id], [id]);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => getAssessment(id),
    enabled: !!id,
    retry: 1,
  });

  // local form state
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<AssessmentStatus>("draft");
  const [scheduledAt, setScheduledAt] = useState<string>(""); // datetime-local string
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // initialize from data
  const needsInit = !!data && title === "" && scheduledAt === "";
  if (needsInit) {
    setTitle(data!.title);
    setStatus(data!.status);
    setScheduledAt(toLocalInputValue(data!.scheduledAt));
  }

  // Save/patch mutation (optimistic)
  const saveMut = useMutation({
    mutationFn: (patch: Partial<Assessment>) => updateAssessment(id, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Assessment>(queryKey);
      if (prev) {
        qc.setQueryData(queryKey, { ...prev, ...patch, updatedAt: Date.now() } as Assessment);
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      const msg = (err as Error).message || "Save failed";
      setErrMsg(msg);
      push({ text: msg, tone: "error" });
      setTimeout(() => setErrMsg(null), 3000);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      push({ text: "Assessment saved ✓", tone: "success" });
    },
  });

  // delete
  const delMut = useMutation({
    mutationFn: () => deleteAssessment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["navCounts"] });
      push({ text: "Assessment deleted ✓", tone: "success" });
      navigate("/assessments");
    },
    onError: (err) => {
      const msg = (err as Error).message || "Delete failed";
      setErrMsg(msg);
      push({ text: msg, tone: "error" });
      setTimeout(() => setErrMsg(null), 3000);
    },
  });

  function onSave() {
    const patch: Partial<Assessment> = {
      title: title.trim(),
      status,
      scheduledAt: fromLocalInputValue(scheduledAt),
    };
    saveMut.mutate(patch);
  }

  function sendNow() {
    saveMut.mutate({ status: "sent", scheduledAt: Date.now() });
  }

  return (
    <section className="rounded-2xl bg-white shadow p-6 text-slate-900
                    dark:bg-slate-800 dark:text-slate-100 dark:shadow-none dark:border dark:border-slate-700">

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Assessment</h2>
          {isFetching && <div className="text-xs text-gray-500 mt-1">Updating…</div>}
          {errMsg && <div className="text-xs text-red-600 mt-1">{errMsg}</div>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg px-3 py-2 text-sm border border-gray-300"
          >
            Back
          </button>
        </div>
      </div>

      {isLoading && <ListSkeleton rows={4} />}

      {isError && (
        <div className="mt-6">
          <p className="text-red-600">Error: {(error as Error).message}</p>
          <button className="mt-2 rounded-lg px-3 py-1 text-sm bg-black text-white" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && !isLoading && (
        <div className="mt-6 grid gap-4 max-w-3xl">
          <div className="text-sm text-gray-600">
            <span className="mr-2">
              candidate:{" "}
              <Link className="underline" to={`/candidates/${data.candidateId}`}>
                {data.candidateId}
              </Link>
            </span>
            {data.jobId && (
              <span>
                job:{" "}
                <Link className="underline" to={`/jobs/${data.jobId}`}>
                  {data.jobId}
                </Link>
              </span>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/50"
              placeholder="Title"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AssessmentStatus)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Schedule</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="mt-1 text-[11px] text-gray-500">
                Leave empty for no schedule.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onSave}
              disabled={saveMut.isPending || !title.trim()}
              className="rounded-lg px-3 py-2 text-sm bg-black text-white disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={sendNow}
              className="rounded-lg px-3 py-2 text-sm border"
              title="Set status to 'sent' and schedule now"
            >
              Send now
            </button>
            <div className="flex-1" />
            <button
              onClick={() => {
                if (confirm("Delete this assessment?")) delMut.mutate();
              }}
              className="rounded-lg px-3 py-2 text-sm border border-red-300 text-red-700"
            >
              {delMut.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>

          <div className="text-xs text-gray-500">
            created: {new Date(data.createdAt).toLocaleString()} · updated:{" "}
            {new Date(data.updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </section>
  );
}
