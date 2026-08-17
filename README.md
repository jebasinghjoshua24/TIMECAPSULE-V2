# [TimeCapsule v2]

<!-- Badges (Add these once you have a live build) -->
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Build Status](https://img.shields.io/badge/build-passing-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## 📝 Description

A complete remake of the Time Capsule web app. Built from scratch to own the frontend code, master modern full-stack development, and serve as a high-quality portfolio piece. 

This v2 replaces the legacy vanilla JS + Express/SQLite version with a type-safe, component-driven architecture using Next.js, TypeScript, Tailwind CSS, and PostgreSQL.

**Live v1 (archive reference):** [https://magical-granita-e9f978.netlify.app](https://magical-granita-e9f978.netlify.app)

## 🗂️ Table of Contents

- [Tech Stack](#-tech-stack)
- [Core Features](#-core-features)
- [Architecture Overview](#-architecture-overview)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Environment Variables](#-environment-variables)
- [Development Workflow](#-development-workflow)
- [Project Roadmap](#-project-roadmap)
- [Reference Map (v1)](#-reference-map-v1)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

## 🧰 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | Next.js (App Router) |
| **Language** | TypeScript (browser + server) |
| **Styling** | Tailwind CSS + `@theme` (migrated from v1 `variables.css`) |
| **Backend (Phase 0–10)** | Express.js (temporary dev API, port 3001) |
| **Backend (Phase 11+)** | Next.js Route Handlers (same-origin, no CORS) |
| **Database (Dev)** | SQLite (via `server/` temp) |
| **Database (Prod)** | PostgreSQL (local install, later Neon for Vercel) |
| **Package Manager** | npm / yarn |
| **Version Control** | Git + GitHub (branch-per-phase workflow) |

## ✨ Core Features

- **Authentication:** Sign-up / login with typed fetch and controlled forms.
- **Dashboard:** Capsule CRUD, stats, countdown timers, and meme modal.
- **Friends System:** Debounced search, userbase browsing, collaborative capsules.
- **Admin Panel:** Role-based guards, tabs, tables, and full user/capsule management.
- **Dark Mode:** Theme context with system preference detection.
- **Real-time Feedback:** Toast notifications via Context API.
- **Self-destruct & Activity Logs:** Full audit trail for deleted users/capsules.

## 🏗️ Architecture Overview

- **Ports:** Next.js dev server runs on **3000**; Express temp API runs on **3001** (v1 legacy was hardcoded to 3000 — updated).
- **CORS:** Allowlist configured in `server/server.js` to accept `http://localhost:3000`.
- **Phase 11 Transition:** The `server/` folder is deleted; PostgreSQL replaces SQLite; Next.js route handlers absorb all endpoints; CORS is removed entirely.
- **Legacy Code:** All v1 code (`../TimeCapsule Folder`) is **read-only reference** — never copied, only used for behavior/spec.

## ⚙️ Prerequisites

- [Node.js v18+](https://nodejs.org/)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [PostgreSQL](https://www.postgresql.org/) (for Phase 11+ — local install)
- [Git](https://git-scm.com/)

## 🔧 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [your-repo-url]
   cd [project-folder]