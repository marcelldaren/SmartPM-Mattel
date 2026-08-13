# SmartPM — Tester Guide

Hi, and thanks for testing this.

**SmartPM** is a preventive-maintenance system for a factory (PT Mattel Indonesia).
Technicians inspect machines and fill in a digital checksheet instead of paper. When
something is broken, the system drafts a purchase email to the supplier, decides whether
it's cheap enough to send automatically, and several AI features sit on top to check the
work and spot patterns.

You don't need to install anything. Just open the link below in any browser.

---

## Getting in

**URL:** `https://revision-granted-statutes-pasta.trycloudflare.com`

> ⚠️ This link is temporary and only works while my laptop is on and running the app.
> If you get "site can't be reached", message me — I'll send a new link (the address
> changes every time I restart it).

**Logins** — password is `smartpm123` for all of them:

| Username | Role | What they can do |
|---|---|---|
| `supervisor` | Supervisor | Everything — approve purchases, change settings |
| `budi` | Technician | Fill in checksheets only |
| `dewi` | Technician | Fill in checksheets only |

Start as **`supervisor`**. Log out and back in as `budi` later to test the permission rules.

---

## If you only have 5 minutes

Do these four things — they cover the most interesting parts:

1. **Dashboard** — look at the four machine tiles at the top. Note the colours.
2. **Checksheets** — fill one in, mark something as failed, attach a photo, submit. Watch
   what the AI says about your photo.
3. **Approvals** — look for the amber "Review flagged an issue" badge on one of the cards.
4. **Assistant** — ask it `what keeps breaking?`

Then come back for the rest if you have time.

---

## Full test checklist

Tick things off as you go. For each one I've written **what should happen** — if you see
something different, that's a bug worth telling me about.

### 1. Dashboard

- [ ] Log in as `supervisor`. You land on the Dashboard.
- [ ] **Top section — plant floor map.** Four machine tiles on a dark blueprint background,
      each with a coloured light.
      - **Green** = healthy
      - **Amber** = has an open problem
      - **Red** = maintenance overdue, or a serious fault
      - *Expected:* Conveyor Line 7 shows **red** and says "Overdue by 4 days". Only the
        amber and red lights should pulse — green stays still.
- [ ] **Two round gauges** on the right (Compliance / Approved) — they should look like
      speedometer dials, not progress bars.
- [ ] Scroll down — recent checksheets, open findings, approval queue. Numbers should be
      consistent with each other.

### 2. Fill in a checksheet (the core flow)

- [ ] Go to **Checksheets**.
- [ ] Pick a machine (e.g. *CNC Mill #3*) and a technician (e.g. *Budi Santoso*).
- [ ] The inspection points load. Mark **point 1 as Fail**, everything else **Pass**.
- [ ] A category dropdown appears — choose **"Damaged part"**.
- [ ] *Expected:* a note appears saying a vendor part request will be drafted automatically.
- [ ] Click **Submit checksheet**.
- [ ] *Expected:* a success screen showing what passed/failed, and the part request created.
- [ ] **Important test — press F5 to hard-refresh the browser.** Go back to the Dashboard.
      Your checksheet should still be there. *(This proves it's saved in a real database,
      not just held in the browser.)*

### 3. AI photo verification ⭐ *the most interesting one*

When you attach a photo to a broken part, an AI looks at the actual image and checks
whether it matches the problem you selected.

- [ ] Start a new checksheet. Mark a point as **Fail**, category **"Damaged part"**.
- [ ] Click **"Attach evidence photo"** and pick **any photo from your computer or phone** —
      a photo of your desk, your cat, anything. It doesn't need to be a machine.
- [ ] Mark the rest Pass, then **Submit**.
- [ ] *Expected:* "Verifying photo…" for a few seconds, then a badge appears:
      - 🟢 **AI-verified** — the photo matches
      - ⚪ **AI: uncertain** — can't tell from this photo
      - 🟠 **AI: needs a second look** — doesn't seem to match
- [ ] With a random photo (your desk, your cat) you should get 🟠 or ⚪ — **not** green.
- [ ] **Click the badge.** It expands to show what the AI actually saw and why it decided
      that. Read it — it should describe *your specific photo*, not generic text.

> This is the thing I'd most like feedback on. Does the description actually match your
> photo? Does the verdict seem fair?

### 4. Approvals + the email self-review

Every purchase email is drafted by one AI, then **checked by a second AI** before a human
sees it.

- [ ] Go to **Approvals**. You should see several pending requests.
- [ ] Look under the machine name on each card for a small badge:
      - **AI-reviewed** (grey) = the second AI found no problems
      - **Review flagged an issue** (amber) = it found something wrong
- [ ] Find a card with the amber badge and scroll down inside it — it lists the specific
      problem, e.g. *"cost mismatch: draft says Rp 1.085.000, actual is Rp 1.850.000"*.
- [ ] *Expected:* even on a flagged card, **Approve and Reject are both still clickable.**
      The AI is a warning, not a lock. Confirm you can still click either.
- [ ] Click **Show full email** on any card to read the drafted email.
- [ ] Click **Approve & send** on one.
      - *Expected:* status changes to sent. **No real email is sent** — I've turned email
        off for testing, so it's a simulated send. That's intentional, not a bug.

### 5. Smart procurement

If two purchases go to the same supplier, the AI merges them into one order.

- [ ] Still in **Approvals**, look at the top for a **Smart procurement** panel.
- [ ] Click **Draft consolidated POs**. Wait ~15 seconds.
- [ ] *Expected:* one combined email per supplier, listing several items and a total cost.
      There should be at least two suppliers with multiple pending items.

### 6. AI Search

- [ ] Go to **AI Search**.
- [ ] Type: `what's been wrong with CNC Mill #3?` → Search.
- [ ] *Expected:* a written summary, then a list of matching records, each with a
      one-line reason why it matched.
- [ ] Now try nonsense: `banana ice cream`.
- [ ] *Expected:* it says nothing was found — it should **not** invent an answer.

### 7. Assistant (the chatbot)

- [ ] Go to **Assistant**.
- [ ] Ask: `what keeps breaking?`
- [ ] *Expected:* before the written answer, you see a **"TOOLS RUN"** strip and a data
      panel — actual database rows, not just text. The little icon on the chip should match
      the icon on the panel below it.
- [ ] Ask: `give me a status update on CNC Mill #3`
- [ ] *Expected:* a machine card with numbers (open findings, pending parts, next PM date).
- [ ] Ask: `what can you do?`
- [ ] *Expected:* it answers in plain language **without** running any tool.

### 8. Predictive PM + scheduling proposals

- [ ] Go to **Predictive PM**.
- [ ] Bottom section: inspection points that have failed repeatedly, ranked.
- [ ] Top section: **Scheduling recommendations**. Click **Propose changes**, wait ~10s.
- [ ] *Expected:* a card proposing a new maintenance date, e.g. `19 Jul 2026 → 26 Jun 2026`
      with a "23 days earlier" chip.
- [ ] Read the **"How this date was calculated"** line — it explains the maths in plain
      English (how often it breaks vs how often it's serviced).
- [ ] Click **Approve & reschedule**.
- [ ] *Expected:* a **schedule change log** at the bottom of that panel gains a new line
      showing the old date → new date and who changed it. That's a real change to the
      machine's record.

### 9. Shift Report

- [ ] Go to **Shift Report** → generate.
- [ ] *Expected:* a headline, summary, highlights, and one recommended action — all
      referencing real numbers. Compare them against the Dashboard; they should match.

### 10. Permissions (please actually test this)

- [ ] Log out. Log back in as **`budi`** (password `smartpm123`).
- [ ] *Expected:* the **Approvals** and **Settings** menu items are **gone**.
- [ ] Go to Checksheets — Budi's name should be locked in as the technician (no dropdown).
- [ ] *Expected:* a technician cannot approve purchases anywhere.

### 11. Settings (supervisor only)

- [ ] Log back in as `supervisor` → **Settings**.
- [ ] You'll see the AI engine toggle (Local / Gemini) and the auto-approve threshold.
- [ ] *Expected:* it currently says **Gemini**.

> 🚫 **Please don't switch it to Local.** The local AI model runs on my laptop and is much
> slower, and photo verification stops working entirely on it. Feel free to look, just
> don't change it.

---

## Known limitations — please DON'T report these

These are already known and deliberate. You're not finding a bug:

- **Emails aren't really sent.** Turned off on purpose for this test. Approving shows a
  simulated send.
- **The "General photos" box** (lower down the checksheet page) is fake — it only stores a
  filename. The *real* photo upload is the one **inside the amber block** next to a failed
  point. It's labelled "not AI-checked" to make the difference clear.
- **The AI can be slow** — 5–20 seconds for anything AI-related. It's calling a real model
  over the internet.
- **"Needs lubrication" photo checks are unreliable.** Brown grease looks like rust in
  photos and the AI struggles to tell them apart. Known weakness.
- **Some dates are in 2026.** The demo data is set in the future on purpose.
- **Everything runs on my laptop.** If it suddenly stops working, I've probably closed
  something. Just message me.

---

## What I'd love feedback on

1. **Does the photo verification actually work on your photos?** Take a few different ones
   — something clearly broken, something totally unrelated, something blurry. Does the AI's
   description match what's really in the picture?
2. **Is anything confusing?** Especially: could you tell what the badges meant without me
   explaining?
3. **Did anything crash, hang, or show an error?** Screenshot it if so.
4. **Does it feel like a real tool** or like a demo? Be honest.

---

## Reporting a problem

Send me:
- Which page you were on
- What you clicked
- What happened vs what you expected
- A screenshot if you can

Thanks — this really helps.
