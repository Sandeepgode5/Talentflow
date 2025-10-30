// src/App.tsx
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import useHotkeys from "./hooks/useHotkeys";

// pages
import Jobs from "./pages/Jobs";
import Candidates from "./pages/Candidates";
import CandidateDetail from "./pages/CandidateDetail";
import JobDetail from "./pages/JobDetail";
import Assessments from "./pages/Assessments";
import CandidatesBoard from "./pages/CandidatesBoard";
import AssessmentDetail from "./pages/AssessmentDetail";

// UI
import ThemeToggle from "./components/ui/ThemeToggle";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] leading-none
                 bg-white/70 border-gray-300 text-gray-700
                 dark:bg-white/10 dark:text-gray-200 dark:border-gray-700"
    >
      {children}
    </span>
  );
}

const fmt = (n?: number) => (typeof n === "number" ? n : "…");

export default function App() {
  useHotkeys();

  // Small, cheap queries to power the header counters (auto-refresh for liveliness)
  const jobsOpen = useQuery({
    queryKey: ["nav-jobs-open"],
    queryFn: async () => {
      const u = new URL("/api/jobs", window.location.origin);
      u.searchParams.set("status", "open");
      u.searchParams.set("limit", "1");
      const res = await fetch(u);
      const json = await res.json();
      return json.total as number;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  const candTotal = useQuery({
    queryKey: ["nav-candidates-total"],
    queryFn: async () => {
      const u = new URL("/api/candidates", window.location.origin);
      u.searchParams.set("limit", "1");
      const res = await fetch(u);
      const json = await res.json();
      return json.total as number;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  const assessPending = useQuery({
    queryKey: ["nav-assess-pending"],
    queryFn: async () => {
      const u = new URL("/api/assessments", window.location.origin);
      u.searchParams.set("status", "pending");
      u.searchParams.set("limit", "1");
      const res = await fetch(u);
      const json = await res.json();
      return json.total as number;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  return (
    // Use the new gradient/background wrapper
    <div className="app-bg text-gray-900 dark:text-gray-100">
      {/* Top Nav */}
      <header className="border-b bg-white/80 backdrop-blur dark:bg-gray-900/70 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
          <div className="text-lg font-semibold tracking-tight">TalentFlow</div>

          <nav className="flex items-center gap-2 sm:gap-4 text-sm" aria-label="Primary">
            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                "py-2 px-2 rounded transition " +
                (isActive
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10")
              }
            >
              Jobs
              <Badge>{fmt(jobsOpen.data)}</Badge>
            </NavLink>

            <NavLink
              to="/candidates"
              className={({ isActive }) =>
                "py-2 px-2 rounded transition " +
                (isActive
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10")
              }
            >
              Candidates
              <Badge>{fmt(candTotal.data)}</Badge>
            </NavLink>

            <NavLink
              to="/candidates/board"
              className={({ isActive }) =>
                "py-2 px-2 rounded transition " +
                (isActive
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10")
              }
            >
              Board
            </NavLink>

            <NavLink
              to="/assessments"
              className={({ isActive }) =>
                "py-2 px-2 rounded transition " +
                (isActive
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10")
              }
            >
              Assessments
              <Badge>{fmt(assessPending.data)}</Badge>
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">
              React · TS · Tailwind
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Pages */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />

          {/* Jobs */}
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />

          {/* Candidates */}
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/candidates/:id" element={<CandidateDetail />} />
          <Route path="/candidates/board" element={<CandidatesBoard />} />

          {/* Assessments */}
          <Route path="/assessments" element={<Assessments />} />
          <Route path="/assessments/:id" element={<AssessmentDetail />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </main>
    </div>
  );
}
