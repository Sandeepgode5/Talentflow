// src/pages/CandidateDetail.tsx
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCandidate, patchCandidate } from "../api/candidates";
import type { Candidate } from "../types";

const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;

export default function CandidateDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const queryKey = useMemo(() => ["candidate", id], [id]);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => getCandidate(id),
    enabled: !!id,
    retry: 1,
  });

  // local form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [stage, setStage] = useState<Candidate["stage"]>("applied");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // populate form when data loads
  const init = !!data && name === "" && tagsInput === "";
  if (init) {
    setName(data.name);
    setEmail(data.email);
    setStage(data.stage);
    setTagsInput((data.tags || []).join(", "));
  }

  const saveMut = useMutation({
    mutationFn: (patch: Partial<Candidate>) => patchCandidate(id, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Candidate>(queryKey);
      if (prev) {
        qc.setQueryData(queryKey, { ...prev, ...patch, updatedAt: Date.now() } as Candidate);
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      setErrMsg((err as Error).message || "Save failed");
      setTimeout(() => setErrMsg(null), 3000);
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["candidatesBoard"] });
      qc.setQueryData(queryKey, updated);
    },
  });

  function onSave() {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    saveMut.mutate({ name: name.trim(), tags, stage });
  }

  return (
    <section className="panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Candidate</h2>
          {isFetching && <div className="muted mt-1">Updating…</div>}
          {errMsg && <div className="text-xs text-red-500 mt-1">{errMsg}</div>}
        </div>
        <div className="flex gap-2">
          <Link to="/candidates/board" className="btn">
            Open Board →
          </Link>
          <Link
            to={`/assessments?new=1&candidateId=${id}`}
            className="btn"
            title="Create a new assessment for this candidate"
          >
            + New Assessment
          </Link>
          <button onClick={() => navigate(-1)} className="btn">
            Back
          </button>
        </div>
      </div>

      {isLoading && <p className="mt-6 muted">Loading…</p>}
      {isError && (
        <div className="mt-6">
          <p className="text-red-500">Error: {(error as Error).message}</p>
          <button className="mt-2 btn-primary" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="mt-6 grid gap-4 max-w-3xl">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full input"
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <input value={email} disabled className="mt-1 w-full input opacity-70" />
          </div>

          <div>
            <label className="text-sm font-medium">Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as Candidate["stage"])}
              className="mt-1 w-full select"
            >
              {STAGES.map((s) => (
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
              className="mt-1 w-full input"
              placeholder="remote, senior, contract"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setName(data.name);
                setStage(data.stage);
                setTagsInput((data.tags || []).join(", "));
              }}
              className="btn"
            >
              Reset
            </button>
            <button
              onClick={onSave}
              disabled={saveMut.isPending || !name.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
