---
title: SmartPM
emoji: 🔧
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

<!-- The block above is configuration for Hugging Face Spaces, which reads it from the top
     of README.md to learn how to run this repo. app_port must match the port the container
     listens on (see Dockerfile). GitHub renders it as a small table and is otherwise
     unaffected. Deleting it stops the Space from starting. -->

# SmartPM — Digital PM Verification

A digital preventive-maintenance verification platform for PT Mattel Indonesia (PTMI),
originally built as a hackathon UI prototype and since turned into a real local system:
real backend, real persistence, real auth, and real AI (RAG search + an agentic
part-request drafting flow). The AI runs locally via Ollama out of the box — no cloud, no
deployment — but can be pointed at the Google Gemini API with a single env change when you
want stronger output.

## Architecture

Four processes talk to each other over localhost:

```
Vite/React (5173)  ──/api──▶  Node/Express (4000)  ──HTTP──▶  Python AI service (5001)  ──▶  Ollama (11434)
   frontend                     DB · auth · retrieval ·          embeddings · email          or Gemini API
                                threshold enforcement            drafting · RAG synthesis
```

The **Node backend owns everything correctness-critical** — the database, JWT auth, the
cosine-similarity retrieval, and the approval-threshold decision. The **Python service is
stateless AI compute**: it turns facts into vectors and prose and nothing more. That
boundary is deliberate — a flaky or offline model can never corrupt data or mis-route an
approval, only degrade to a deterministic fallback.

## Run it

You need four things running at once:

1. **Ollama**, with the models this app uses pulled:
   ```bash
   ollama pull qwen2.5:3b
   ollama pull nomic-embed-text
   ```
   (Ollama itself usually runs as a background service/tray app already.)

2. **The Python AI service** (first time only: install deps):
   ```bash
   cd ai-service
   pip install -r requirements.txt
   cp .env.example .env        # defaults are fully local (Ollama)
   python -m uvicorn main:app --port 5001
   ```
   Runs on http://localhost:5001. See **Switching to Gemini** below.

3. **The backend** (first time only: install, migrate, seed):
   ```bash
   cd server
   npm install
   cp .env.example .env
   npm run db:migrate
   
   npm run db:seed
   npm run dev
   ```
   Runs on http://localhost:4000. Seeded logins (password for all: `smartpm123`):
   - Supervisor: `supervisor`
   - Technician: `dewi`, `budi`, `sari`, `agus`, `rizky`, or `andi`

4. **The frontend**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:5173 — Vite proxies `/api` to the backend.

Run `npm test` inside `server/` for the backend test suite (fast — it stubs the HTTP call
to the AI service, so no Ollama/Python needed; see `server/test/api.test.ts`).

## Switching to Gemini

The Python service is provider-agnostic (both Ollama and Gemini expose an OpenAI-compatible
API). To run the agent/search on Gemini instead of the local model, edit `ai-service/.env`:

```ini
AI_CHAT_PROVIDER=gemini
GEMINI_API_KEY=your-key-from-https://aistudio.google.com/apikey
# GEMINI_CHAT_MODEL=gemini-3.5-flash   # optional override
```

Once the key is present you can flip the chat provider **live from the Settings screen**
(no restart) — Node passes the active provider to the AI service per request. **Leave
`AI_EMBED_PROVIDER=ollama`** unless you re-seed: every stored embedding must come from one
model, so switching the embedding provider means re-running `npm run db:seed`. Note that with
Gemini, finding/machine data leaves your laptop for Google's cloud — fine for dev, a
data-governance decision for a real PTMI rollout.

## Screens

- **Dashboard** — summary stats, recent checksheets, open findings, approval queue.
- **Checksheets** — the digital checksheet form technicians fill in. Pick a machine,
  pass/fail each inspection point, categorize failures (no free text), attach mock
  photo evidence, submit.
- **AI Search** — natural-language search over PM records via real retrieval
  (embeddings generated at submit-time, cosine similarity, local-LLM synthesis).
- **Assistant** — a conversational, tool-calling agent (see below).
- **Predictive PM** — the reliability agent's recurring-failure insights (see below).
- **Shift Report** — one-click AI end-of-shift PM summary (see below).
- **Approvals** — part-request emails drafted by an agent. Requests below the configured
  threshold (default Rp 500.000) auto-send; the rest need supervisor approval. Role-gated:
  only supervisors can approve/reject. Also hosts **Smart procurement** (see below).
- **Settings** (supervisor) — switch the AI engine between **Local (Ollama)** and **Gemini**
  live, and configure the auto-send threshold. Shows live AI-service status.

Submitting a checksheet with a "Damaged part" or "Needs replacement" finding is
real end-to-end: it's persisted, embedded for search, and routed through the agent
to draft (and correctly cost-gate) a vendor part request — visible immediately on
the Dashboard and in Approvals, and it survives a refresh.

## Agentic capabilities

Three agents build on the AI service. In every case the **decision/data logic is
deterministic in Node** and the model only reasons or writes prose — so the features stay
correct even when the model is weak or offline (each has a deterministic fallback).

- **Predictive-PM agent** (`GET /api/insights`) — Node detects which inspection points
  have failed 2+ times on the same machine and ranks urgency in code; the model writes the
  summary and a per-item "bring PM forward" recommendation.
- **Smart-procurement agent** (`GET /api/procurement/consolidations`, supervisor-only) —
  Node groups pending part requests by vendor and totals the cost; the model drafts one
  consolidated purchase-order email per vendor. Drafts only — each source request still
  goes through normal approval.
- **Conversational assistant** (`POST /api/assistant`) — a genuine tool-calling agent, but
  **Node runs the loop and executes every tool** (`search_records`, `list_recurring_issues`,
  `get_machine_status`, `list_pending_part_requests`) against its own database; Python is
  only the per-step reasoner that decides the next tool call or the final answer. Works on
  any provider whose OpenAI-compatible endpoint supports tool-calling — reliably on Gemini,
  best-effort on the local 3B model with a plain-RAG fallback.
- **AI shift report** (`GET /api/report`) — Node aggregates the shift's real numbers
  (checksheets today, findings by severity, recurrence count, pending value); the model turns
  them into an executive headline, summary, highlights, and a recommended next action.

> Full write-up in [docs/OVERVIEW.md](docs/OVERVIEW.md); run + test + demo script in
> [docs/TESTING.md](docs/TESTING.md).

## Stack

- **Frontend:** Vite · React 19 · Tailwind CSS v4 · lucide-react · TanStack Query
- **Backend:** Express · Zod · Drizzle (schema/migrations) · Node's built-in `node:sqlite`
- **AI service:** Python · FastAPI · Pydantic · `openai` client → Ollama (`qwen2.5:3b` +
  `nomic-embed-text`) or the Gemini API. Retrieval (embed-on-write + cosine similarity)
  lives in Node; the service only embeds text and synthesizes prose.

## Known limitations (local-only phase)

- Photo evidence is still mocked (fake filename/size, no real file storage).
- Vendor email sending is real when SMTP is configured in `server/.env` (branded HTML via
  nodemailer). Leave `SMTP_USER`/`SMTP_PASS` blank and it degrades to a clearly-labeled
  simulated send — drafted content is persisted and the status flips, but nothing is sent.
- Output quality tracks the model. The local 3B model is fast but terse, occasionally drops
  the signature line, emits stray markdown, or garbles a number in prose (e.g. printing a
  cost with an extra digit) — the *stored* data is always correct in Node; only the model's
  phrasing is off. The service asks for JSON and Node applies deterministic fallbacks, so a
  request never breaks. Point it at Gemini (see above) for noticeably better, more consistent
  drafting/search/assistant answers.
- Single-laptop auth (JWT cookie, no session store) — fine for one concurrent user,
  not yet a multi-user production deployment.
