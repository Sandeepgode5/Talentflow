export type JobStatus = "open" | "closed" | "archived";
export interface Job {
  id: string;
  title: string;
  slug: string;
  status: JobStatus;
  tags: string[];
  order: number;
  createdAt: number;
  updatedAt: number;
}
export interface JobsListResponse {
  data: Job[];
  total: number;
}


// ---------- Candidates ----------
export type CandidateStage =
  | "applied"
  | "screen"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";

export interface Candidate {
  id: string;
  name: string;
  email: string;
  stage: CandidateStage;
  tags: string[];
  appliedAt: number;  // timestamp
  updatedAt: number;  // timestamp
  order: number;      // stable ordering within a stage
}

export interface CandidateNote {
  id: string;
  candidateId: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface CandidatesListResponse {
  data: Candidate[];
  total: number;
}

// --- Assessments ---
export type AssessmentStatus = "draft" | "pending" | "sent" | "completed" | "expired" | "cancelled";

export interface Assessment {
  id: string;
  title: string;
  candidateId: string;
  jobId: string | null;
  status: AssessmentStatus;
  scheduledAt: number | null; // ms epoch when scheduled/sent, null if draft
  createdAt: number;
  updatedAt: number;
}

export interface AssessmentsListResponse {
  data: Assessment[];
  total: number;
}
