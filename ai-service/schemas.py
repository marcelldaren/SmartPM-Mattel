"""Request/response models for the SmartPM AI service.

These mirror the shapes the Node backend already expects. The AI service never touches
the database and never decides the approval status — Node pre-computes cost/threshold/
status deterministically and passes them in; the model only writes prose.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class LangMixin(BaseModel):
    """Caller's UI language. Node stamps this on every request (see ai/client.ts)."""

    lang: Optional[str] = None


# --- /embed -------------------------------------------------------------------------


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]


# --- /draft -------------------------------------------------------------------------


class DraftRequest(LangMixin):
    provider: Optional[str] = None
    vendorName: str
    machineName: str
    findingTitle: str
    itemLabel: str
    checksheetCode: str
    category: str
    partName: str
    costIdr: int
    thresholdIdr: int
    status: Literal["auto", "pending"]
    recurrenceNote: Optional[str] = None
    neededBy: str


class DraftResponse(BaseModel):
    subject: str
    body: str


# --- /search ------------------------------------------------------------------------


class SearchCandidate(BaseModel):
    sheet: str
    machine: str
    tech: str
    date: str
    finding: str
    status: str


class SearchRequest(LangMixin):
    provider: Optional[str] = None
    query: str
    candidates: list[SearchCandidate] = Field(default_factory=list)


class SearchResultItem(BaseModel):
    sheet: str
    reason: str


class SearchResponse(BaseModel):
    summary: str
    results: list[SearchResultItem]


# --- /analyze-trends (predictive-PM agent) ------------------------------------------


class TrendStat(BaseModel):
    machine: str
    item: str
    category: str
    occurrences: int
    lastSeen: str
    pmInterval: str


class TrendsRequest(LangMixin):
    provider: Optional[str] = None
    stats: list[TrendStat] = Field(default_factory=list)


class TrendRecommendation(BaseModel):
    machine: str
    item: str
    action: str
    rationale: str


class TrendsResponse(BaseModel):
    summary: str
    recommendations: list[TrendRecommendation]


# --- /consolidate-po (smart-procurement agent) --------------------------------------


class PoItem(BaseModel):
    part: str
    machine: str
    itemLabel: str
    cost: int
    note: Optional[str] = None


class ConsolidateRequest(LangMixin):
    provider: Optional[str] = None
    vendor: str
    totalCost: int
    items: list[PoItem] = Field(default_factory=list)


class ConsolidateResponse(BaseModel):
    subject: str
    body: str


# --- /assistant/plan (conversational agent — one reasoning step) --------------------


class PlanRequest(LangMixin):
    provider: Optional[str] = None
    messages: list[dict] = Field(default_factory=list)
    tools: list[dict] = Field(default_factory=list)


class PlanToolCall(BaseModel):
    id: str
    name: str
    arguments: str
    # Gemini 3.x attaches a "thought_signature" here and REQUIRES it to be echoed back on
    # the follow-up request, or the next call fails with INVALID_ARGUMENT. Node round-trips
    # this opaque blob unchanged; it's ignored by providers that don't use it (e.g. Ollama).
    extra_content: Optional[dict] = None


class PlanResponse(BaseModel):
    content: Optional[str] = None
    tool_calls: Optional[list[PlanToolCall]] = None


# --- /report (AI shift report) ------------------------------------------------------


class ReportTopRecurring(BaseModel):
    machine: str
    item: str
    occurrences: int


class ReportRequest(LangMixin):
    provider: Optional[str] = None
    data: dict = Field(default_factory=dict)
    topRecurring: list[ReportTopRecurring] = Field(default_factory=list)


class ReportResponse(BaseModel):
    headline: str
    summary: str
    highlights: list[str]
    recommendation: str


# --- /vision/verify -------------------------------------------------------------------


class VisionVerifyRequest(LangMixin):
    provider: Optional[str] = None
    imageBase64: str
    mime: str
    category: str
    machineName: str
    itemLabel: str


class VisionVerifyResponse(BaseModel):
    # supported=False means the active provider cannot see at all (Ollama). Node turns
    # that into a "skipped" record rather than a failure, so the distinction matters.
    supported: bool
    verdict: Optional[Literal["Consistent", "Uncertain", "Possible mismatch"]] = None
    description: Optional[str] = None
    reasoning: Optional[str] = None
    model: Optional[str] = None
    note: Optional[str] = None


# --- /draft/review ---------------------------------------------------------------------


class DraftReviewRequest(LangMixin):
    provider: Optional[str] = None
    # The drafted email under review.
    subject: str
    body: str
    # Authoritative facts Node already computed. The reviewer checks the draft against
    # these — it never recomputes them.
    vendorName: str
    machineName: str
    findingTitle: str
    itemLabel: str
    checksheetCode: str
    partName: str
    costIdr: int


class DraftReviewResponse(BaseModel):
    reviewed_ok: bool
    issues: list[str] = Field(default_factory=list)
    model: Optional[str] = None


# --- /recommend-pm ---------------------------------------------------------------------


class PmRecommendRequest(LangMixin):
    provider: Optional[str] = None
    machineName: str
    itemLabel: str
    category: str
    occurrences: int
    # Every figure below was computed deterministically by Node. The model explains them;
    # it never picks or adjusts a date.
    avgGapDays: float
    currentIntervalDays: int
    suggestedIntervalDays: int
    currentDueDate: str
    suggestedDueDate: str
    daysEarlier: int


class PmRecommendResponse(BaseModel):
    action: str
    rationale: str


# --- /scan/checksheet -------------------------------------------------------------------

Confidence = Literal["high", "low"]


class ScanMachineSpec(BaseModel):
    """One machine and its checklist, supplied by Node — the AI service has no database."""

    name: str
    code: str
    points: list[str]


class ScanRequest(LangMixin):
    provider: Optional[str] = None
    imageBase64: str
    # Node sends the real catalogue every time rather than the service caching it, so a
    # seed change can never leave the extractor reading against a stale point list.
    machines: list[ScanMachineSpec]
    categories: list[str]
    technicians: list[str] = Field(default_factory=list)
    # Test harness only: echo the deskewed image back so a human can see what the model saw.
    returnProcessed: bool = False


class ScanPoint(BaseModel):
    # Copied verbatim from the supplied catalogue. Node re-validates it anyway and drops
    # anything that is not an exact match, so invention here cannot reach the form.
    label: str
    result: Literal["pass", "fail", "blank"]
    resultConfidence: Confidence = "low"
    category: Optional[str] = None
    categoryConfidence: Confidence = "low"
    photoAttached: Literal["yes", "no", "blank"] = "blank"


class ScanExtraction(BaseModel):
    technicianName: Optional[str] = None
    technicianConfidence: Confidence = "low"
    date: Optional[str] = None
    dateConfidence: Confidence = "low"
    machine: Optional[str] = None
    machineConfidence: Confidence = "low"
    points: list[ScanPoint] = Field(default_factory=list)


class ScanResponse(BaseModel):
    # supported=False means the active provider cannot see (Ollama), mirroring
    # VisionVerifyResponse so Node can treat both the same way.
    supported: bool
    ok: bool = False
    # "blurry" | "unreadable" | "model" — lets Node pick the right message without
    # string-matching on `note`.
    reason: Optional[str] = None
    note: Optional[str] = None
    extraction: Optional[ScanExtraction] = None
    # Image diagnostics, always populated when the image decoded at all.
    blur: Optional[float] = None
    blurThreshold: Optional[float] = None
    deskewed: Optional[bool] = None
    width: Optional[int] = None
    height: Optional[int] = None
    model: Optional[str] = None
    processedImageBase64: Optional[str] = None
