"""
SmartPM AI service — FastAPI.

Stateless AI compute for the SmartPM backend: embeddings, agentic vendor-email drafting,
and RAG search synthesis. No database access; the Node backend owns persistence,
retrieval, and every correctness-critical decision (approval threshold, candidate
filtering). This service only turns facts into prose and vectors.

Run:  uvicorn main:app --port 5001
"""

from __future__ import annotations

import json

from dotenv import load_dotenv

load_dotenv()  # read ai-service/.env before importing the provider config

from fastapi import FastAPI  # noqa: E402

import llm  # noqa: E402
import scan  # noqa: E402
from schemas import (  # noqa: E402
    ConsolidateRequest,
    ConsolidateResponse,
    DraftRequest,
    DraftResponse,
    DraftReviewRequest,
    DraftReviewResponse,
    EmbedRequest,
    EmbedResponse,
    PlanRequest,
    PmRecommendRequest,
    PmRecommendResponse,
    PlanResponse,
    PlanToolCall,
    ReportRequest,
    ReportResponse,
    ScanExtraction,
    ScanPoint,
    ScanRequest,
    ScanResponse,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    TrendsRequest,
    TrendsResponse,
    TrendRecommendation,
    VisionVerifyRequest,
    VisionVerifyResponse,
)

app = FastAPI(title="SmartPM AI service", version="1.0.0")


@app.get("/health")
def health():
    return {"ok": True, **llm.provider_info()}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    return EmbedResponse(embedding=llm.embed(req.text))


@app.post("/draft", response_model=DraftResponse)
def draft(req: DraftRequest):
    """
    Compose a vendor part-request email. The approval status is decided by Node and
    passed in — this endpoint only phrases the request accordingly. Returns 200 with
    empty strings if the model can't produce valid JSON, letting Node fall back to its
    deterministic template.
    """
    approval = (
        f"automatically approved (below the Rp {req.thresholdIdr:,} threshold)".replace(",", ".")
        if req.status == "auto"
        else "awaiting supervisor approval before sending"
    )
    recurrence = req.recurrenceNote or "first occurrence recorded for this inspection point"
    cost_str = f"Rp {req.costIdr:,}".replace(",", ".")

    system = (
        "You are a maintenance procurement assistant for PT Mattel Indonesia (PTMI). "
        "You write concise, professional vendor part-request emails. "
        "Reply ONLY with a JSON object of the form "
        '{"subject": "...", "body": "..."}. '
        "The body must be plain text with real line breaks — never HTML tags. "
        "Keep the body under 120 words, factual, no exclamation marks, and sign it "
        '"SmartPM automated request • PT Mattel Indonesia (PTMI)".'
    )
    prompt = f"""Draft the email for this preventive-maintenance part request.

Vendor: {req.vendorName}
Machine: {req.machineName} (checksheet {req.checksheetCode})
Finding: {req.findingTitle} — inspection point "{req.itemLabel}"
Recurrence: {recurrence}
Requested part: {req.partName}
Estimated cost: {cost_str}
Needed by: {req.neededBy}
Approval: {approval}

Return the JSON object now."""

    data = llm.complete_json(
        system + llm.language_clause(req.lang), prompt, provider=req.provider, max_tokens=500
    )
    if not data or not isinstance(data.get("subject"), str) or not isinstance(data.get("body"), str):
        # Signal Node to use its deterministic fallback template.
        return DraftResponse(subject="", body="")
    return DraftResponse(subject=data["subject"].strip(), body=data["body"].strip())


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    """
    Summarize the retrieved maintenance findings and justify why each matched. Node has
    already done retrieval (embedding + cosine similarity); this only synthesizes. The
    model is told to reference only the sheet IDs provided — Node re-checks that too.
    """
    if not req.candidates:
        return SearchResponse(summary="No matching maintenance records found.", results=[])

    candidates_json = json.dumps([c.model_dump() for c in req.candidates], indent=2)
    valid_sheets = {c.sheet for c in req.candidates}

    system = (
        "You are a maintenance records analyst. You summarize patterns across the given "
        "findings and justify why each one matches the user's query. "
        "Reply ONLY with a JSON object of the form "
        '{"summary": "...", "results": [{"sheet": "<exact id>", "reason": "..."}]}. '
        "Use only the exact sheet IDs provided — never invent one."
    )
    prompt = f"""Query: "{req.query}"

Candidate findings (JSON):
{candidates_json}

Write a "summary" of the patterns across these findings, and for each candidate a
"reason" explaining why it matches the query. Return the JSON object now."""

    data = llm.complete_json(
        system + llm.language_clause(req.lang), prompt, provider=req.provider, max_tokens=900
    )

    if not data or not isinstance(data.get("summary"), str) or not isinstance(data.get("results"), list):
        # Deterministic fallback: still return every candidate with a generic reason.
        n = len(req.candidates)
        return SearchResponse(
            summary=f'{n} matching finding{"s" if n > 1 else ""} found for "{req.query}".',
            results=[
                SearchResultItem(sheet=c.sheet, reason="Matched by semantic similarity to the query.")
                for c in req.candidates
            ],
        )

    results: list[SearchResultItem] = []
    for item in data["results"]:
        if not isinstance(item, dict):
            continue
        sheet = item.get("sheet")
        reason = item.get("reason")
        if isinstance(sheet, str) and sheet in valid_sheets and isinstance(reason, str):
            results.append(SearchResultItem(sheet=sheet, reason=reason.strip()))

    # If the model dropped everyone (or filtering removed them all), fall back to generic reasons.
    if not results:
        results = [
            SearchResultItem(sheet=c.sheet, reason="Matched by semantic similarity to the query.")
            for c in req.candidates
        ]

    return SearchResponse(summary=data["summary"].strip(), results=results)


@app.post("/analyze-trends", response_model=TrendsResponse)
def analyze_trends(req: TrendsRequest):
    """
    Predictive-PM narrative. Node has already detected recurrence and ranked urgency; this
    only explains the pattern and recommends an action per item. Returns empty on failure
    so Node fills in its deterministic template.
    """
    if not req.stats:
        return TrendsResponse(summary="", recommendations=[])

    stats_json = json.dumps([s.model_dump() for s in req.stats], indent=2)
    system = (
        "You are a reliability engineer for PT Mattel Indonesia. You review inspection points "
        "that keep failing and recommend whether to bring preventive maintenance forward. "
        "Reply ONLY with a JSON object of the form "
        '{"summary": "...", "recommendations": [{"machine": "...", "item": "...", '
        '"action": "...", "rationale": "..."}]}. '
        "Use the exact machine and item names given. Plain text only."
    )
    prompt = f"""Recurring inspection failures (JSON):
{stats_json}

Write a short "summary" of what these recurrences imply for preventive maintenance, and for
EACH item a recommendation with a concrete "action" and a one-sentence "rationale".
Return the JSON object now."""

    data = llm.complete_json(
        system + llm.language_clause(req.lang), prompt, provider=req.provider, max_tokens=900
    )
    if not data or not isinstance(data.get("summary"), str):
        return TrendsResponse(summary="", recommendations=[])

    recs: list[TrendRecommendation] = []
    for r in data.get("recommendations", []) or []:
        if not isinstance(r, dict):
            continue
        try:
            recs.append(
                TrendRecommendation(
                    machine=str(r.get("machine", "")).strip(),
                    item=str(r.get("item", "")).strip(),
                    action=str(r.get("action", "")).strip(),
                    rationale=str(r.get("rationale", "")).strip(),
                )
            )
        except Exception:
            continue
    return TrendsResponse(summary=data["summary"].strip(), recommendations=recs)


@app.post("/consolidate-po", response_model=ConsolidateResponse)
def consolidate_po(req: ConsolidateRequest):
    """
    Draft ONE consolidated purchase-order email covering several pending part requests for
    the same vendor. Node decided the grouping and total; this only writes the email.
    """
    items_json = json.dumps([i.model_dump() for i in req.items], indent=2)
    total_str = f"Rp {req.totalCost:,}".replace(",", ".")
    system = (
        "You are a maintenance procurement assistant for PT Mattel Indonesia (PTMI). You write "
        "one consolidated purchase-order email covering multiple part requests for a single vendor. "
        "Reply ONLY with a JSON object of the form "
        '{"subject": "...", "body": "..."}. '
        "The body must be plain text with real line breaks (never HTML), list each part on its own "
        "line, state the total, and be signed "
        '"SmartPM automated request • PT Mattel Indonesia (PTMI)".'
    )
    prompt = f"""Vendor: {req.vendor}
Total estimated cost: {total_str}
Line items (JSON):
{items_json}

Draft the consolidated purchase-order email. Return the JSON object now."""

    data = llm.complete_json(
        system + llm.language_clause(req.lang), prompt, provider=req.provider, max_tokens=700
    )
    if not data or not isinstance(data.get("subject"), str) or not isinstance(data.get("body"), str):
        return ConsolidateResponse(subject="", body="")
    return ConsolidateResponse(subject=data["subject"].strip(), body=data["body"].strip())


@app.post("/assistant/plan", response_model=PlanResponse)
def assistant_plan(req: PlanRequest):
    """
    One reasoning step of the conversational agent. Node runs the loop and executes tools;
    this just asks the model, given the running transcript and tool catalog, for its next
    move — either tool calls or a final answer. Returns empty content on failure so Node
    can fall back to plain RAG search.
    """
    client, model = llm.chat_target(req.provider)

    # This endpoint receives a whole transcript rather than a system+prompt pair, so the
    # language instruction is appended to the leading system message instead. Copied, not
    # mutated in place: req.messages is reused across the tool loop's iterations and the
    # clause must not accumulate on each pass.
    messages = list(req.messages)
    clause = llm.language_clause(req.lang)
    if clause and messages and messages[0].get("role") == "system":
        first = dict(messages[0])
        first["content"] = f"{first.get('content', '')}{clause}"
        messages[0] = first

    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": llm.budget(req.provider, 800),
    }
    if req.tools:
        kwargs["tools"] = req.tools
        kwargs["tool_choice"] = "auto"

    try:
        resp = client.chat.completions.create(**kwargs)
    except Exception as exc:  # provider/tool-format error — let Node fall back
        print(f"assistant_plan error: {exc}")
        return PlanResponse(content=None, tool_calls=None)

    msg = resp.choices[0].message
    print(f"[llm raw] model={model} content={msg.content!r} tool_calls={msg.tool_calls!r}")
    tool_calls = None
    if getattr(msg, "tool_calls", None):
        tool_calls = [
            PlanToolCall(
                id=tc.id or f"call_{i}",
                name=tc.function.name,
                arguments=tc.function.arguments or "{}",
                extra_content=getattr(tc, "extra_content", None),
            )
            for i, tc in enumerate(msg.tool_calls)
        ]
    return PlanResponse(content=msg.content, tool_calls=tool_calls)


@app.post("/report", response_model=ReportResponse)
def report(req: ReportRequest):
    """
    Write an end-of-shift PM report from the day's aggregated numbers (computed by Node).
    Returns empty fields on failure so Node fills in its deterministic template.
    """
    data_json = json.dumps(req.data, indent=2)
    recurring_json = json.dumps([r.model_dump() for r in req.topRecurring], indent=2)
    system = (
        "You are a maintenance shift supervisor at PT Mattel Indonesia writing a concise "
        "end-of-shift preventive-maintenance report for plant management. "
        "Reply ONLY with a JSON object of the form "
        '{"headline": "...", "summary": "...", "highlights": ["...", "..."], "recommendation": "..."}. '
        "The summary is 2-3 sentences. highlights is 3-4 short bullet strings. "
        "recommendation is one concrete next action. Plain text only, no markdown or HTML."
    )
    prompt = f"""Shift metrics (JSON):
{data_json}

Top recurring inspection failures (JSON):
{recurring_json}

Write the report as the JSON object now."""

    data = llm.complete_json(
        system + llm.language_clause(req.lang), prompt, provider=req.provider, max_tokens=800
    )
    if not data or not isinstance(data.get("summary"), str):
        return ReportResponse(headline="", summary="", highlights=[], recommendation="")

    highlights = [str(h).strip() for h in (data.get("highlights") or []) if isinstance(h, (str, int, float))]
    return ReportResponse(
        headline=str(data.get("headline", "")).strip(),
        summary=str(data.get("summary", "")).strip(),
        highlights=highlights,
        recommendation=str(data.get("recommendation", "")).strip(),
    )


# --- Photo verification (multimodal) --------------------------------------------------

# Per-category visual criteria. A vague "does this match?" makes the model agreeable — it
# tends to rationalise whatever label it is given. Naming the specific physical evidence
# it should look for gives it something falsifiable to check the pixels against.
CATEGORY_CRITERIA = {
    "Damaged part": (
        "Look for visible cracks, fractures, chips, snapped or missing pieces, bent or "
        "deformed metal, shattered housings, or deep gouges in a surface."
    ),
    "Needs replacement": (
        "Look for advanced wear rather than one clean break: rounded or missing gear teeth, "
        "frayed belts or cables, stripped threads, deep pitting, perished or hardened rubber, "
        "or material visibly worn thin. Dirt, contamination, or a heavy coating of grease is NOT "
        "wear — if the underlying material is not visibly degraded, judge 'Possible mismatch'."
    ),
    "Needs lubrication": (
        "Look for evidence that lubricant is ABSENT or has failed: bare, dry, dull metal on the "
        "contact faces with no grease or oil film; rust or brown corrosion on the running surfaces; "
        "scoring, galling, or heat bluing; grease that has gone hard, crusted and cracked. "
        "IMPORTANT: a component visibly coated in fresh, wet, glossy grease is correctly lubricated. "
        "That is the healthy state and must be judged 'Possible mismatch', however messy it looks."
    ),
    "Misaligned": (
        "Look for parts sitting visibly off-axis: uneven gaps, a belt or chain riding off its "
        "pulley or sprocket, a skewed bracket or mounting, or two mating parts that do not sit "
        "square to one another. Judge alignment only against a clear reference that is fully "
        "visible in frame — a mating face, a shaft axis, a pulley rim. Components that are loose, "
        "stacked, or sitting on a rack rather than installed and running cannot be assessed for "
        "alignment; that is 'Uncertain'. Do not infer a tilt from perspective or camera angle."
    ),
    "Leak detected": (
        "Look for fluid that has ESCAPED from where it belongs: a wet trail running downward from a "
        "seal, joint, gasket or fitting; droplets forming or falling; liquid pooling below the "
        "component; staining that spreads out from one identifiable source. "
        "IMPORTANT: grease deliberately packed onto or around a bearing, chain, or gear is applied "
        "lubricant, not a leak. Judge that 'Possible mismatch' unless you can see fluid escaping "
        "from a sealed housing."
    ),
    "Abnormal noise / vibration": (
        "This is a symptom a still photo usually cannot show. Judge it Consistent only when there "
        "is clear secondary physical evidence — fretting or witness marks, loosened or backed-out "
        "fasteners, cracked or perished vibration mounts, or a visibly damaged rotating assembly. "
        "Otherwise 'Uncertain' is the correct verdict."
    ),
}

GENERIC_CRITERIA = (
    "Look for physical evidence on the component that would corroborate this specific claim, "
    "and say so plainly if the photo shows nothing relevant to it."
)

VISION_SYSTEM = """You are a maintenance-photo auditor for PT Mattel Indonesia (PTMI). A technician inspected a machine, marked one inspection point as FAILED, chose a finding category, and attached a photo as evidence. Judge whether the photo actually supports that claim.

Work in two steps, strictly in this order:

STEP 1 - OBSERVE. Describe only what you can literally see in the image: the object, its condition, surface texture, colour, wear, any fluid or breakage, plus the framing and image quality. 2-3 sentences. Describe the image on its own terms. Do NOT mention the claimed category in your description, and do NOT restate the technician's claim back as though it were something you observed.

STEP 2 - JUDGE. Only after writing that description, decide whether what you described supports the claim.

The verdict must be exactly one of:
- "Consistent" - what you observed matches the stated visual criteria for the claimed category.
- "Uncertain" - the photo can neither confirm nor deny the claim.
- "Possible mismatch" - what you observed appears to contradict the claim, or shows something clearly unrelated to it.

A component in good condition is evidence AGAINST the claim. Clean metal, intact surfaces, fresh wet grease, and normal service material (applied lubricant, paint, coolant film) are signs of a well-maintained machine, not defects. A well-serviced part often looks messy. When what you see is a component in sound condition, the correct verdict is "Possible mismatch" — do not hunt for a reading that makes the claim fit.

"Uncertain" is a correct and expected answer, not a failure to do your job. Choose it whenever:
- the image is blurry, dark, over-exposed, or framed too far away or too close to judge;
- the relevant component is not clearly visible or is obscured;
- the claimed category is not something a still photo can establish (a noise, a vibration, a calibration or sensor-reading problem).
Prefer "Uncertain" over a confident guess. Do not inflate confidence to seem useful.

Reply with ONLY a JSON object with exactly these keys in this order:
{"description": string, "verdict": string, "reasoning": string}
"reasoning" is 1-2 sentences explaining how your description led to your verdict."""


@app.post("/vision/verify", response_model=VisionVerifyResponse)
def vision_verify(req: VisionVerifyRequest):
    """
    Advisory check that a photo matches the finding category a technician claimed.

    One multimodal call carries the image inline plus the claim and its category-specific
    criteria. Never raises for model trouble: an unusable answer comes back as
    supported=True with verdict=None so Node can record "not verified" without ever
    interfering with the checksheet submission that triggered it.
    """
    if not llm.supports_vision(req.provider):
        return VisionVerifyResponse(
            supported=False,
            note="Visual verification requires the Gemini engine.",
        )

    criteria = CATEGORY_CRITERIA.get(req.category, GENERIC_CRITERIA)
    prompt = (
        f'Claimed finding category: "{req.category}"\n'
        f"Machine: {req.machineName}\n"
        f"Inspection point: {req.itemLabel}\n\n"
        f'Visual criteria for "{req.category}":\n{criteria}\n\n'
        "The technician's photo is attached. Describe what you see first, then judge it."
    )

    try:
        data, model = llm.complete_json_vision(
            VISION_SYSTEM + llm.language_clause(req.lang),
            prompt,
            req.imageBase64,
            req.mime,
            provider=req.provider,
        )
    except Exception as exc:  # provider/network/quota trouble
        print(f"[vision] call failed: {exc}")
        return VisionVerifyResponse(supported=True, note=str(exc)[:300])

    if not data:
        return VisionVerifyResponse(
            supported=True, model=model, note="Model did not return usable JSON."
        )

    # A missing verdict key means the answer was truncated or malformed — report that as
    # "not verified" rather than silently presenting it to a supervisor as "Uncertain",
    # which would attribute a judgement to the model that it never made.
    raw = str(data.get("verdict") or "").strip().lower()
    if not raw:
        return VisionVerifyResponse(
            supported=True,
            model=model,
            description=str(data.get("description", "")).strip() or None,
            note="Model response was incomplete — no verdict returned.",
        )

    # Otherwise normalise casing/wording; an unrecognised value falls to Uncertain, the
    # safe direction for an advisory signal.
    if raw.startswith("consistent"):
        verdict = "Consistent"
    elif "mismatch" in raw:
        verdict = "Possible mismatch"
    else:
        verdict = "Uncertain"

    return VisionVerifyResponse(
        supported=True,
        verdict=verdict,
        description=str(data.get("description", "")).strip() or None,
        reasoning=str(data.get("reasoning", "")).strip() or None,
        model=model,
    )


# --- Draft self-review ----------------------------------------------------------------

REVIEW_SYSTEM = """You are a quality reviewer for outgoing vendor emails at PT Mattel Indonesia (PTMI). Another AI drafted the email below. Your only job is to check that draft against the authoritative facts supplied with it, and against a short rubric.

CRITICAL: the cost given to you is the authoritative figure. The system already computed it from its own parts catalogue and it is final. You must NEVER recompute, estimate, question, or suggest a different cost. Your only cost check is textual: does the wording of the draft state that same amount? Formatting differences do not matter — "Rp 480.000", "Rp 480000", "IDR 480,000" and "Rp480.000" are all the same number and all correct.

Check exactly these three things:
1. CORRECT SUBJECT MATTER - does the draft reference the right machine, the right inspection point, and the right finding? Naming a different machine or a different fault is an issue.
2. COST STATED CORRECTLY - does the amount written in the draft match the authoritative cost? If the draft states a different number, that is an issue. If the draft states no cost at all, that is also an issue.
3. PROFESSIONAL AND COMPLETE - is the tone professional and businesslike, and is anything obviously missing: the requested part, a clear ask of the vendor (confirm availability, lead time, or similar), and a sign-off. Minor style preferences are NOT issues; only flag something a supervisor would genuinely want fixed before this went to a vendor.

Report only real problems. A clean, correct draft must return an empty issues list — do not invent nitpicks to seem thorough.

Write each issue as one short, specific sentence naming the discrepancy, for example:
"cost mismatch: draft says Rp 450.000, actual is Rp 480.000"
"wrong machine: draft says Conveyor Line 7, finding is on CNC Mill #3"
"no clear ask - the email never requests availability or lead time"

Reply with ONLY a JSON object:
{"reviewed_ok": true or false, "issues": ["...", "..."]}
reviewed_ok is true only when issues is empty."""


@app.post("/draft/review", response_model=DraftReviewResponse)
def draft_review(req: DraftReviewRequest):
    """
    Second-pass check on a drafted vendor email.

    Deliberately a separate call rather than an extra field on /draft: asking one model
    to both write and grade its own output in a single pass produces self-congratulatory
    reviews. A fresh call with no memory of composing the text is a real check.

    Advisory only. Node never routes, gates, or blocks on this result — see the caller.
    """
    cost_str = f"Rp {req.costIdr:,}".replace(",", ".")
    prompt = f"""AUTHORITATIVE FACTS (already computed by the system — treat as correct):
Vendor: {req.vendorName}
Machine: {req.machineName}
Checksheet: {req.checksheetCode}
Finding: {req.findingTitle} — inspection point "{req.itemLabel}"
Requested part: {req.partName}
Cost: {cost_str}   <-- the draft must state this amount

DRAFT UNDER REVIEW
Subject: {req.subject}

{req.body}

Review the draft now and return the JSON object."""

    data = llm.complete_json(
        REVIEW_SYSTEM + llm.language_clause(req.lang), prompt, provider=req.provider, max_tokens=600
    )
    if not data:
        # No usable answer: report a pass with no issues so the caller shows no badge
        # rather than a false alarm. Node treats a null/failed call the same way.
        return DraftReviewResponse(reviewed_ok=True, issues=[])

    raw_issues = data.get("issues") or []
    issues = [str(i).strip() for i in raw_issues if str(i).strip()][:6] if isinstance(raw_issues, list) else []

    # Trust the issue list over the boolean: models sometimes list problems and still
    # set reviewed_ok true. Any listed issue means the review did not pass.
    ok = bool(data.get("reviewed_ok")) and not issues
    return DraftReviewResponse(reviewed_ok=ok, issues=issues, model=llm.chat_target(req.provider)[1])


# --- Predictive-PM scheduling recommendation ------------------------------------------

PM_RECOMMEND_SYSTEM = """You are a reliability engineer for PT Mattel Indonesia (PTMI). The maintenance system has already analysed an inspection point that keeps failing and has already decided a revised preventive-maintenance date using its own arithmetic. Your job is ONLY to express that decision in language a shift supervisor can act on.

CRITICAL: every date and interval you are given is final and was computed by the system. Never propose a different date, never recompute an interval, and never suggest the numbers should be something else. If you state a date, it must be exactly the suggested date you were given.

Write two fields:
- "action": one imperative sentence telling the supervisor what to do, naming the machine and the new date. Under 25 words.
- "rationale": one or two sentences explaining why, grounded in the failure pattern you were given. Under 45 words.

Plain text only. No markdown, no bullet points, no exclamation marks.

Reply with ONLY a JSON object: {"action": "...", "rationale": "..."}"""


@app.post("/recommend-pm", response_model=PmRecommendResponse)
def recommend_pm(req: PmRecommendRequest):
    """
    Phrase a PM-rescheduling proposal whose dates Node already fixed.

    Returns empty strings when the model produces nothing usable. The caller treats that
    as "no recommendation this cycle" and creates no proposal at all — an unexplained
    schedule change is worse than no proposal.
    """
    prompt = f"""Machine: {req.machineName}
Inspection point: "{req.itemLabel}" (most recent finding: {req.category})
Times this point has failed: {req.occurrences}
Observed average interval between failures: {req.avgGapDays:.1f} days
Current PM cycle: every {req.currentIntervalDays} days
Next PM currently scheduled: {req.currentDueDate}

DECISION ALREADY MADE BY THE SYSTEM:
Revised PM cycle: every {req.suggestedIntervalDays} days
Revised next PM date: {req.suggestedDueDate}
That is {req.daysEarlier} day(s) earlier than currently scheduled.

Write the action and rationale for this decision now."""

    data = llm.complete_json(
        PM_RECOMMEND_SYSTEM + llm.language_clause(req.lang), prompt, provider=req.provider, max_tokens=500
    )
    if not data or not isinstance(data.get("action"), str) or not isinstance(data.get("rationale"), str):
        return PmRecommendResponse(action="", rationale="")
    return PmRecommendResponse(action=data["action"].strip(), rationale=data["rationale"].strip())


# --- Paper checksheet scanning (multimodal extraction) ----------------------------------

SCAN_SYSTEM = """You are a form-reading assistant for PT Mattel Indonesia (PTMI). You are given a photograph of a PAPER preventive-maintenance checksheet that a technician filled in by hand. Transcribe what is physically marked on that paper. You are a transcriber, not an inspector: you are reading pen marks, not judging machine condition.

Work in two steps, strictly in this order.

STEP 1 - READ THE HEADER. Find the handwritten Date and Technician name, and find which machine is indicated in the "Machine" row. That row lists every machine with a checkbox; exactly one is pre-filled (printed solid black) for that sheet. Report the machine whose box is marked.

STEP 2 - READ EACH INSPECTION ROW, top to bottom. Each row has the printed point name, then a "Pass" checkbox and a "Fail" checkbox. Below it sits a band of six printed finding-category checkboxes and a "Photo attached Yes/No" pair, which the technician only fills in when that row is marked Fail.

For every row report:
- result: "pass" if the Pass box is marked, "fail" if the Fail box is marked, "blank" if neither is marked.
- category: when the row is "fail", the ONE finding category whose box is marked. Use "blank" rows and "pass" rows to return null here. The category MUST be copied character-for-character from the category list supplied to you. Never invent a category and never paraphrase one.
- photoAttached: "yes", "no", or "blank".

HOW TO READ A CHECKBOX. A box counts as marked when it carries a deliberate pen stroke: a tick, a cross, a filled block, or a heavy scribble inside or across it. It is NOT marked when it is empty, holds only a faint smudge or crease shadow, or shows ink that clearly belongs to a neighbouring box. If both boxes in a pair look marked, or a mark straddles two boxes, report your best reading and set that field's confidence to "low".

CONFIDENCE. Every field carries a confidence of exactly "high" or "low".
- "high": the mark is unambiguous, or the box is plainly empty.
- "low": handwriting you had to guess at, a faint or partial mark, a mark touching two boxes, glare or shadow over the box, a torn or folded area, or anything you would want a human to look at again.
Use "low" freely. A field flagged low is shown to the technician for review, which is a useful outcome. A wrong field marked "high" is not.

Never guess to be helpful. "blank" and null are correct answers when nothing is marked.

Reply with ONLY a JSON object in exactly this shape:
{"technicianName": string|null, "technicianConfidence": "high"|"low", "date": string|null, "dateConfidence": "high"|"low", "machine": string|null, "machineConfidence": "high"|"low", "points": [{"label": string, "result": "pass"|"fail"|"blank", "resultConfidence": "high"|"low", "category": string|null, "categoryConfidence": "high"|"low", "photoAttached": "yes"|"no"|"blank"}]}

"label" must be copied character-for-character from the inspection-point list supplied for the machine you identified. Return one entry per printed row, in the order they appear on the page."""


def _scan_prompt(req: ScanRequest) -> str:
    catalogue = "\n\n".join(
        f'MACHINE "{m.name}" (code {m.code}) has exactly these {len(m.points)} inspection points, in order:\n'
        + "\n".join(f"  {i + 1}. {p}" for i, p in enumerate(m.points))
        for m in req.machines
    )
    lines = [
        "These are the ONLY machines that exist. Identify which one this sheet is for, then "
        "transcribe that machine's inspection points and no others.",
        "",
        catalogue,
        "",
        "These are the ONLY finding categories that exist. Copy one of these strings exactly, "
        "or return null:",
        "\n".join(f"  - {c}" for c in req.categories),
    ]
    if req.technicians:
        lines += [
            "",
            "Registered technician names (the handwritten name is usually one of these — use it "
            "to resolve unclear handwriting, but if what is written clearly is not on this list, "
            "report what you actually read and mark the confidence low):",
            "\n".join(f"  - {t}" for t in req.technicians),
        ]
    lines += ["", "The photographed checksheet is attached. Read the header first, then every row."]
    return "\n".join(lines)


@app.post("/scan/checksheet", response_model=ScanResponse)
def scan_checksheet(req: ScanRequest):
    """
    Read a photographed paper checksheet into structured JSON.

    Order matters: the cheap local image checks run first and can short-circuit, so an
    unusable photo never costs a multimodal API call. Nothing here decides anything —
    Node re-validates every returned string against the real catalogue before any of it
    reaches the form, and a technician confirms it after that.
    """
    if not llm.supports_vision(req.provider):
        return ScanResponse(
            supported=False,
            reason="provider",
            note="Scanning requires the Gemini engine.",
        )

    # --- Local image pipeline (blur gate -> page detect -> deskew) ---------------------
    try:
        prepared = scan.prepare(req.imageBase64)
    except scan.ScanImageError as exc:
        return ScanResponse(supported=True, reason="unreadable", note=str(exc))
    except Exception as exc:  # OpenCV surprise on an exotic frame — never 500 for this
        print(f"[scan] image preparation failed: {exc}")
        return ScanResponse(
            supported=True, reason="unreadable", note="Could not process that image."
        )

    if not prepared.ok:
        return ScanResponse(
            supported=True,
            reason=prepared.reason,
            note=prepared.note,
            blur=round(prepared.blur, 1),
            blurThreshold=prepared.blur_threshold,
        )

    diagnostics = dict(
        blur=round(prepared.blur, 1),
        blurThreshold=prepared.blur_threshold,
        deskewed=prepared.deskewed,
        width=prepared.width,
        height=prepared.height,
        processedImageBase64=prepared.image_base64 if req.returnProcessed else None,
    )

    # --- Extraction -------------------------------------------------------------------
    try:
        data, model = llm.complete_json_vision(
            # No language clause: this endpoint transcribes fixed printed strings that must
            # come back byte-identical to the catalogue. Translating them would break the
            # exact-match validation Node relies on.
            SCAN_SYSTEM,
            _scan_prompt(req),
            prepared.image_base64,
            "image/jpeg",
            provider=req.provider,
            max_tokens=3000,
        )
    except Exception as exc:
        print(f"[scan] call failed: {exc}")
        return ScanResponse(supported=True, reason="model", note=str(exc)[:300], **diagnostics)

    if not data:
        return ScanResponse(
            supported=True,
            reason="model",
            note="The model could not read this sheet into a usable result.",
            model=model,
            **diagnostics,
        )

    return ScanResponse(
        supported=True,
        ok=True,
        extraction=_coerce_extraction(data),
        model=model,
        **diagnostics,
    )


def _conf(value: object) -> str:
    """Anything that is not literally "high" is treated as low — the safe direction."""
    return "high" if str(value or "").strip().lower() == "high" else "low"


def _one_of(value: object, allowed: set[str], fallback: str) -> str:
    v = str(value or "").strip().lower()
    return v if v in allowed else fallback


def _coerce_extraction(data: dict) -> ScanExtraction:
    """
    Force the model's object into the response shape without rejecting the whole scan.

    A single malformed row should cost that row, not the other five — a technician can
    fill one field in far more easily than re-photograph the page.
    """
    points: list[ScanPoint] = []
    for raw in data.get("points") or []:
        if not isinstance(raw, dict):
            continue
        label = str(raw.get("label") or "").strip()
        if not label:
            continue
        result = _one_of(raw.get("result"), {"pass", "fail", "blank"}, "blank")
        category = str(raw.get("category") or "").strip() or None
        # A category on a passing row is a contradiction; drop it rather than carry a
        # finding the technician never claimed.
        if result != "fail":
            category = None
        points.append(
            ScanPoint(
                label=label,
                result=result,
                resultConfidence=_conf(raw.get("resultConfidence")),
                category=category,
                categoryConfidence=_conf(raw.get("categoryConfidence")),
                photoAttached=_one_of(raw.get("photoAttached"), {"yes", "no", "blank"}, "blank"),
            )
        )

    def text(key: str) -> str | None:
        return str(data.get(key) or "").strip() or None

    return ScanExtraction(
        technicianName=text("technicianName"),
        technicianConfidence=_conf(data.get("technicianConfidence")),
        date=text("date"),
        dateConfidence=_conf(data.get("dateConfidence")),
        machine=text("machine"),
        machineConfidence=_conf(data.get("machineConfidence")),
        points=points,
    )
