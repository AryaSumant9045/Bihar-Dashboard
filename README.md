# Automated Gemini analysis

Gemini processing runs in bounded batches without a dashboard click. The worker claims up to `ANALYSIS_BATCH_SIZE` (default 20, maximum 30) unprocessed `raw_items`, waits 1.5 seconds between calls, retries transient Gemini 429/5xx responses with exponential backoff, and records every cycle in `processing_logs`. When Gemini is unavailable, it sends the same structured prompt to the OpenAI-compatible PlugSky endpoint configured by `PLUGSKY_API_URL` and authenticates with `PLUGSKY_API_KEY`.

1. Apply `supabase/migrations/004_automated_gemini_analysis.sql` in Supabase SQL Editor.
2. For Vercel, deploy with `CRON_SECRET` set if the cron endpoint should be protected. `vercel.json` invokes `/api/cron/analyze` every 15 minutes.
3. For a local always-running Next.js server, set `ANALYSIS_SCHEDULER_ENABLED=true` and start `npm run dev`. Set `ANALYSIS_INTERVAL_MINUTES=1` temporarily for a quick smoke test, then restore 15.
4. Open the War Room. Its pending count and last completed cycle refresh every 30 seconds. `/api/analysis-status` exposes the same status.

For existing analyzed rows, set `SUMMARY_REPROCESS_SECRET` and run `node scripts/regenerate-summaries.mjs`. This updates only `summary` and `summary_needs_review`.

For existing raw-item duplicates, run `node scripts/cleanup-duplicate-raw-items.mjs` first as a dry-run. Set the server-only `SUPABASE_SERVICE_ROLE_KEY`, then run with `--apply` after reviewing the reported groups. Apply migration `006_raw_item_dedup_index.sql` afterward; never expose the service-role key to the browser.

The old `POST /api/analyze-news` endpoint remains only as an emergency force-refresh endpoint and uses the same locked worker.
# ⚡ Bihar Political Command Center
### BJP Bihar — President's Intelligence Dashboard

> A centralised, real-time political intelligence and decision-support dashboard for the BJP Bihar President. Built to answer: *What is happening? Where? What requires attention? What should I say?*

---

## 🖥 Next.js app

```bash
# Install dependencies once
npm install

# Start the Next.js development server
npm run dev

# Open in browser
http://localhost:3000
```

For the live NewsData → Supabase worker, follow [LIVE_NEWS_SETUP.md](LIVE_NEWS_SETUP.md).

---

## 📋 Project Overview

This dashboard converts scattered political information into a **single prioritised command environment**:

```
See → Understand → Prioritise → Act → Follow Up
```

**Tech Stack:** Next.js App Router · React · Supabase Realtime.

**Architecture:** `app/page.js` renders the React dashboard, `components/CommandDashboard.js` holds the eight live modules, and `lib/supabase.js` provides the Supabase client. The original HTML/CSS/JS SPA remains in the repository as a legacy reference during migration.

---

## 🏗 Folder Structure

```
Bihar Dashboard/
├── index.html                          ← SPA shell (entry point)
│
├── pages/                              ← HTML page fragments (loaded dynamically)
│   ├── login.html                      ← Role selector / access portal
│   ├── home.html                       ← President's 60-sec executive scan
│   ├── war-room.html                   ← Breaking news & 4-level alerts
│   ├── political-map.html              ← Bihar district/constituency map
│   ├── leadership.html                 ← Leader tracker + activity timeline
│   ├── opposition.html                 ← Intel cards + opposition analysis
│   ├── pk-tracker.html                 ← Prashant Kishor monitoring
│   ├── media-pulse.html                ← Social & TV media monitoring
│   ├── speech-intelligence.html        ← Speech briefing engine
│   └── issues.html                     ← Issues & grievances tracker
│
├── assets/
│   ├── css/
│   │   ├── main.css                    ← Design tokens, reset, typography
│   │   ├── layout.css                  ← Sidebar, header, grid system
│   │   ├── components.css              ← Cards, buttons, badges, modals, tables
│   │   └── animations.css              ← Micro-animations, keyframes
│   │
│   └── js/
│       ├── app.js                      ← SPA router, nav builder, toast, modal
│       │
│       ├── data/                       ← Mock intelligence data
│       │   ├── news.js                 ← Breaking news & alert data
│       │   ├── leaders.js              ← Leadership tracker data
│       │   ├── opposition.js           ← Opposition intel cards & analysis data
│       │   └── districts.js            ← Map, PK, media, speeches, issues data
│       │
│       └── modules/                    ← Page-specific JavaScript
│           ├── home.js                 ← President homepage logic
│           ├── war-room.js             ← Alert system, filters, charts
│           ├── political-map.js        ← Leaflet map, district chart
│           ├── leadership.js           ← Leader cards, filters, timeline
│           ├── opposition.js           ← Intel cards, analysis, heatmap
│           ├── pk-tracker.js           ← PK map, activity, threat chart
│           ├── media-pulse.js          ← Trending, charts, live feed
│           ├── speech-intelligence.js  ← Brief generator, speech library
│           └── issues.js               ← Issue list, filters, category chart
│
├── README.md                           ← This file
└── BJP_Bihar_President_Command_Dashboard_Concept_Note.docx
```

---

## 🧩 Modules

### 🏠 President's Homepage
The **60–90 second executive scan** page designed for rapid situational awareness.

| Section | What It Shows |
|---|---|
| 🔴 3 Things Today | Top 3 critical/high alerts requiring immediate attention |
| 📈 What Is Trending | Top social media hashtags and their momentum |
| 🗺 Where Activity Is | Hot districts with high opposition/political activity |
| 🔍 Opposition Watch | Live snapshot of RJD, INC, PK activity |
| 🏛️ Organisation | Active BJP/NDA leaders and their recent activities |
| 🎙 Speech/Comms | Recent speech briefs, quick access to generate new ones |
| 🗺 District Map | Click any district → **District 360° View** popup |

**District 360° View** (click any district on homepage map):
- Seat composition (BJP / JDU / Opposition)
- Opposition activity level with color coding
- Open issues in that district
- Recent news mentioning that district
- Quick action buttons (View Issues, Full Map, Speech Brief)

---

### 🚨 War Room — 4-Level Alert System

Alerts are prioritised into 4 levels based on the concept note:

| Level | Color | Description |
|---|---|---|
| 🔴 **CRITICAL** | Red | Rapidly developing; immediate leadership attention required |
| 🟠 **DEVELOPING** | Amber | Meaningful momentum; monitor and prepare inputs |
| 🟡 **WATCH** | Gold | Early signal; keep on monitoring list |
| 🟢 **ROUTINE** | Green | Normal activity; no escalation required |

Features:
- Filter by level (click stat cards or filter pills)
- Filter by category (Political, Opposition, Flood & Disaster, Media, etc.)
- Search across title, body, tags, district
- **Handle** / **Escalate** / **Flag for President** actions per alert
- Alert detail modal with **action required** context
- Threat gauge, source status toggles, category breakdown chart

---

### 🗺 Bihar Political Map
- Interactive **Leaflet.js** map centered on Bihar
- District markers colored by dominant party (BJP=orange, JDU=green, RJD=red)
- Click marker → popup with seat breakdown per party
- Party seat share **doughnut chart**
- District breakdown table (sortable by seats)
- Filter by party, year, Lok Sabha vs Assembly

---

### 👥 Leadership Tracker
- Featured hero cards for CM and Deputy CM
- Full leader grid with party filter, sentiment filter, search
- **Influence score** progress bars
- **Sentiment badges** (positive/neutral/negative)
- Activity timeline (updates on leader card click)
- Leader detail modal with full profile and activity log
- Influence comparison chart (top 6 leaders)

---

### 🔍 Opposition Tracker — Intel Cards

Standard intelligence card format (from concept note):

```
WHO → WHERE → EVENT → ISSUE → STATEMENT → REACH → CONTEXT → STATUS
```

Two views:
- **🎯 Intel Cards** — Structured opposition intelligence with counter-brief and flag-for-president buttons
- **📊 Analysis** — Party strength cards, attack narratives, district heatmap, counter-strategy

Alert status levels: Critical / Developing / Watch / Routine  
Filter by: Party (RJD, INC, Jan Suraaj, Left)

---

### 🎯 Prashant Kishor Tracker
- **Profile hero card** with threat level indicator (HIGH / glowing red)
- **Movement map** — Leaflet markers for recent district visits with date and purpose
- **Activity timeline** — All PK activities with type-coded icons
- **Strategy cards** — Focus areas with high/medium priority
- **Threat Index chart** — Line chart showing threat rising over 6 months
- **Alliance Network** — INC, RJD, Left faction relationship status
- **Social Monitor** — Twitter, YouTube, WhatsApp reach stats
- **Jan Suraaj Reach** — District-level bar chart

---

### 📱 Media & Social Pulse
- **Trending Hashtags** horizontal scroll strip with platform + sentiment
- **Weekly Mentions** multi-line chart (BJP/NDA vs RJD/INDIA vs PK)
- **Sentiment Donut** (Positive / Neutral / Negative %)
- **Platform Share** bar chart (Twitter, Facebook, YouTube, TV, Print)
- **TV Coverage Table** — Channel, hours, tone badge
- **Live Feed** — Simulated recent tweets/posts
- Platform filter pills

---

### 🎙 Speech Intelligence Engine

**Briefing Builder** (main view):
1. Select **District + Event Type + Audience + Topic**
2. Click **Generate Intelligence Brief**
3. Receive structured brief with:
   - Local district facts (seat counts, voter data)
   - Local concerns & open issues
   - **Suggested Talking Points** (numbered, topic-specific)
   - **Opposition Claims → Factual Counter** side-by-side
   - Relevant statistics to quote
   - **Audience-specific notes** (youth/farmers/women/karyakartas)
   - Print / Share buttons

**Speech Library** (toggle view):
- All logged speeches with NLP analysis
- Sentiment badge, intensity score, topics
- Key quotes (gold-border blockquotes)
- Promise/commitment tracker

---

### 📋 Issues & Grievances
- Issues list with **priority badges** (Urgent/High/Medium/Low) and **status badges** (Open/In-Progress/Escalated)
- Filter by: Priority, Status, District, Category
- Click issue → detail panel with full description, assignee, actions
- **Assign** and **Escalate** buttons with toast confirmation
- **Issues by Category** horizontal bar chart
- **Issues by District** summary list

---

## 🔐 Role-Based Access

Access via `pages/login.html`:

| Role | Access Level |
|---|---|
| 👑 **President View** | Full dashboard — all modules, all actions |
| 🚨 **War Room / Admin** | Breaking news, alerts, PK tracker, media |
| 🗺 **District Update** | Issues, field reports, district activities |
| 🎙 **Communication Team** | Speech intelligence, media briefs |
| 👁 **Read-Only Leadership** | View-only access, no edits |
| 💻 **IT Cell / Social** | Media pulse, trending, social monitoring |

Role is stored in `sessionStorage` and displayed in the sidebar.

---

## 🎨 Design System

**Color Palette:**
```css
--gold:    #f5c518    /* Primary accent — BJP saffron/gold */
--red:     #e63946    /* Alerts, RJD, critical */
--amber:   #ff9f43    /* Developing alerts, warnings */
--green:   #26de81    /* Positive sentiment, stable */
--blue:    #4a9eff    /* Information, INC, social */

--bjp-color: #ff6b2b
--jdu-color: #22c55e
--rjd-color: #e63946
--inc-color: #4a9eff
```

**Typography:** Outfit (headings) + Inter (body) — Google Fonts

**Design Language:** Dark glassmorphism — `rgba` backgrounds, `backdrop-filter: blur`, subtle borders, gold accents.

---

## 🗂 Data Architecture

All data is in `/assets/js/data/` as plain JS files loaded via `<script>` tags. Each exports a global constant:

| File | Exports | Used By |
|---|---|---|
| `news.js` | `NEWS_DATA`, `TICKER_ITEMS` | War Room, Home |
| `leaders.js` | `LEADERS_DATA` | Leadership, Home |
| `opposition.js` | `OPPOSITION_DATA` (incl. `intelCards`) | Opposition, Home |
| `districts.js` | `DISTRICTS_DATA`, `PK_DATA`, `MEDIA_DATA`, `SPEECHES_DATA`, `ISSUES_DATA` | All modules |

---

## 📡 External Libraries (CDN)

```html
<!-- Charts -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<!-- Maps -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<!-- Icons (optional) -->
<script src="https://unpkg.com/lucide@latest"></script>
```

---

## 🚀 Running the Dashboard

**Option 1 — Python (recommended):**
```bash
cd "Bihar Dashboard"
python3 -m http.server 3000
# Visit: http://localhost:3000/pages/login.html
```

**Option 2 — Node.js:**
```bash
npx serve . -p 3000
# Visit: http://localhost:3000/pages/login.html
```

**Option 3 — VS Code:**
Install "Live Server" extension → Right-click `index.html` → Open with Live Server

> ⚠️ Must be served over HTTP (not `file://`) — Leaflet maps and `fetch()` require HTTP context.

---

## 📈 Roadmap (Post-MVP)

- [ ] Real data integration (news APIs, social media APIs)
- [ ] Backend with Node.js + PostgreSQL
- [ ] WhatsApp/Telegram alert forwarding
- [ ] PDF export of intelligence briefs
- [ ] Offline PWA support
- [ ] District officer data submission portal
- [ ] Audit logs and action tracking

---

## 🏛️ Concept Note

Based on: **BJP Bihar President's Command & Intelligence Dashboard — Concept Note**

> *"From MIS to Command System: The final product should help leadership move from scattered information to a single, prioritised decision-support environment."*

The 5-layer architecture implemented:
1. **Intelligence** — News, social signals, alerts
2. **Organisation** — Leader and district activity
3. **Opposition & Narrative** — Intel cards, analysis, counter-strategy
4. **Communication** — Speech briefs, talking points
5. **Presidential Action** — Prioritisation, assignment, escalation

---

*Bihar Political Command Center — Confidential — Authorised Personnel Only*  
*Built for BJP Bihar | Vanilla HTML + CSS + JS | No framework dependencies*
