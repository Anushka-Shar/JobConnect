# JobConnect — AI-Powered Job Application Platform

A full-stack, database-backed job platform built to work like **LinkedIn + Naukri**: job seekers build a profile, search and apply for jobs, get AI-matched recommendations, and build a professional network. Recruiters post jobs and get an AI-ranked applicant list.

**Theme:** gradient black background, gradient red buttons/headings/accents, white text — styled as a premium, modern job platform.

---

## ✨ Features

| Area | What it does |
|---|---|
| **Auth** | Email/password signup & login (job seeker or recruiter role), JWT session cookies, bcrypt password hashing |
| **Profiles** | Skills, experience, education, bio, avatar upload, resume upload (PDF/DOC) |
| **Job Search** | Keyword, location, and job-type filters over a real SQL database |
| **AI Job Matching** | Every job gets a live **match % score** for the logged-in user, computed from skill overlap, experience fit, location fit, and posting recency |
| **AI Company Suggestions** | Companies are ranked for you based on how well their open roles fit your skills |
| **AI "People You May Know"** | Suggests connections based on shared skills, company, and education |
| **Eligible Job Notifications** | When a recruiter posts a job, the engine automatically scans all job seekers and notifies every strong match (55%+) — like a real-time job alert system |
| **Applications** | Apply with a cover letter, track status (applied/reviewed/shortlisted/hired/rejected), recruiters update status which notifies the candidate |
| **Networking** | Send/accept/decline connection requests, view your network |
| **Companies** | Company pages listing open roles and employees |
| **Feed** | Simple LinkedIn-style status updates/posts |
| **Recruiter tools** | Post jobs, view AI-ranked applicant lists, download resumes, update application status |

### 🤖 About the AI engine
`utils/recommendationEngine.js` implements a real content-based recommendation model (Jaccard skill-similarity + experience-band matching + location matching + recency decay), the same family of technique production ATS/job platforms use for "match %" scoring — no external API required, so the app is 100% functional out of the box.

**Optional upgrade:** if you set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `.env`, the job-detail page's "Why this matches you" blurb will be generated live by that LLM instead of the built-in rule-based explanation. Everything else (the actual matching/ranking/notifications) always runs locally and instantly, regardless of whether a key is set.

---

## 🗂 Tech stack

- **Backend:** Node.js (v22.5+), Express
- **Database:** SQLite via Node's built-in `node:sqlite` module — no native compilation, no Python/build-tools required, works out of the box on any machine with a recent Node version. (Swap the connection in `config/db.js` for Postgres/MySQL later if you outgrow it.)
- **Views:** EJS (server-rendered, fast, SEO-friendly)
- **Auth:** JWT cookies + bcrypt
- **File uploads:** Multer (avatars & resumes)

---

## 🚀 Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set real random values for JWT_SECRET and SESSION_SECRET.
# (OPENAI_API_KEY / ANTHROPIC_API_KEY are optional.)

# 3. (Optional but recommended) Seed demo data — companies, jobs, users
npm run seed

# 4. Start the app
npm start
# App runs at http://localhost:3000

# — or, while developing —
npm run dev
# Same thing, but auto-restarts the server whenever you edit a file
# in config/, middleware/, routes/, utils/, views/, or server.js itself.
```

### Demo accounts (after running `npm run seed`)
All seeded accounts use the password **`password123`**.

- **Job seeker:** `aarav@example.com` (React/JS skills — try `/jobs` to see live AI match %)
- **Recruiter:** `ananya@nimbustech.com` (post a job at `/jobs/new`, then view AI-ranked applicants)

---

## ☁️ Deploying

This app is a standard Node.js/Express app with a file-based SQLite database, so it deploys anywhere that runs Node:

### Render / Railway / Fly.io (recommended — simplest)
1. Push this project to a GitHub repo.
2. Create a new Web Service, connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables from `.env.example` in the dashboard (`JWT_SECRET`, `SESSION_SECRET`, and optionally the AI keys).
6. **Important:** SQLite writes to disk (`database/jobportal.db`). On platforms with ephemeral filesystems (e.g. most free tiers), attach a **persistent volume** mounted at the project's `database/` folder so data survives restarts/redeploys. Render, Railway and Fly.io all support this.
7. Deploy. Run `npm run seed` once via the platform's shell/console if you want demo data.

### A VPS (DigitalOcean, EC2, etc.)
```bash
git clone <your-repo>
cd job-portal
npm install --production
cp .env.example .env   # fill in real secrets
npm run seed            # optional
npm install -g pm2
pm2 start server.js --name jobconnect
pm2 save
```
Put Nginx in front for TLS/reverse proxy if desired.

### Docker (optional)
No Dockerfile is included by default. Since the app now uses Node's built-in `node:sqlite` (no native addon), any recent Node 22+ base image works — e.g. `node:22-slim`. Copy the project in, then `npm install && npm start`.

### Switching to Postgres/MySQL later
The whole data layer lives in `config/db.js` and plain SQL in the `routes/*.js` and `utils/recommendationEngine.js` files. To move to Postgres, swap `node:sqlite`'s `DatabaseSync` for `pg` (or an ORM like Prisma/Knex), update `config/db.js`'s connection, and adjust the `?`-style placeholders to the new driver's syntax. The schema (see the `CREATE TABLE` statements in `config/db.js`) translates directly.

---

## ⚠️ Node version requirement

This project uses Node's built-in `node:sqlite` module, which requires **Node.js v22.5 or newer** (ideally v22 LTS or newer — v24 works too). Check your version with `node -v`. If you're on an older Node, install a newer one from [nodejs.org](https://nodejs.org) before running `npm install`.

You'll see a one-line `ExperimentalWarning: SQLite is an experimental feature` in the console on startup — that's expected and harmless; the feature is stable enough for this app's needs.

---

## 📁 Project structure

```
job-portal/
├── server.js                  # App entry point
├── config/db.js               # SQLite connection + schema (auto-creates tables on boot)
├── database/seed.js           # Demo data generator (npm run seed)
├── middleware/auth.js         # JWT auth, role guards
├── utils/recommendationEngine.js   # The AI matching engine (jobs/companies/people/notifications)
├── routes/
│   ├── auth.js                # register/login/logout
│   ├── profile.js             # profile view/edit, avatar & resume upload
│   ├── jobs.js                # search, post, view, apply, applicants
│   ├── connections.js         # network / connection requests
│   └── misc.js                # dashboard, feed, companies, notifications, saved jobs
├── views/                     # EJS templates (gradient black/red/white theme)
└── public/
    ├── css/style.css          # Full design system (gradient theme)
    ├── js/main.js
    └── uploads/                # avatars & resumes land here
```

---

## 🔐 Security notes before going to production

- Set strong random values for `JWT_SECRET` and `SESSION_SECRET` in `.env` (never commit `.env`).
- Swap Express's default `MemoryStore` session store for a persistent one (`connect-sqlite3`, `connect-redis`, etc.) — the in-memory store used here is fine for demos but leaks memory and doesn't scale across processes.
- Put the app behind HTTPS (via your host or a reverse proxy) and set cookies to `secure: true` once TLS is in place.
- Add rate-limiting (e.g. `express-rate-limit`) on `/login` and `/register` before public launch.

---

## 🎨 Design system

- **Background:** layered black gradient (`#050506` → `#121014` → `#1c1418`) with subtle radial red glow accents
- **Buttons / headings / key accents:** red gradient (`#ff2d55` → `#8a0014`)
- **Text:** white / light gray for readability, muted gray for secondary text
- All defined as CSS variables at the top of `public/css/style.css` — change the theme in one place.

Enjoy building on top of JobConnect!
#   J o b C o n n e c t  
 