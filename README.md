# TalentFlow — Recruiting Ops Dashboard (React + TS + Vite)

A crisp, production-style recruiting dashboard to manage **Jobs**, **Candidates**, and **Assessments** with:
- **Dark/Light mode** (persistent, instant toggle)
- **Kanban board** for candidates with drag & drop
- **Optimistic updates** + caching via TanStack Query
- **CSV export** for jobs & candidates
- **Keyboard shortcuts** for speed
- **Mock API** backed by **MSW** (no backend required)

> Live Demo: _add link after deploy_  
> Repo: https://github.com/Sandeepgode5/Talentflow

---

## ✨ Highlights (What a reviewer will notice)

- **Modern UX**: soft glassy panels, subtle shadows, accessible colors in both themes.
- **Real-app flows**: list → detail → related items (e.g., Job → recent Assessments).
- **Performance**: optimistic updates, query invalidations, virtualizable lists, draggable reordering.
- **Robustness**: error boundaries, toasts, skeletons, retry buttons.
- **Zero-setup backend**: MSW intercepts `/api/*` with in-memory data + seeds.

---

## Features

- **Jobs**
  - Search, status/tag filters, pagination
  - Drag-and-drop reordering (hello-pangea/dnd)
  - **Export CSV** of the current results
  - Detail page with edit + recent assessments

- **Candidates**
  - Large list with search + stage filter
  - Inline stage change (optimistic)
  - Kanban/Board view: cross-stage move & reorder
  - Detail page with editable profile, notes, and **Send Assessment**

- **Assessments**
  - List & Detail (title, status, schedule)
  - Create from Candidate or Job
  - Clickable titles / deep linking

- **Global**
  - **Dark/Light theme** with persistent preference  
  - **Header counters** that auto-refresh (open jobs, total candidates, pending assessments)
  - **Keyboard Shortcuts**: `?` help, `n` new, `e` export  
  - **ErrorBoundary** + page skeletons + consistent toasts

---



