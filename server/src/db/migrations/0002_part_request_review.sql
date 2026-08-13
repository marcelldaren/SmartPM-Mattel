-- Advisory second-pass AI review of a drafted vendor email.
--
-- Nullable on purpose: a NULL review_ok means "no review was recorded" (the call failed,
-- timed out, or the row predates this feature) and the UI shows no badge at all. That is
-- the fail-open path — an absent review must never look like a failed review.
--
-- Deliberately NOT touching status/cost_idr: routing and the approval threshold stay
-- exactly as they are, decided in Node before this review ever runs.
ALTER TABLE part_requests ADD COLUMN review_ok INTEGER;
ALTER TABLE part_requests ADD COLUMN review_issues TEXT;
ALTER TABLE part_requests ADD COLUMN review_model TEXT;
ALTER TABLE part_requests ADD COLUMN reviewed_at TEXT;
