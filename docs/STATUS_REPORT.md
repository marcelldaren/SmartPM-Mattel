# SmartPM — Project Status Report

*Generated 11 Aug 2026 against the running local stack (Vite 5173 · Node 4000 · Python 5001 · Ollama 11434).*

This is a **point-in-time snapshot** compiled for updating the presentation deck. Everything
below was verified against the actual source, the running application, and the SQLite
database — not against the README or existing docs, some of which are stale (noted in
section 5). No code was changed to produce it.

Two headline caveats before you read on:

- **There is no git repository** in this project, so there is no commit count or first-commit
  date (section 3 explains the proxy used instead).
- **SMTP is now live** in `server/.env`, which invalidates one of the previously documented
  limitations.

---

## 1. Feature completion status

| Feature | Status | Evidence |
|---|---|---|
| Photo verification (Gemini vision) | **Working but untested** | 16 completed verification rows in DB |
| Self-critique on vendor emails | **Working but untested** | 12 of 23 part requests carry a review verdict |
| Predictive PM → schedule change | **Fully working and tested** | 12 automated tests + 1 API test |
| Scan-to-digital paper checksheet | **Working, untested on real input** | Passes on synthetic sheets only |
| Warehouse + stock-aware routing | **Fully working and tested** | 9 automated tests; both routes proven live 11 Aug |

### Photo verification

`server/src/ai/vision.ts`, `server/src/db/repo/photoVerifications.ts`, migrations 0001 +
0004, `src/components/VerificationBadge.jsx`.

Fires after checksheet submit but is deliberately **not awaited**, so a slow model never
blocks a technician on the plant floor. 16 verdicts stored: 8 *Consistent*, 6 *Possible
mismatch*, 2 *Uncertain* — the model does disagree with technicians, which is the entire
point of the feature.

Thumbnails were added later (migration 0004), so only 1 of 16 rows has one; the other 15
predate it. `ai-service/test_vision.py` exists but is a manual harness, not part of
`npm test`.

### Self-critique on drafted vendor emails

`server/src/ai/agent.ts` → `reviewDraft()`, migration 0002, `src/components/ReviewBadge.jsx`.

Strictly **advisory** — it cannot change cost, status, or routing. Correctly skipped when
the draft came from the template fallback, since there would be nothing to review it
against. Surfaces as the "AI-reviewed" chip on every vendor card in Approvals.

### Predictive PM → proposed schedule change

`server/src/ai/pmProposals.ts`, `server/src/pm/schedule.ts`, migration 0003, tables
`pm_recommendations` + `pm_schedule_changes`, four endpoints,
`src/screens/InsightsScreen.jsx`, `src/components/PmRecommendations.jsx`.

**The best-tested code in the project.** `schedule.test.ts` covers 12 cases including the
interval floor, insufficient history, unparseable interval labels, and measuring against an
already-approved date. `/api/insights` returned a real narrative when called live.

### Scan-to-digital paper checksheet

`ai-service/scan.py`, `server/src/ai/scan.ts`, `POST /api/checksheets/scan`,
`src/components/ScanChecksheet.jsx`, `templates/pm-checksheet-print.html` + `.pdf`.

The full pipeline works: blur gate (rejects before spending an API call) → contour detection
→ perspective correction → Gemini extraction → validation against the real catalogue in
Node. Proven on three synthetic sheets with controlled ground truth — clean 12/12, hard
12/12, blurry correctly rejected with no API call.

**`ai-service/testphoto/real/` does not exist.** The pipeline has never read a genuine
photographed sheet. This is the one claim not to make on stage.

### Warehouse spare-parts inventory + stock-aware routing

Migration 0005 (three tables: `warehouse_parts`, `internal_pull_requests`,
`stock_movements`), `server/src/db/repo/warehouse.ts`, four endpoints,
`src/screens/InventoryScreen.jsx`, `src/components/StockLevel.jsx`, plus two assistant tools.

17 parts tracked, 4 out of stock, 9 pull requests spanning all three states. Both routes
demonstrated live on 11 Aug via CS-2071 — in-stock resolved to IPR-107 (bin C1-07),
out-of-stock fell through to a drafted vendor email.

Covered by 9 tests in `warehouse.test.ts`, added on 11 Aug alongside the fix for the
substitution defect described in [section 5](#resolved-during-this-review).

---

## 2. Core AI features, re-confirmed

All six are working. Three have changed materially since they were first built.

| Feature | Working | Changed since built? |
|---|---|---|
| RAG search | Yes | No |
| Agentic part-request drafting | Yes | **Yes — significantly** |
| Predictive-PM detection | Yes | Detection unchanged; proposal layer added on top |
| Smart-procurement consolidation | Yes | No |
| Conversational assistant | Yes | **Yes** |
| AI shift report | Yes | No |

**Part-request drafting** changed the most. It no longer runs unconditionally. A
deterministic SQL stock check now runs *first* in Node, and the vendor path is entered only
when nothing can be pulled from a bin. It also gained the self-critique pass. The
approval-threshold logic underneath is untouched.

**The conversational assistant** gained `check_part_stock` and `list_pending_pickups`, and
`list_pending_part_requests` was narrowed to vendor requests only. That last change was a
correctness fix, not a feature: once some findings began resolving as internal pulls, the
question *"what parts are outstanding?"* was silently returning half the answer.

---

## 3. Real numbers

### Automated tests — 46, all passing

Run on 11 Aug: 4 files, 46 tests, 3.84s, zero failures.

| File | Tests | Covers |
|---|---|---|
| `api.test.ts` | 21 | auth, machines, submission + threshold, role gating, settings, shift report, search, insights, procurement, assistant |
| `schedule.test.ts` | 12 | PM proposal date maths |
| `warehouse.test.ts` | 9 | stock matching scope, reservations, level thresholds |
| `text.test.ts` | 4 | HTML stripping |

**Coverage gap worth knowing:** grepping the suite for `scan`, `vision`, `review`, and
`critique` returns **zero matches**. Three of the five features in section 1 — photo
verification, email self-critique, and the scan pipeline — have no automated tests at all.

### Project size

Excluding `node_modules`, `dist`, `.vercel`, `__pycache__`, and `package-lock.json`.

| Language | Files | Lines |
|---|---|---|
| JSX | 29 | 5,878 |
| TypeScript | 60 | 5,643 |
| Python | 7 | 2,250 |
| HTML | 2 | 1,682 |
| SQL (migrations) | 6 | 319 |
| JS | 4 | 294 |
| CSS | 1 | 168 |
| **Code total** | **109** | **16,234** |
| Markdown + JSON | 11 | 2,345 |
| **Grand total** | **120** | **18,579** |

### API surface and data

- **28 endpoints** across 14 route modules (27 unique paths; `/api/settings` has both GET
  and POST).
- **18 database tables**, 6 migrations applied.
- 33 checksheets, 36 findings, 24 checklist items across 4 machines, 7 users.

### Project age — no git available

This directory is **not a git repository** — there is no `.git`, so there is no commit count
and no first-commit date.

The only honest proxy is file modification times: earliest source file **21 Jul 2026**,
latest **8 Aug 2026** — an **18-day span across 6 active working days** (21 Jul, 27 Jul,
4 Aug, 6 Aug, 7 Aug, 8 Aug).

> Treat that as approximate — OneDrive sync can rewrite timestamps. For the deck, phrase it
> as *"about three weeks"* rather than quoting a precise figure that can't be defended.

---

## 4. Golden-path timing — measured

Scripted with Playwright against the live stack, driving a real Chrome instance. Supervisor
throughout, so no login cost lands inside the measurement. Each stage is timed from the
click to the moment the real data is on screen. Two runs:

| Stage | Run 1 | Run 2 |
|---|---|---|
| Submit → confirmation on screen | 4.41s | 2.38s |
| Dashboard shows the new sheet | 0.10s | 0.10s |
| Approvals shows the drafted request | 0.16s | 0.17s |
| AI Search returns it | 0.83s | 0.82s |
| **Total system time** | **5.49s** | **3.46s** |

**The number to quote: under 6 seconds, typically 3–5.**

Stage 1 is the only variable one — it contains the Gemini drafting call, the self-critique
pass, the warehouse lookup, and embedding generation. Stages 2 and 3 land at ~0.1s because
the work already happened at submit time; they are plain database reads. Stage 4 at 0.8s is
a live embed + cosine search + Gemini synthesis.

Suggested framing:

> *"A technician taps Submit and the vendor email is drafted, reviewed, cost-checked, routed,
> and searchable in about four seconds."*

Human fill-in time is excluded — that is typing speed, not system latency.

---

## 5. Known limitations, re-confirmed

### Resolved since last documented

- ~~"Photo evidence is mocked (fake filename/size, no real file storage)"~~ — **no longer
  true.** Per-item evidence photos now carry real image bytes, go to Gemini vision, and a
  ~10 KB thumbnail is persisted so a supervisor can audit the verdict against the actual
  photo. `README.md:146` and `docs/OVERVIEW.md:97` are stale on this point.
- ~~"Vendor email sending is a simulated send"~~ — **no longer true.** `SMTP_HOST`,
  `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` are all set and active in `server/.env`.
  Approving a request now sends real branded HTML mail via nodemailer.

### Still true

- **Output quality tracks the model.** The local 3B model is terse and can garble numbers in
  prose; the *stored* data is always correct in Node. Currently pointed at Gemini.
- **Single-laptop auth** — stateless JWT cookie, no session store. Fine for one concurrent
  user, not a multi-user deployment.
- **The "General photos" card is still mocked.** Checksheet-level photos are collected in UI
  state and never included in the submit payload. Only per-item evidence photos are real.
- **Four of the five newer features have no automated tests** (see section 3).

### Resolved during this review

- ~~"Warehouse fallback matches the wrong part"~~ — **fixed 11 Aug.** `findAvailableStock`
  was allowing a part pinned to one inspection point to satisfy a finding on a *different*
  point of the same machine, whenever the correct part was out of stock. A row's reach is
  now taken from how it was catalogued: pinned to a point serves that point only; pinned to
  a machine with no point serves any point on it; pinned to neither serves anything. Covered
  by `warehouse.test.ts`, whose regression case fails against the old query.
  <br>**Residue:** the two pull requests created by the old behaviour — **IPR-104** and
  **IPR-106**, both reserving a Way Cover Wiper Set against *"Tool changer alignment"* — are
  still open, and between them they reserve 2 of the 3 wiper sets on the shelf. They appear
  in `demo-screenshots/approvals.png`. Cancelling them would release that stock; they have
  been left in place because the screenshots reference them.

### New, introduced by the recent work

- **The checksheet form promises the wrong outcome.** It still reads *"A vendor part request
  will be drafted automatically on submit"* even when the part is in stock and will actually
  become an internal pull. The copy predates the warehouse feature.
- **The assistant renders raw markdown** — answers display literal `**bold**` markers and
  backticks instead of formatting.
- **AI Search rationales can contradict the record.** In `demo-screenshots/ai-search.png`,
  CS-2061 is returned as a match with the note *"Does not match the query…"* while its own
  title reads *"Damaged part — Roller bearings"*.
- **The scan pipeline has never read a real photograph.**

### Security items to settle before any public demo

- **Resolved.** Both seeded vendors previously carried a personal address, which any real
  send would reach and which was visible in the drafted-email screenshot. The shipped demo
  database now carries placeholder `.example` addresses, and `sendMail` redirects every
  message to `DEMO_VENDOR_EMAIL` when that variable is set — so the address that receives
  demo mail is supplied at deploy time and never stored in the repository.
- The **Gmail App Password is live and still unrotated** after being exposed previously.
  Rotate it at `myaccount.google.com/apppasswords`.
- `docs/TESTER_GUIDE.md:17` still lists a **dead Cloudflare tunnel URL**.

---

## 6. Demo flow sanity check

The assumed deck flow was **Checksheet(s) → Dashboard → Approvals → AI Search**. The actual
sidebar does not match that order.

| # | Label | Visible to |
|---|---|---|
| 1 | Dashboard | all |
| 2 | Checksheets | all |
| 3 | AI Search | all |
| 4 | Assistant | all |
| 5 | Predictive PM | all |
| 6 | Shift Report | all |
| 7 | Spare Parts | all |
| 8 | Approvals | supervisor only |
| 9 | Settings | supervisor only |

**Differences from the assumption:**

- Dashboard is **first**, not second.
- Approvals sits at **position 8**, not third — and is **hidden entirely from technicians**.
  If the demo runs as a technician, it will not be on screen at all.
- **Five screens exist that the four-step flow does not mention:** Assistant, Predictive PM,
  Shift Report, Spare Parts, Settings.

**Nothing has been renamed.** "Checksheets" (plural), "AI Search" and "Approvals" are as
expected. **"Spare Parts"** is the newest addition and the only nav label with no equivalent
in the assumed flow.

Note that Approvals and Spare Parts carry live count badges, which is why the sidebar in the
screenshots reads "Approvals 10" and "Spare Parts 5".

---

## Appendix — how this was produced

- Endpoint count, file/line counts, and nav order read directly from source.
- Test results from `npx vitest run` in `server/` on 11 Aug 2026.
- Feature evidence queried directly from `server/data/smartpm.db`.
- Timing measured with Playwright driving the installed Chrome against the live stack.
- Screenshots referenced above live in `demo-screenshots/` at the project root.

**Side effects of producing this report:** the two timing runs added **CS-2072** and
**CS-2073** to the database (the only way to obtain a real measurement). The screenshot run
earlier the same day added CS-2070, CS-2071 and IPR-105/106/107. No application code was
modified.
