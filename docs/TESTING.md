# SmartPM — Running & Testing Guide

Everything you need to run the system, verify each feature, and demo it to judges.

---

## 1. Prerequisites (one-time)

```bash
# 1. Pull the local models (Ollama must be installed & running)
ollama pull qwen2.5:3b
ollama pull nomic-embed-text

# 2. Install dependencies
cd ai-service && pip install -r requirements.txt && cd ..
cd server && npm install && cd ..
npm install                       # frontend (run from smartpm/)

# 3. Set up env + database (from server/)
cd server
cp .env.example .env              # skip if .env already exists
npm run db:migrate
npm run db:seed                   # safe to re-run; skips if already seeded
cd ..

# 4. AI service env (from ai-service/)
cd ai-service && cp .env.example .env && cd ..   # skip if .env exists
```

## 2. Run it — 4 processes

Open **4 terminals**, one command each, leave them running:

| # | Terminal | Command | URL |
|---|---|---|---|
| 1 | Ollama | (usually already running as a service) — verify with `ollama list` | :11434 |
| 2 | AI service | `cd ai-service` → `python -m uvicorn main:app --port 5001` | :5001 |
| 3 | Backend | `cd server` → `npx tsx src/index.ts` | :4000 |
| 4 | Frontend | `npm run dev` (from `smartpm/`) | :5173 |

Then open **http://localhost:5173**.

**Seeded logins** (password for all: `smartpm123`):
- Supervisor: `supervisor` — sees everything (incl. Approvals, Settings)
- Technicians: `dewi`, `budi`, `sari`, `agus`, `rizky`, `andi`

### Quick health check
```bash
curl http://localhost:5001/health        # AI service — shows active provider/models
curl http://localhost:4000/api/health     # backend — {"ok":true}
```

## 3. Automated tests

```bash
cd server
npm test        # 25 tests (Vitest + Supertest)
```

These stub the HTTP call to the AI service, so **no model or Python is needed** — they exercise the real
DB logic, auth, role gating, threshold routing, the assistant tool loop, procurement grouping, and the
report/insights endpoints end-to-end through the API. You can also typecheck with `npx tsc --noEmit`.

## 4. Manual test — the golden path (proves it's real)

1. **Log in** as `dewi` (technician).
2. Go to **Checksheets** → pick **CNC Mill #3** → mark one point **Fail** → category **"Damaged part"** →
   pass the rest → **Submit**.
   - ✅ A toast confirms submission + "1 part request drafted".
   - ✅ Success screen shows the AI-drafted vendor email.
3. **Refresh the browser** (Ctrl+R) → go to **Dashboard**.
   - ✅ The new checksheet is there, charts updated — **it survived the reload** (real persistence).
4. Log out, log in as `supervisor`.
5. **Approvals** → the new request is "Needs approval" (it's above the Rp 500.000 threshold).
   - Click **Approve & send** → ✅ toast, status flips to Sent.
6. **AI Search** → search *"spindle lubrication problems on the CNC mill"*.
   - ✅ Your just-submitted checksheet is retrieved and summarized — RAG is live, not canned.

## 5. Feature-by-feature checklist

| Feature | Where | What to verify |
|---|---|---|
| Auth + roles | Login / Sidebar | Technician has no Approvals/Settings nav; supervisor does. |
| Digital checksheet | Checksheets | Can't submit until every point is answered and each failure categorized. |
| Agentic drafting | Approvals | Email references real recurrence + cost; below threshold auto-sends, above waits. |
| **AI Search** | AI Search | Natural-language query returns findings + a summary + per-record "why it matched". |
| **Assistant** | Assistant | Ask *"what keeps breaking down?"* → tool chips appear under the answer. |
| **Predictive PM** | Predictive PM | Recurring points (2+ failures) listed with High/Medium urgency + a recommendation. |
| **Smart procurement** | Approvals → "Draft consolidated POs" | Vendors with 2+ pending items get one combined PO email. |
| **Shift report** | Shift Report → Generate | Stat grid + AI headline/summary/highlights/recommendation. |
| **AI provider toggle** | Settings | Flip Local ↔ Gemini; status badge + active model update live. |
| **Approval threshold** | Settings | Change it → Approvals header + auto-send behavior reflect the new value. |
| Charts / toasts | Dashboard / everywhere | Donut + severity bars; toasts on submit/approve/reject/settings. |

## 6. API smoke tests (optional, via curl)

```bash
# Log in and keep the cookie
curl -s -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "content-type: application/json" -d '{"username":"supervisor","password":"smartpm123"}'

# Each AI feature:
curl -s -b cookies.txt http://localhost:4000/api/insights                         # predictive PM
curl -s -b cookies.txt http://localhost:4000/api/procurement/consolidations        # smart procurement
curl -s -b cookies.txt http://localhost:4000/api/report                            # shift report
curl -s -b cookies.txt -X POST http://localhost:4000/api/search \
  -H "content-type: application/json" -d '{"query":"belt problems"}'               # RAG search
curl -s -b cookies.txt -X POST http://localhost:4000/api/assistant \
  -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"what keeps breaking down?"}]}'         # assistant

# Switch AI engine at runtime:
curl -s -b cookies.txt -X POST http://localhost:4000/api/settings \
  -H "content-type: application/json" -d '{"chatProvider":"gemini"}'
```

## 7. Optional: run the AI on Gemini (higher quality)

1. Get a key: https://aistudio.google.com/apikey
2. Edit `ai-service/.env`: set `GEMINI_API_KEY=<key>` (leave `AI_EMBED_PROVIDER=ollama`).
3. Either restart the AI service, **or** just flip the toggle in **Settings → AI engine → Gemini** (Node
   passes the provider per request, so no restart is needed once the key is present).
4. Keep Ollama running — it still serves embeddings for search.

> Note: with Gemini, finding/machine data leaves the laptop for Google's cloud. Fine for dev; a
> data-governance decision for a real rollout. The local option keeps everything air-gapped.

## 8. Suggested 5-minute demo script (for judges)

1. **(30s) Frame it.** "PTMI verifies preventive maintenance daily. Today it's paper. SmartPM digitizes
   the whole loop and adds AI that reasons over the data — and it runs entirely offline on this laptop."
2. **(60s) Submit a checksheet** as a technician, fail a "Damaged part" point. Show the AI-drafted vendor
   email on the success screen. **Refresh** to prove persistence.
3. **(45s) Approvals** as supervisor: approve it; show the cost-gating ("below Rp 500k auto-sends").
   Then hit **"Draft consolidated POs"** to show the procurement agent batching a vendor's requests.
4. **(45s) Assistant:** ask *"what keeps breaking down and what should I do?"* — point out the tool chips
   proving it queried live data, not hallucinated.
5. **(30s) Predictive PM + Shift Report:** show the recurring-failure recommendation and one-click report.
6. **(30s) Settings:** flip **Local → Gemini** live. "Runs air-gapped for data sovereignty, or on the cloud
   for quality — one toggle."
7. **(20s) Close:** "Every decision that must be correct — approvals, costs, recurrence — is computed in
   code. The model only writes the prose. So it's safe to actually deploy."

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Frontend loads but data is empty / 500s | Backend (4000) not running, or DB not seeded (`npm run db:seed`). |
| AI features return template-y / generic text | AI service (5001) or Ollama (11434) is down — Node fell back to deterministic output. Check `curl :5001/health`. |
| "Gemini (no API key set)" in Settings | Add `GEMINI_API_KEY` to `ai-service/.env` and restart the AI service. |
| Search returns "No findings indexed yet" | Submit a checksheet with a failure first (embeddings are written on submit). |
| Port already in use | Find the PID (`netstat -ano | findstr :4000`) and stop it, or restart that terminal. |
