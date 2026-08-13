# SmartPM — Full Build & Simulation Guide

**PT Mattel Indonesia (PTMI) — Digital Preventive-Maintenance (PM) Verification Platform**

This document exists for one purpose: so you can explain and demo this project confidently
for your Mattel bootcamp competition, without needing to re-read code. It covers three
things, in order:

1. **What was built** — every feature, in plain language.
2. **How it actually works** — frontend, backend, AI service, database, and how they talk
   to each other.
3. **How to test every feature**, step by step, with exact click paths and what result to
   expect — written so you can use it live as your simulation script.

---

## Part 1 — The elevator pitch (say this first)

> "SmartPM digitizes preventive-maintenance inspections on the plant floor. Technicians
> fill in a digital checksheet instead of paper. When something's broken, the system
> doesn't just log it — it drafts a vendor part-request email, decides whether it's cheap
> enough to auto-send or needs supervisor approval, then has a *second* AI check that
> email before a human sees it. If the technician attached a photo, a vision model checks
> the photo actually matches the fault they reported. And when an inspection point keeps
> failing, the system proposes a concrete new maintenance date that a supervisor can apply
> with one click. On top of that, agents search records, consolidate purchase orders, and
> answer questions in plain English. It runs entirely on this laptop — no cloud required —
> but can switch to Google's Gemini API live, with one click, for stronger output."

**The line that separates this from a demo:** every AI feature here is *advisory*. Not one
of them can change a price, a date, an approval, or a routing decision. Those are all plain
`if` statements in Node. The AI writes sentences and raises flags; a human or a
deterministic rule decides.

---

## Part 2 — The architecture (how it works end to end)

### 2.1 The four processes

SmartPM is **four separate programs** running at once on localhost, each with one job:

```
┌─────────────────┐      ┌──────────────────┐      ┌───────────────────┐      ┌─────────────┐
│  Vite + React    │      │  Node / Express   │      │  Python / FastAPI  │      │   Ollama    │
│  (port 5173)     │─────▶│  (port 4000)       │─────▶│  (port 5001)       │─────▶│  (port      │
│                  │ /api │                    │ HTTP │                    │ HTTP │  11434)     │
│  What the user   │      │  Database, auth,   │      │  Stateless AI:     │      │  Runs the   │
│  sees & clicks   │      │  business rules,   │      │  turns facts into  │      │  actual     │
│                  │      │  every "must be    │      │  prose/vectors,    │      │  local LLM  │
│                  │      │  correct" decision │      │  nothing else      │      │  (qwen2.5)  │
└─────────────────┘      └──────────────────┘      └───────────────────┘      └─────────────┘
                                                              │
                                                              ▼ (or, if switched)
                                                     ┌───────────────────┐
                                                     │  Google Gemini API │
                                                     │  (cloud)           │
                                                     └───────────────────┘
```

### 2.2 The one rule that shapes everything

**Node owns every decision that has to be correct. Python only writes prose.**

Concretely: Node decides *whether a part request auto-approves* (comparing real cost
against a real threshold in the database), *which findings count as recurring* (counting
real rows, 2+ occurrences), *who is allowed to approve a request* (role check), and *what
data exists at all*. Python never touches the database — it only receives facts Node
already computed, and turns them into a summary, an email, or a recommendation.

**Why this matters for your presentation:** it means the AI can be wrong, slow, or
completely offline, and the app still works correctly — it just degrades to a
plain-template answer instead of an AI-written one. This is the single most defensible
engineering decision in the project when a judge asks "what if the model hallucinates?"

### 2.3 Backend (Node / Express) — what it actually contains

- **Database:** SQLite (file at `server/data/smartpm.db`), accessed via Node's built-in
  `node:sqlite` + Drizzle ORM (no external DB server, no Docker).
- **Auth:** JWT stored in an httpOnly cookie. Two roles: `supervisor` and `technician`.
  Middleware `requireAuth` / `requireRole('supervisor')` gates every sensitive route.
- **Every API route**, grouped by what they do:

  | Route | Method | Gated to | Purpose |
  |---|---|---|---|
  | `/api/auth/login`, `/api/auth/logout`, `/api/me` | POST/GET | anyone / logged-in | session |
  | `/api/machines`, `/api/technicians` | GET | logged-in | picklists for the checksheet form |
  | `/api/checksheets` | POST | logged-in | submit a checksheet → creates findings + part requests |
  | `/api/dashboard` | GET | logged-in | aggregate stats for the home screen |
  | `/api/part-requests` | GET | logged-in | approval queue |
  | `/api/part-requests/:code/approve` `/reject` | POST | **supervisor** | approve/reject a drafted email |
  | `/api/search` | POST | logged-in | AI Search (RAG) |
  | `/api/insights` | GET | logged-in | Predictive-PM agent |
  | `/api/procurement/consolidations` | GET | **supervisor** | Smart-procurement agent |
  | `/api/assistant` | POST | logged-in | Conversational assistant (tool-calling agent) |
  | `/api/report` | GET | logged-in | AI shift report |
  | `/api/settings` | GET/POST | logged-in / **supervisor** to change | AI provider toggle + threshold |
  | `/api/checksheets/:code/verifications` | GET | logged-in | photo-verification results (polled after submit) |
  | `/api/pm-recommendations` | GET | logged-in | PM rescheduling proposals + schedule change log |
  | `/api/pm-recommendations/generate` | POST | **supervisor** | run detection → propose new PM dates |
  | `/api/pm-recommendations/:id/approve` `/dismiss` | POST | **supervisor** | apply / discard a proposal |

### 2.4 Database schema (SQLite via Drizzle)

```
vendors            — id, name, email
users              — id, username, password_hash, display_name, role[supervisor|technician], vendor_id
machines           — id, slug, name, code, area, pm_interval_label, last_pm_date, due_label, due_tone,
                      next_pm_due_date            ← the real next PM date; only an approved proposal writes it
checklist_items    — id, machine_id, label, hint, sort_order      (the inspection points per machine)
checksheets        — id, code (CS-####), machine_id, technician_user_id, work_order_code,
                      status[Complete|Flagged|Pending Approval], submitted_at, is_seed
checksheet_answers — id, checksheet_id, checklist_item_id, result[pass|fail], category
findings           — id, checksheet_id, checklist_item_id, machine_id, title, item_label,
                      category, severity[High|Medium|Low], created_at
part_catalog       — id, category, part_name, typical_cost_idr
part_requests      — id, code (PR-###), finding_id, checksheet_id, machine_id, vendor_id,
                      part_name, cost_idr, status[pending|auto|sent|rejected],
                      email_subject, email_body, drafted_by[template|agent], note,
                      created_at, sent_at, is_seed,
                      review_ok, review_issues, review_model, reviewed_at   ← email self-review
record_embeddings  — id, entity_type[checksheet|finding], entity_id, embedding (vector blob),
                      model_name, created_at        ← powers AI Search
app_settings       — key/value store: approval_threshold_idr, chat_provider
photo_verifications — id, checksheet_id, finding_id, checklist_item_id, item_label, category,
                      photo_name, status[pending|done|skipped|failed], verdict, description,
                      reasoning, note, model, provider, created_at, completed_at
pm_recommendations — id, machine_id, checklist_item_id, item_label, occurrences, avg_gap_days,
                      current_interval_days, suggested_interval_days, current_due_date,
                      suggested_due_date, days_earlier, basis, action, rationale,
                      status[pending|approved|dismissed], created_at, decided_at, decided_by_user_id
pm_schedule_changes — id, machine_id, recommendation_id, previous_due_date, new_due_date,
                      changed_by_user_id, changed_at        ← audit trail for real date changes
```

Everything a technician submits becomes real rows in these tables — it survives a
hard refresh, a laptop restart, everything. That's the proof this isn't a mockup anymore.

### 2.5 The AI service (Python / FastAPI)

Lives in `ai-service/`. It has **no database connection at all** — every endpoint takes
JSON in, returns JSON out. It talks to whichever LLM is configured (Ollama locally, or
Gemini) through a single unified client, because both expose an OpenAI-compatible
`/v1/chat/completions` API — same code path, just a different base URL and key.

| Endpoint | Called by | Job |
|---|---|---|
| `/health` | Settings screen | reports which provider/model is active, whether Gemini key is present |
| `/embed` | on every checksheet submit | text → vector (always the local model — see 2.6) |
| `/draft` | part-request flow | writes one vendor email |
| `/search` | AI Search | summarizes retrieved findings + justifies each match |
| `/analyze-trends` | Predictive-PM | explains a recurrence pattern + recommends an action |
| `/consolidate-po` | Smart-procurement | drafts one merged PO email per vendor |
| `/assistant/plan` | Conversational assistant | **one reasoning step**: given the conversation + tool list, decide next tool call or final answer |
| `/report` | Shift Report | turns today's numbers into an executive summary |
| `/vision/verify` | photo verification | multimodal: does this photo match the claimed fault? |
| `/draft/review` | email self-review | grades a drafted email against the facts Node computed |
| `/recommend-pm` | PM rescheduling | phrases a new PM date that Node already calculated |

Every one of these returns **empty/null on failure** (bad JSON, model down, etc.) — by
design, so Node can detect that and fall back to a deterministic template. Nothing ever
throws a 500 to the user because the AI had a bad day.

### 2.6 Embeddings vs chat — why they're pinned differently

The **chat model** (the one writing prose) is switchable live between Local and Gemini.
The **embedding model** (the one turning text into vectors for search) is **always the
local model**, regardless of the chat switch. Reason: every stored vector must come from
the same model, or cosine-similarity comparisons become meaningless — apples vs oranges.
Switching the embedding model would require re-running the seed/re-embedding everything.
This is a deliberate constraint, not a bug — good to mention if asked "why can't I switch
embeddings too?"

### 2.7 The part-request flow (the clearest example of the Node/Python split)

1. Technician submits a checksheet with a failing item categorized "Damaged part" or
   "Needs replacement."
2. **Node** (not AI) looks up: the vendor for that machine, a typical cost from
   `part_catalog`, and whether this inspection point has failed before (recurrence).
3. **Node** compares the real cost to the real threshold from `app_settings` and decides
   `status = 'auto'` (auto-approved) or `'pending'` (needs supervisor sign-off). This is a
   plain `if` statement — not the model's call.
4. **Python** is handed those already-decided facts and asked only to *write the email*
   (subject + body) — it cannot change the status, cost, or vendor.
5. If Python fails, Node has a plain-template email ready so the request is never blocked.

---

## Part 3 — Every feature, in detail, with how to test it

Prerequisites for all tests: all four services running (Ollama tray app, `ai-service` on
:5001, `server` on :4000, frontend on :5173). Easiest way: double-click
**`start-smartpm.bat`** in the project root — it starts everything, health-checks all four,
and opens the browser. Then log in at **http://localhost:5173**.

**Seeded logins** (password `smartpm123` for all):
- Supervisor: `supervisor`
- Technicians: `budi`, `sari`, `agus` (vendor: Tristar), `dewi`, `rizky`, `andi` (vendor: Apex)

**Seeded machines:** CNC Mill #3 (MC-104), Injection Molder A2 (MC-221), Conveyor Line 7
(MC-317), Packaging Robot B1 (MC-412).

---

### Feature 1 — Digital Checksheet (the data-entry foundation)

**What it is:** replaces a paper PM inspection form. Pick a machine, tick pass/fail for
each inspection point, categorize any failure, attach a real evidence photo to the failed
point, submit.

**Note on photos — there are two separate things on this screen:**
- **Per-failed-checkpoint photo** (inside the amber block, next to the category dropdown) —
  a *real* file upload. The image is downscaled to 1024px in the browser, sent as base64,
  and checked by a vision model (Feature 11).
- **"General photos"** card lower down — still mocked metadata only (filename + fake size),
  and labelled *"not AI-checked"* in the UI so the distinction is visible during a demo.

**How to test:**
1. Log in as a technician (e.g. `budi`).
2. Go to **Checksheet** → select a machine, e.g. *CNC Mill #3*.
3. Mark every item "Pass" except one — mark it "Fail" and choose category
   **"Damaged part"**.
4. Submit.
5. **Expected result:** a toast confirms submission. A new finding and a part request are
   created behind the scenes (see Feature 5). Go to **Dashboard** — the new checksheet
   appears in the recent list immediately.
6. **Persistence check (important for judges):** hard-refresh the browser (Ctrl+R). The
   checksheet is still there — proof it's a real database, not client-side state.

---

### Feature 2 — Dashboard

**What it is:** at-a-glance plant status: today's checksheet count, status breakdown
(Complete/Flagged/Pending Approval), open findings by severity, and the approval queue —
plus two charts (donut + bar) rendered from the same live numbers.

**How to test:**
1. Go to **Dashboard** after doing Feature 1's submission.
2. **Expected result:** the stat cards and both charts reflect the new checksheet/finding
   immediately — no manual refresh of "seed data" needed, because it's querying the real
   table.

---

### Feature 3 — AI Search (RAG)

**What it is:** natural-language search across every checksheet/finding ever submitted.
Not keyword matching — real embeddings + cosine similarity + an LLM-written summary.

**How it works technically:** every checksheet/finding gets embedded into a vector
**the instant it's submitted** ("embed on write"). When you search, Node embeds your
query, computes cosine similarity against every stored vector, takes the top matches, and
sends *only those* to the model to summarize and justify — the model never sees or
invents anything outside that candidate set (Node double-checks the returned sheet IDs are
real).

**How to test:**
1. Go to **AI Search**.
2. Type: `what's been wrong with CNC Mill #3?` (or the machine you just submitted a
   finding for).
3. **Expected result:** a written summary plus a list of matching checksheets/findings,
   each with a one-line reason it matched. The checksheet you just submitted in Feature 1
   should appear — proof search is live, not canned/seeded.
4. **Edge case to demo:** search for something nonsensical (`banana ice cream`) —
   expect "No matching maintenance records found" rather than a hallucinated answer.

---

### Feature 4 — Predictive-PM Agent (Insights screen)

**What it is:** the reliability agent. Node scans the database for inspection points that
have **failed 2+ times on the same machine**, ranks urgency in code (3+ occurrences =
High, else Medium), and the model explains the pattern and recommends whether to bring
the next PM date forward.

**How to test (to actually trigger a recurrence, since it needs 2+ occurrences):**
1. Log in as a technician, submit a checksheet on **CNC Mill #3** with the *same*
   inspection item failing (e.g. "Spindle" / whatever item you choose), category
   "Damaged part".
2. Submit a second checksheet on the same machine, same item, failing again.
3. Go to **Predictive PM**.
4. **Expected result:** an entry for that machine/item showing occurrence count, latest
   category, and an AI-written recommendation (e.g. "bring PM forward by N days").
5. **Fallback to show if asked "what if AI is down?":** stop the Python service, refresh
   the screen — you still get the recurrence list and urgency ranking (that part is
   pure Node), just with a generic templated note instead of an AI paragraph.
6. **This screen now also proposes an actual new PM date** you can approve — see
   **Feature 13**, which sits in the panel at the top of this same screen.

---

### Feature 5 — Smart Procurement (inside Approvals)

**What it is:** if two or more pending part requests target the **same vendor**, Node
groups them and the model drafts **one consolidated purchase-order email** instead of
several separate ones — saving the vendor and the supervisor from email spam.

**How to test:**
1. Log in as `supervisor`.
2. Go to **Approvals** — you should already have seeded pending requests to see the
   panel; if not, submit 2 checksheets as different technicians of the *same* vendor
   (e.g. `dewi` and `rizky`, both Apex) with a "Damaged part"/"Needs replacement" finding
   each, above the auto-approve threshold.
3. **Expected result:** the **Smart Procurement** panel shows a single draft email listing
   all line items for that vendor and the total cost.
4. Note: this is a *proposal* — approving/rejecting the underlying individual requests
   still goes through the normal Approvals flow; the consolidation is a drafting
   convenience, not a bypass.

---

### Feature 6 — Approvals + auto-approval threshold

**What it is:** the enforcement point for the cost rule. Requests under the threshold
(default Rp 500.000, configurable in Settings) auto-send; everything else needs a
supervisor to approve or reject.

**How to test the threshold, both sides:**
1. As `supervisor`, go to **Settings**, note the current threshold (default 500,000).
2. Submit a checksheet whose implied part cost is **below** it → check **Approvals**: the
   request should already show as auto-approved/sent, no action needed.
3. Submit one that's **above** it → check **Approvals**: it sits as pending, with
   **Approve**/**Reject** buttons (supervisor-only — a technician login won't see them).
4. Click **Approve** → toast confirms, status flips to sent.
5. Click **Reject** on another → status flips to rejected, no email considered sent.
6. **Real email:** when SMTP is configured in `server/.env` (see **Feature 10**),
   approving — or an auto-send — delivers an actual branded HTML email to the vendor's
   address. With SMTP left blank it stays a simulated send (status flips, nothing leaves
   the laptop); the app behaves identically either way.
7. **Each card also carries a self-review badge** (grey *AI-reviewed* or amber *Review
   flagged an issue*) — see **Feature 12**.
7. **Role-gate check:** log in as a technician and open Approvals — approve/reject controls
   should not be available (route is `requireRole('supervisor')` server-side too, not just
   hidden in the UI).

---

### Feature 7 — Conversational Assistant (the tool-calling agent)

**What it is:** the most "agentic" feature. You ask a question in plain English; the model
can call up to 4 tools against the *real* database, chain them (up to 4 steps), and then
answer — Node executes every tool, Python only decides which one to call and when to stop.

**The 4 tools it can use:**
- `search_records` — semantic search (same engine as Feature 3)
- `list_recurring_issues` — same data as Feature 4
- `get_machine_status` — health snapshot for one machine by name/code
- `list_pending_part_requests` — same data as Feature 6's queue

**It answers in UI, not just text.** Every tool call returns structured rows from the
database, and the chat renders them as real components above the written answer — a
machine-health card with stat tiles and severity chips, a recurrence list with occurrence
badges, an approval queue with per-line costs and a computed total, search hits with
sheet-ID chips. The prose is the summary; the panels are the evidence, straight from the
database rather than re-parsed out of the model's sentences. Panels are collapsible.

**How to test:**
1. Go to **Assistant**.
2. Ask: `what keeps breaking?` → expect it to call `list_recurring_issues` and answer
   citing real machine/item names.
3. Ask: `what's the status of CNC Mill #3?` → expect `get_machine_status` to fire, citing
   real open findings/pending requests for that machine.
4. Ask: `what parts are waiting on approval right now?` → expect
   `list_pending_part_requests`.
5. Ask something about "you": `what can you do?` → it should answer directly, in plain
   language, **without** calling any tool (this is instructed in its system prompt).
6. **Fallback to demonstrate:** on the local 3B model, tool-calling is best-effort — if it
   doesn't call a tool cleanly, the assistant still returns a plain RAG search answer
   rather than an empty response. Switching to Gemini (Feature 9) makes tool-calling
   reliable every time — good side-by-side demo.

---

### Feature 8 — AI Shift Report

**What it is:** one click aggregates the day's real numbers (checksheets completed today,
findings by severity, recurring-failure count, total pending part-request value) and the
model writes an executive headline, 2–3 sentence summary, 3–4 highlight bullets, and one
recommended next action.

**How to test:**
1. Do a few of the above actions first (submit checksheets, create findings) so there's
   real data for the day.
2. Go to **Shift Report** → generate.
3. **Expected result:** a headline, summary, highlights, and a recommendation, all
   referencing the actual numbers you just created (e.g. "3 checksheets today, 8 findings,
   Rp X pending"). Compare the shown stat grid against what you know you just did — they
   should match exactly (that grid is computed by Node, not the model).

---

### Feature 9 — AI Provider Toggle (Local ⇄ Gemini) + Settings

**What it is:** switch the entire chat/reasoning layer between the local Ollama model
(`qwen2.5:3b`, private, free, slower/terser) and Google's Gemini API
(`gemini-3.5-flash`, needs an API key, faster/more fluent, reliable tool-calling) —
**live, no restart**, from one screen.

**How to test:**
1. Log in as `supervisor` → **Settings**.
2. You should see: current AI provider (Local/Gemini), live AI-service reachability
   status, and whether a Gemini key is present.
3. Click the **Gemini** card to switch.
4. **Expected result:** immediately, no restart — repeat Feature 3 (Search) or Feature 7
   (Assistant) and notice the prose is noticeably more fluent/consistent, and numbers in
   text are formatted correctly (the local 3B model occasionally garbles large Rupiah
   figures in prose, e.g. adding a stray digit — the *stored* number is always correct in
   the database either way, only the model's sentence can be off).
5. Switch back to **Local** → confirm it still works (proves this isn't a one-way flag).
6. Also test the **auto-approval threshold** input on this same screen: change it, submit
   a checksheet whose cost sits right at the new boundary, confirm Approvals reflects the
   new cutoff.

**Where the key itself lives:** `ai-service/.env` → `GEMINI_API_KEY=...`. Not visible
anywhere in the UI or committed to the repo history going forward — the toggle only flips
a stored preference (`ollama`/`gemini`), never handles the key value itself.

---

### Feature 10 — Real vendor email delivery (SMTP)

**What it is:** approving a part request (or an auto-send below the threshold) sends an
actual branded HTML email to the vendor — not a simulation.

**How it works:** `server/src/email/mailer.ts` uses nodemailer, opt-in via env vars. The
HTML is built in `server/src/email/template.ts` from **Node's database row**, never
re-parsed out of the model's text — so the machine, part, and cost a vendor reads are
always the stored ones. Every interpolated value is HTML-escaped, because the email body is
model-generated text and must never be trusted as markup.

**Setup** (`server/.env`):
```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-16-char-app-password    # Gmail App Password, not your login password
SMTP_FROM=your@gmail.com
```

**How to test:**
1. With SMTP filled in, approve a pending request in **Approvals**.
2. **Expected:** a real email arrives at the vendor address, with the PTMI header bar, an
   approval badge, the prose, and a "Request Summary" table.
3. **Leave `SMTP_USER`/`SMTP_PASS` blank** → the same click still works, status still flips
   to sent, nothing leaves the laptop. Good fallback to demo.

> If asked why a mail failure can't break a submission: `sendMail()` returns `false` on any
> error and never throws. A dead mail server degrades the feature, it doesn't block a
> checksheet.

---

### Feature 11 — AI Photo Verification (multimodal)

**What it is:** when a technician attaches a photo to a failed checkpoint, a vision model
checks whether the photo actually supports the fault category they chose. It catches a
technician picking the wrong category, or photographing the wrong thing.

**Three outcomes, not two** — and this is the part worth emphasising:

| Badge | Meaning |
|---|---|
| **AI-verified** (green) | the photo matches the claim |
| **AI: uncertain** (grey) | the photo can't confirm or deny it — blurry, bad angle, or a fault a photo simply cannot show, like a noise or a calibration issue |
| **AI: needs a second look** (amber) | what's visible appears to contradict the claim |

**How it works:** one multimodal call carries the image inline as base64 (Gemini's
OpenAI-compatible `image_url` part — no upload step, no second provider), plus the claimed
category and machine name. The prompt forces a **two-step shape**: describe what is
literally visible *first*, then judge — with `description` placed first in the required
JSON key order, so the model must generate its observation before it can name a verdict.
Each category carries explicit visual criteria (cracks and deformation for *Damaged part*;
dry, bare, rusted contact faces for *Needs lubrication*).

**It never blocks anything.** Rows are written as `pending` synchronously, the submission
response goes out, *then* the model runs un-awaited. The success screen polls until it
resolves.

**How to test:**
1. **Checksheets** → machine + technician → mark point 1 **Fail** → category **"Damaged part"**.
2. Click **"Attach evidence photo"**, pick `ai-service/testphoto/photo1.jpeg` (a clean,
   undamaged bearing). Mark the rest Pass → **Submit**.
3. **Expected:** *"Verifying photo…"* for a few seconds, then amber **"AI: needs a second
   look"** — because that bearing isn't damaged. Click the badge to read the model's own
   description and reasoning.
4. Repeat with `photo3.jpeg` (a badly frayed conveyor belt) + **"Damaged part"** → green
   **AI-verified**. Same app, same flow, opposite answer, decided purely by the image.
5. **Provider check:** switch to Local in Settings and submit again → no verdict, message
   *"Visual verification requires the Gemini engine."* Ollama's bundled models are text-only.

**To prove it isn't hardcoded** (a judge will ask):
```
cd ai-service
python test_vision.py testphoto/photo3.jpeg --sweep
```
`--sweep` runs the *same* image against all six categories. A model that just echoed the
label back would return "Consistent" every time. It doesn't — the frayed belt returns
*Consistent* for "Damaged part" but *Possible mismatch* for "Needs lubrication", reasoning
that it is *"structural wear rather than a lack of lubrication."*

**Honest limitation, state it before they find it:** the *"Needs lubrication"* category is
the weakest. It has returned Consistent for both a bone-dry bearing and a heavily greased
one. Brown grease reads as rust in photographs — a genuinely hard call a human hesitates on
too.

---

### Feature 12 — Vendor Email Self-Review

**What it is:** after the first AI drafts a vendor email, a **second, separate AI call**
grades it before a supervisor ever sees it. It checks three things: right machine and
finding; the cost in the text matches what Node computed; and the email is professional and
complete (part named, a clear ask, a sign-off).

**Why a separate call:** asking one model to write *and* grade its own output in a single
pass produces self-congratulatory reviews. A fresh call with no memory of composing the
text is an actual check.

**The cost rule is the important bit:** Node passes the authoritative cost in, and the
reviewer is explicitly forbidden from recomputing it. Its only cost job is textual — does
the wording state that same number? Formatting differences (`Rp 480.000` vs `IDR 480,000`)
are correctly ignored.

**Advisory, never a gate.** Grey *AI-reviewed* if clean, amber *Review flagged an issue*
with the specific problem listed if not. Approve and Reject stay enabled either way.

**How to test:**
```
cd ai-service
python test_review.py
```
Seven deliberately broken drafts against a fixed cost of Rp 2.400.000. The two that matter:

- **Case 2** — cost transposed to `Rp 2.040.000` (two digits swapped) → **caught**:
  *"cost mismatch: draft says Rp 2.040.000, actual is Rp 2.400.000"*
- **Case 7** — cost written `IDR 2,400,000` → **passes**, no false alarm

Catching an obvious error is easy. Catching a two-digit swap *while not* panicking over
formatting is what shows it is genuinely comparing values.

In the UI: **Approvals** → each card shows its badge under the recurrence note; a flagged
one expands to the specific issue beneath the email preview.

---

### Feature 13 — PM Rescheduling Proposals (Predictive PM, part 2)

**What it is:** Feature 4 tells you something keeps breaking. This proposes **a concrete
new maintenance date**, and approving it really changes the machine's schedule.

**The heuristic — plain arithmetic, no model involved:**

> An inspection point fails on average every **N** days. PM runs every **M** days. If
> N is smaller than M, maintenance is arriving *after* the failure has already happened.
> Reschedule at **80%** of the observed failure interval — floor of 7 days, never tighter
> than that; capped at the current interval, since a tighter cycle than the failures
> warrant is just wasted labour.

All of that lives in `server/src/pm/schedule.ts` — pure functions, no database access,
**12 unit tests**. The AI is handed the finished date and asked only to phrase it. It
cannot pick or change a date.

**How to test the full loop:**
1. **Predictive PM** → the **"Scheduling recommendations"** panel at the top.
2. Click **"Propose changes"** (supervisor only), wait ~10s.
3. **Expected:** a card showing `19 Jul 2026 → 26 Jun 2026`, a **23 days earlier** chip, the
   AI's sentence, and a **"How this date was calculated"** line containing Node's own
   arithmetic — so a supervisor can verify the number without trusting the model.
4. Click **Approve & reschedule**.
5. **Confirm it's a real database change**, not a status flag:
   ```
   cd server
   node -e "const {DatabaseSync}=process.getBuiltinModule('node:sqlite');const db=new DatabaseSync('./data/smartpm.db');console.log(db.prepare('SELECT name,last_pm_date,next_pm_due_date FROM machines').all())"
   ```
   `next_pm_due_date` goes from `null` to the new date. The panel's **schedule change log**
   also gains a line naming who changed it and when.
6. **Dismiss** on another proposal → status changes, schedule provably untouched.

**Fail-open demo (strong for judges):** stop the Python service and click *Propose
changes*. It returns **zero proposals** with the reason *"AI service unavailable — no
recommendation generated this cycle."* No crash, and critically **no wrong date**. For a
system that alters maintenance schedules, producing nothing is the correct failure mode — a
hallucinated date on a factory floor is worse than no suggestion at all.

---

### Feature 14 — Visual identity (industrial control-room UI)

Worth 20 seconds in a demo, because judges see this before they hear anything.

- **Plant floor map** — the dashboard opens with four machine tiles on a blueprint grid,
  each with a status LED. Green = nominal, amber = open finding, **red = PM overdue or a
  High-severity finding**. Only amber and red pulse, so movement always means "look here".
  Status is derived from real data — Conveyor Line 7 shows red off its actual
  *"Overdue by 4 days"*.
- **Gauge KPIs** — compliance and approval rate render as 240° instrument dials with tick
  rings, not progress bars.
- **Custom machine icons** — hand-drawn line-art SVGs for CNC mill, injection molder,
  conveyor, and robot arm, reused across the dashboard, checksheet, and search results so a
  machine is recognisable by shape before its name is read. Not stock icons.
- **Typography** — Barlow (a grotesk derived from public-signage lettering) for UI, IBM
  Plex Mono for every data readout: machine codes, sheet IDs, currency, timestamps.
- **Palette** — deep blueprint navy `#0F2A38`, blueprint blue `#156082`, safety-signage
  amber `#E97132`, safety red `#C1342B`, LED green `#1F8A4C`.

---

## Part 4 — Quick-start (for a live simulation, no Claude Code needed)

**Easiest:** double-click **`start-smartpm.bat`** in the project root. It starts anything
that isn't already running, health-checks all four services, and opens the browser. Leave
the four windows open for the whole demo.

**Manually**, three terminals after Ollama's tray app is already running:

```powershell
# Terminal 1 — AI service
cd ai-service
python -m uvicorn main:app --port 5001

# Terminal 2 — Backend
cd server
npm run dev

# Terminal 3 — Frontend
npm run dev
```

Open **http://localhost:5173**. First-time setup (installs, migration, seed) only needs to
happen once — see `README.md` if starting from a completely fresh checkout.

> **Before presenting:** the photo-verification and email-review features call Gemini, which
> costs credit per call and needs internet. Run your demo checksheets the night before —
> the verdicts are stored in the database, so on stage you are reading saved rows. Do one
> live call for the wow moment, not ten. If the venue wifi dies, badges simply read
> "Not verified" and everything else keeps working.

---

## Part 5 — Anticipated judge questions (and the honest answer)

- **"What happens if the model hallucinates or lies?"** — It can't invent data: every AI
  endpoint receives facts Node already fetched/decided and can only phrase them. Search
  results are filtered back down to only real sheet IDs; approval status is a Node `if`
  statement; the PM date comes from `src/pm/schedule.ts`; the email cost comes from the
  parts catalogue. The model is never the source of a number.
- **"So what does the AI actually decide?"** — Wording, and flags. That's it. Three
  features (photo verification, email self-review, PM proposals) are pure advisory signals
  a human acts on. None of them can change a price, a date, an approval, or a routing rule.
- **"Isn't the photo check just echoing the label back?"** — Run
  `python test_vision.py <photo> --sweep`: the same image against all six fault categories.
  An echoing model returns "Consistent" six times. This one gives different verdicts per
  category, and explains why. It also answers *"uncertain"* when a photo genuinely can't
  settle the question — 8 of 24 test runs.
- **"Why two AI calls for one email?"** — Because a model grading text it just wrote gives
  itself a pass. The reviewer is a separate call with no memory of drafting. It caught a
  two-digit cost transposition (`2.400.000` → `2.040.000`) in testing, while correctly
  *not* flagging `IDR 2,400,000` as wrong.
- **"What if the AI service crashes?"** — Every Node call has a null-safe wrapper. Most
  features fall back to a deterministic template. The PM-rescheduling agent deliberately
  does the opposite: it produces **nothing** rather than a templated date, because a wrong
  maintenance date is worse than no suggestion.
- **"Why not use LangChain/CrewAI?"** — Deliberately not used. These agent behaviours don't
  need a chain framework's abstraction overhead; a direct OpenAI-compatible client call is
  less surface area to get wrong and easier to explain in a demo.
- **"Does this need the cloud?"** — No. Everything runs locally on Ollama by default. The
  one exception is photo verification: Ollama's bundled models are text-only, so that
  feature requires Gemini and says so plainly rather than failing oddly. A local
  vision model (`qwen2.5-vl`, `llava`) would close that gap at the cost of accuracy.
- **"Is this production-ready?"** — It's a real working local system (real DB, real auth,
  real AI, real email) intentionally scoped to single-laptop use for this phase. Known
  limitations, all documented rather than hidden: the "General photos" card is still mocked
  metadata (per-checkpoint evidence photos are real); single-user JWT auth with no session
  store; the *"Needs lubrication"* visual criteria are unreliable; and photo verification
  costs Gemini credit per call.
- **"Why Python for AI and not just JS?"** — Team's stronger AI experience is in Python;
  since both Ollama and Gemini expose the same OpenAI-compatible REST API, the language
  boundary is just an HTTP call — no capability is lost, and it let the AI layer be
  written by whoever knows AI/Python best.

---

## Part 6 — Test suite

```
cd server && npm test        # 37 tests: API integration + PM date arithmetic
```

The AI boundary and SMTP are mocked, so the suite runs with no Ollama, no Python service,
and no network. What it actually exercises is the deterministic half — cost lookup,
threshold comparison, role gating, cosine retrieval, the assistant's tool loop, procurement
grouping, and all 12 PM-scheduling cases.

Worth knowing this exists if a judge asks how you know the rules are right: the parts that
must be correct are the parts under test, and they're testable precisely *because* the AI
isn't involved in them.

---

*Companion docs: `README.md` (setup), `docs/OVERVIEW.md` (shorter feature summary),
`docs/TESTING.md` (automated test suite + curl smoke tests).*
