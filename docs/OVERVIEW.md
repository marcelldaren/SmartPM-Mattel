# SmartPM — Project Overview

> A digital preventive-maintenance (PM) verification platform for **PT Mattel Indonesia (PTMI)**,
> built to be run daily on the plant floor. Real backend, real persistence, real auth, and real
> agentic AI — running 100% locally on a laptop, or on the Gemini cloud API with one setting.

---

## 1. The problem

PTMI runs preventive maintenance on plant machinery on fixed schedules. Today that verification is
largely paper/spreadsheet based:

- Technicians fill checksheets by hand — hard to audit, easy to lose, impossible to search.
- Recurring failures aren't spotted until they cause downtime.
- Ordering replacement parts is manual: a supervisor writes a vendor email per finding.
- There's no single, queryable history of "what failed, where, how often."

**SmartPM digitizes the whole loop** — checksheet → finding → part request → approval → searchable
history — and layers AI on top to *reason* over that data, not just store it.

## 2. What it does

| Capability | Description |
|---|---|
| **Digital checksheets** | Technicians pick a machine, pass/fail each inspection point, and categorize failures. Submitting persists everything and routes part-related findings to the agent. |
| **Role-based auth** | Real JWT login. Technicians fill checksheets; supervisors also approve part requests and change settings. |
| **AI Search (RAG)** | Natural-language search over every finding — real embeddings + cosine similarity + LLM synthesis, not keyword matching. |
| **Agentic part requests** | On a part-related failure, an agent looks up recurrence + catalog cost, cost-gates against the approval threshold (in code), and drafts a vendor email. |
| **Predictive-PM agent** | Detects inspection points failing repeatedly and recommends bringing PM forward. |
| **Smart-procurement agent** | Batches multiple pending requests for the same vendor into one consolidated purchase order. |
| **Conversational assistant** | A tool-calling agent that answers questions over live plant data. |
| **AI shift report** | One click generates an executive end-of-shift PM summary from the day's real data. |
| **Local ↔ Gemini toggle** | Switch the AI engine between a fully-local model and the Gemini cloud API from the Settings screen — no restart. |

## 3. Architecture

Four processes talk over localhost:

```
 Vite/React (5173) ──/api──▶ Node/Express (4000) ──HTTP──▶ Python AI service (5001) ──▶ Ollama (11434)
    frontend                   DB · auth · retrieval ·        embeddings · drafting ·      or Gemini API
                               threshold · tool loop          synthesis · reasoning
```

### The core design principle

> **Node owns everything that must be _correct_. Python only reasons and writes prose.**

- **Node** holds the database, authentication, the cosine-similarity retrieval, the approval-threshold
  decision, recurrence detection, vendor grouping, cost totals, and the assistant's tool-execution loop.
- **Python** is a stateless AI-compute service: it embeds text, drafts emails, synthesizes search
  results, and reasons — but never touches the database and never decides an approval.

Every AI feature has a **deterministic fallback in Node**, so a slow, wrong, or offline model can only
*degrade output quality* — it can never corrupt data or mis-route an approval. This is the property that
makes the system safe to actually deploy in a factory.

### Provider-agnostic AI

Both Ollama (local) and Gemini expose an OpenAI-compatible API, so the Python service uses one client and
switches providers via a value Node passes on each request (controlled from the Settings screen). Embeddings
stay local always, so the stored vector space never changes underneath search.

## 4. The agentic AI story (for judges)

SmartPM uses AI where it adds real value, and keeps the decisions that matter deterministic:

1. **RAG, not keyword search.** Findings are embedded *at submit time*, so a checksheet submitted seconds
   ago is instantly semantically searchable.
2. **Real tool-calling agent.** The assistant genuinely decides which of four tools to call
   (`search_records`, `list_recurring_issues`, `get_machine_status`, `list_pending_part_requests`) — but
   **Node runs the loop and executes the tools**, so the model can request data, never fabricate or mutate it.
3. **Deterministic guardrails around every agent.** Recurrence counts, urgency ranking, cost totals, and the
   auto-send-vs-approval decision are all computed in code. The model writes the narrative around those facts.
4. **Runs offline or in the cloud.** The whole thing runs air-gapped on a laptop (data sovereignty — a real
   concern for a manufacturer), or flips to Gemini for higher-quality output with one setting.

## 5. Tech stack

- **Frontend:** Vite · React 19 · Tailwind CSS v4 · lucide-react · TanStack Query · custom zero-dependency SVG charts
- **Backend:** Node · Express · Zod · Drizzle (schema/migrations) · Node's built-in `node:sqlite` · JWT + bcrypt
- **AI service:** Python · FastAPI · Pydantic · `openai` client → Ollama (`qwen2.5:3b` + `nomic-embed-text`) or Gemini
- **Tests:** Vitest + Supertest (25 backend tests; the AI boundary is stubbed so they run without a model)

## 6. What makes it competition-worthy

- **It's real, end-to-end.** Submit a checksheet → it persists, embeds, drafts a cost-gated vendor email,
  updates the dashboard, and survives a refresh. Nothing is faked in the data path.
- **Five distinct AI features**, each with a deterministic safety net.
- **A genuine architectural stance** (Node owns correctness, Python reasons) that you can defend under questioning.
- **Offline-first with a cloud option** — a story that resonates with a manufacturer's data-governance reality.
- **Polished UX** — charts, toasts, empty states, role-aware navigation.

## 7. Known limitations (honest)

- Photo evidence is mocked (filename/size only; no file storage yet).
- Vendor email sending is real when SMTP is set in `server/.env`; otherwise it degrades to
  a simulated send (drafted content persisted + status change, nothing actually emailed).
- Output quality tracks the model — the local 3B model is fast but terse and can garble a number *in prose*
  (the stored data is always correct). Gemini fixes this.
- Single-laptop auth (JWT cookie, no session store) — fine for one concurrent user, not yet multi-user.

See [TESTING.md](./TESTING.md) to run and test everything, including a 5-minute demo script for judges.
