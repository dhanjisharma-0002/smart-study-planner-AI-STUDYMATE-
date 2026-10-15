# Smart Study Planner

A minimalist, responsive study planner dashboard designed for focused learning, task scheduling, and daily study interval management.

## Strict Color System
The interface strictly uses the required 5-color palette:
- **Aqua**: `#B7DCE2` — highlights, tags, next-up session badges, interactive accents
- **Off-white**: `#F7F6F0` — primary surface and clean canvas
- **Deep Teal**: `#173744` — header bar, primary branding, dominant actions, high-contrast headings
- **Mist Teal**: `#D8E9E8` — card borders, secondary containers, quick chips, subtle tags
- **Charcoal**: `#252D32` — high-legibility body typography, borders

## Features Implemented

### Phase 1: Foundation & UI Architecture
- **Navigation Header**: Displays brand emblem, title, subtitle, live dynamic date, and planner status.
- **Daily Schedule Area**: Chronological timeline blocks (starting at 09:00 AM) that map active tasks into deep work blocks and 10–15 minute cognitive recovery intervals.
- **Generated Study Sessions Area**: Formatted cards indicating next-up session, focus intervals, break intervals, and priority tags.
- **Color Discipline**: Strict adherence to the 5-color palette (Aqua, Off-white, Deep Teal, Mist Teal, Charcoal).

### Phase 2: Task CRUD, Validation & Local Persistence
- **Task Creation**: Add study tasks capturing Subject/Topic, Deadline Date & Time, Estimated Duration (minutes), and Priority (Low, Medium, High).
- **Inline Validation & Error Handling**:
  - Rejects empty or whitespace-only subjects with clear inline alerts.
  - Rejects missing or invalid deadline dates and times.
  - Rejects empty, non-numeric, 0, or negative duration inputs.
  - Clears inline errors in real-time as fields are corrected.
  - Highlights invalid fields using the design palette tokens.
- **Task In-Place Editing**:
  - Dedicated "Edit" button on every task item.
  - Populates form with existing task parameters and enters Edit Mode.
  - Highlights currently edited task in the list (`.is-editing`).
  - Allows canceling edits or updating the task while preserving completion state.
- **Task Deletion**: Remove tasks with instant updates to task counters, schedule, and sessions.
- **Completion Tracking**:
  - Toggle completion checkbox to mark tasks done or active.
  - Visual progress bar dynamically updates completion percentage.
  - Updates counters (`X of Y tasks finished`) and total estimated study minutes.
  - Filter tabs (`All`, `Active`, `Done`).
- **Browser LocalStorage Persistence**: Automatically persists task state across browser refreshes with sensible default seed data on first load.

### Phase 3: Deterministic Study-Plan Scheduling Engine
- **Local Algorithm (No External AI/LLM)**: Plans are generated purely using a lightweight, transparent, deterministic algorithm in JavaScript. No cloud dependencies or API keys required.
- **Available Study Hours Control**:
  - Interactive daily budget input (from 0.5h to 16h with 0.5h increments).
  - Quick-select presets (`2h`, `4h`, `6h`, `8h`).
  - Allocation Capacity Meter displaying exact minutes allocated vs. available budget and percentage.
- **Priority & Deadline-Driven Scheduling**:
  - Tasks due within the imminent 24-hour window are prioritized first.
  - Tasks are sorted by priority (`High > Medium > Low`), then deadline proximity, then duration.
- **Deadline Avoidance**:
  - Sessions are never scheduled after their deadlines.
  - Overdue tasks (deadlines in the past) are rejected and highlighted with clear conflict explanations.
- **Realistic Session Splitting**:
  - Tasks > 60 minutes are automatically split into focused positive blocks (e.g. 50m/45m) with cognitive recovery intervals (breaks) scheduled in between.
- **Explicit Conflict Reporting & Preservation**:
  - Unscheduled tasks are **never silently discarded**.
  - Any task that cannot be scheduled due to budget limits, overdue deadlines, or invalid fields is prominently displayed in the **Scheduling Conflict Report** banner and the **Unscheduled Tasks** section with the exact reason.

### Phase 4: Full Calendar Display & Consistent Completion Tracking
- **Dual Schedule Views**:
  - **Timeline View**: Chronological study cards showing start/end time, task name, duration, deadline badge, and recovery breaks.
  - **Day Calendar View**: Hourly calendar grid (09:00 to 18:00+) mapping each study block, session duration, deadline tag, and priority.
- **Consistent Task Completion**:
  - Tasks can be toggled completed from the Task List, Timeline cards, Calendar slots, or Generated Session cards.
  - Completion status immediately updates the visual progress bar, finished counters, and removes completed tasks from active schedule consumption.
- **Strict Validation Guardrails**:
- **Color Discipline**:
  - Preserved the reference-inspired 5-color palette across all components: Aqua (`#B7DCE2`), Off-white (`#F7F6F0`), Deep Teal (`#173744`), Mist Teal (`#D8E9E8`), and Charcoal (`#252D32`).

### Phase 5: LLM Integration Architecture & Deterministic Fallback
- **Secure Backend Proxy (`server.py`)**:
  - Serves static assets on port 3000.
  - Exposes `GET /api/llm-status` and `POST /api/generate-plan`.
  - Securely reads API credentials (`GEMINI_API_KEY` or `OPENAI_API_KEY`) from server environment variables; never exposes keys to frontend JavaScript or client commits.
  - If no API key is provided, returns honest status (`llmConfigured: false, fallbackRequired: true`).
- **Honest Engine Labeling**:
  - Displays dynamic engine badge in header: `Engine: LLM (<Provider>)` when authenticated, or `Engine: Deterministic Scheduler (Fallback)` when running locally.
- **Strict Output Validation**:
  - Validates returned LLM plans before rendering: enforces non-negative durations, daily study hours capacity, deadline constraints, and explicitly displays unscheduled overflow tasks.
- **Mathematical Display Fix**:
  - Clarified capacity display for full allocations: displays `Daily Budget Reached (X Overflow)` when 100% of available hours are allocated, accurately distinguishing full budget utilization from capacity overflow.

### Phase 6: Vercel Serverless Architecture & Cloud Deployment
- **Vercel Serverless Functions (`/api`)**:
  - `GET /api/llm-status` -> `api/llm_status.py` reports LLM readiness securely from cloud environment variables.
  - `POST /api/generate-plan` -> `api/generate_plan.py` handles cloud LLM plan generation with Gemini model fallbacks (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-flash-latest`) and deterministic fallback.
  - `api/index.py` provides unified routing entrypoint for both endpoints.
- **Routing Configuration (`vercel.json`)**:
  - Clean URL rewrites mapping `/api/llm-status` and `/api/generate-plan` to serverless function handlers while serving root static assets.
- **Environment Variable Security (`.gitignore`)**:
  - Excludes local environment files (`.env`, `.env.local`), Vercel artifacts (`.vercel`), and Python bytecode (`__pycache__`).

## Project Structure
```
AI STUDYMATE/
├── api/
│   ├── generate_plan.py  # Vercel Serverless Function for POST /api/generate-plan
│   ├── llm_status.py     # Vercel Serverless Function for GET /api/llm-status
│   └── index.py          # Unified entrypoint router for API requests
├── css/
│   └── style.css         # Clean design system using strictly the 5 specified colors
├── js/
│   └── app.js            # Vanilla JS state management, LLM bridge & deterministic scheduler
├── .gitignore            # Git exclusion rules for secrets, cache, and build files
├── index.html            # Semantic, accessible HTML5 layout
├── server.py             # Local development Python server with secure LLM proxy & static serving
├── vercel.json           # Vercel deployment routing and API rewrite rules
└── README.md             # Project documentation
```

## Running the Application Locally
Run the Python application server:
```bash
python server.py
```
Or with an optional Gemini API key:
```bash
# Windows PowerShell
$env:GEMINI_API_KEY="your-gemini-api-key"
python server.py

# Windows Command Prompt
set GEMINI_API_KEY=your-gemini-api-key
python server.py
```
Then visit [http://localhost:3000](http://localhost:3000) in any modern web browser.

## Deploying to Vercel

### Step 1: Push Project to GitHub
Initialize git and push the project repository:
```bash
git init
git add .
git commit -m "Prepare Smart Study Planner for Vercel deployment"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 2: Import Project in Vercel Dashboard
1. Log in to [Vercel](https://vercel.com/) and click **"Add New..."** > **"Project"**.
2. Select your imported GitHub repository.
3. Configure Project Settings:
   - **Framework Preset**: Other (Static / Vanilla)
   - **Root Directory**: `./` (default)
   - **Build Command**: Leave empty (none required)
   - **Output Directory**: Leave empty (root serves static assets)
4. Add Environment Variable:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: `<your-google-gemini-api-key>`
   - Select environments: Production, Preview, Development.
5. Click **"Deploy"**.

Once deployed, your frontend static dashboard and `/api` serverless functions are live with SSL, global CDN distribution, and authenticated Gemini study-plan generation.
