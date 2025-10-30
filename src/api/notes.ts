// src/api/notes.ts
import type { CandidateNote } from "../types";

export async function fetchNotes(candidateId: string): Promise<CandidateNote[]> {
  const res = await fetch(`/api/candidates/${candidateId}/notes`);
  if (!res.ok) throw new Error(`Failed to load notes (${res.status})`);
  return res.json();
}

export async function createNote(candidateId: string, body: string): Promise<CandidateNote> {
  const res = await fetch(`/api/candidates/${candidateId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Create failed (${res.status})`);
  }
  return res.json();
}

export async function deleteNote(noteId: string): Promise<void> {
  const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Delete failed (${res.status})`);
  }
}
