import { NavLink, Outlet } from "react-router-dom";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-xl px-3 py-2 text-sm font-medium",
    isActive
      ? "bg-black text-white"
      : "text-gray-700 hover:bg-gray-100 focus:bg-gray-100",
  ].join(" ");

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-black focus:text-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">TalentFlow</h1>
          <div className="text-xs text-gray-500">React + TS + Tailwind</div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6">
        <aside aria-label="Sidebar" className="md:sticky md:top-[4.25rem] self-start">
          <nav aria-label="Primary" className="space-y-1">
            <NavLink to="/jobs" className={navLinkClass} end>Jobs</NavLink>
            <NavLink to="/candidates" className={navLinkClass}>Candidates</NavLink>
            <NavLink to="/assessments/1" className={navLinkClass}>Assessments</NavLink>
          </nav>
        </aside>

        <main id="main" role="main" className="min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
