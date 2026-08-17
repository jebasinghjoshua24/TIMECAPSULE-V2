   # TimeCapsule v2 — Project Context & Teaching Protocol

   ## What this is

   Complete remake of the Time Capsule web app. v1 lives in `../TimeCapsule Folder`
   (vanilla HTML/CSS/JS frontend + Express/SQLite backend — v1 frontend was
   AI-written, backend was written by hand by Jebasingh).

   This v2 is being rebuilt **entirely by Jebasingh's own hands** to: (1) own the
   frontend code, (2) learn React, Next.js, TypeScript, Tailwind CSS, and
   PostgreSQL through project-based learning, (3) become a portfolio piece
   targeting high-paying freelance work.

   v1 code is **reference-only** — never copy it. Read it for behavior/spec, then
   rebuild. The Express API copy in `server/` is the temporary dev API until
   Phase 11 replaces it.

   ## THE TEACHING PROTOCOL — highest priority, applies to every session

   Jebasingh's learning style is documented in `Documentation.txt` (Section 2:
   Fragment Method, Learn-By-Death). The AI must follow these rules:

   1. **NEVER write feature code.** Zero implementation. Only tiny illustrative
      snippets (5–10 lines max) inside lesson explanations.
   2. **The loop, every module:**
      - Teach one concept fragment (keyword + syntax + tiny input→output example)
      - Map it to code Jebasingh already knows (vanilla JS, Express, SQL, v1 files)
      - Give a SPEC with acceptance criteria and exact API endpoints — no code
      - Jebasingh builds it and debugs own errors first
      - AI reviews line-by-line with real file paths + line numbers, explains
      tradeoffs, points to v1 equivalents
      - Jebasingh refactors; milestone merges via git workflow below
   3. **Error coaching:** before answering an error, ask "what does the error
      say?" — let Jebasingh read it aloud first. Explain errors in the v1 journal
      style: Error → Consequence if left → Fix.
   4. **One fragment at a time.** Never dump multiple concepts in one lesson.
   5. **Praise specifics, not fluff.** Reviews cite real lines.

   ## Stack & Architecture

   - Next.js (App Router) + TypeScript + Tailwind CSS — frontend AND backend
   - PostgreSQL (local install) — Phase 11; SQLite in `server/` is temporary
   - TypeScript is the language of the whole app (browser + server)
   - Ports: Next.js dev server on **3000**, Express dev API on **3001**
   (v1 server.js line 13 hardcodes PORT 3000 — must change to 3001)
   - CORS allowlist in `server/server.js` already includes `http://localhost:3000`
   - Phase 11: Next.js route handlers absorb the API, `server/` is deleted,
   CORS disappears (same-origin), PostgreSQL replaces SQLite

   ## Roadmap & Progress

   | Phase | Branch | Content | Status |
   |---|---|---|---|
   | 0 | — | Fresh repo: folder, copies, git init, .gitignore, README, AGENTS.md, first commit, GitHub repo `TIME-CAPSULE-V2`, push | In progress — copies + git init done; .gitignore, README, AGENTS.md, commit, push pending |
   | 1 | — | Git workflow lesson: branch → build → commit → test → merge → push | Not started |
   | 2 | `feature/setup` | create-next-app in `web/` (TS + Tailwind flags), Express on 3001, browser→API confirmed | Not started |
   | 3 | `feature/landing` | JSX, server vs client components, props + types, .map(), Tailwind, next/font, dark mode. Landing page matching v1 `index.html`; v1 `css/variables.css` tokens → Tailwind `@theme`; first useState | Not started |
   | 4 | `feature/auth` | 'use client', controlled forms, typed fetch. Sign-up/login vs live API | Not started |
   | 5 | `feature/routing` | App Router: layout.tsx, Link, redirect(), guards, RequireAuth, 404 | Not started |
   | 6 | `feature/dashboard` | useEffect, loading states, timers, custom hooks. Stats, capsule CRUD, countdowns, meme modal | Not started |
   | 7 | `feature/context` | Context API, toasts. AuthContext, ThemeContext, notifications, self-destruct | Not started |
   | 8 | `feature/friends` | Debounced search, filtering. Userbase, friends, collaborative capsules | Not started |
   | 9 | `feature/admin` | Role guards, tabs, tables, decomposition. Full admin panel (v1 admin.js = 1147 lines of spec) | Not started |
   | 10 | `feature/polish` | Parity checklist vs v1, dead-code removal. **Delete old frontend files** (js/, css/, *.html — v1 only, never the Express copy yet) | Not started |
   | 11 | `feature/backend` | PostgreSQL local install; migrate schema (users, capsules, friends, notifications, bans, activity_log, deleted_users, deleted_capsules); Next.js route handlers; delete `server/`; typed responses, middleware, API tests | Not started |
   | 12 | — | README + architecture diagram, Vercel deploy (Neon free DB for prod only), archive v1 repo, final history review | Not started |

   Update the Status column as phases complete.

   ## Git Workflow

   - One branch per phase: `feature/<name>`, branch off clean `main`
   - Small, meaningful commits (freelance-proof history — every commit = real work by Jebasingh)
   - Test before merge (both servers running, side-by-side with v1 behavior)
   - Merge to `main`, push to origin
   - Never force-push, never amend pushed commits, never commit node_modules/.env/DB files

   ## Reference Map

   - v1 code: `../TimeCapsule Folder` — read-only spec for behavior (js/, css/, *.html)
   - v1 API routes: `server/server.js` — the exact endpoints the frontend consumes
   - v1 frontend API helper: `../TimeCapsule Folder/js/api.js` — pattern for typed fetch
   - Learning journal: `Documentation.txt` — extend with v2 sections as we go
   - Design tokens: `../TimeCapsule Folder/css/variables.css` — port to Tailwind @theme

   ## Known v1 Pain Points (reasons this remake exists)

   - Frontend was AI-written; Jebasingh doesn't own it
   - All JS in one global scope (12 files, ~7000 lines, no modules)
   - 40+ CSS files with no structure
   - Old repo root at `WebDev/` mixed with unrelated projects; node_modules not ignored
   - Vanilla site currently broken (`../css/` paths broken after file move)
   - Backend is a single 639-line `server.js`

   ## Deployed v1

   - Live at https://magical-granita-e9f978.netlify.app (stays live; archived at project end)
   - GitHub: https://github.com/jebasinghjoshua24/TIME-CAPSULE (v1, will be archived)

   ## Time Budget

   ~85–120 hours total. Frontend phases 60–80h (the mountain — new tech + never
   written before). Backend phase 20–30h (Jebasingh owns that logic already).