export type NavCounts = { jobs: number; candidates: number; assessments: number };

export async function fetchNavCounts(): Promise<NavCounts> {
  const res = await fetch("/api/_counts");
  if (!res.ok) throw new Error(`Failed to fetch counts: ${res.status}`);
  return res.json();
}
