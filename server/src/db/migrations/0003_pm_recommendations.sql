-- Predictive-PM scheduling proposals.
--
-- machines.next_pm_due_date is the machine's actual next scheduled PM, as an ISO date
-- (YYYY-MM-DD). Left NULL on existing rows on purpose: Node derives a fallback from
-- last_pm_date + pm_interval_label when it is NULL, so no backfill is needed and nothing
-- is silently rescheduled by the migration itself. Once a supervisor approves a proposal,
-- this column holds the authoritative date.
ALTER TABLE machines ADD COLUMN next_pm_due_date TEXT;

-- One row per proposal to bring a machine's PM forward. Every number here is computed
-- deterministically in Node from the finding history; `action` and `rationale` are the
-- only model-written fields, and they describe a decision that was already made.
CREATE TABLE IF NOT EXISTS pm_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id),
  item_label TEXT NOT NULL,
  occurrences INTEGER NOT NULL,
  avg_gap_days REAL NOT NULL,
  current_interval_days INTEGER NOT NULL,
  suggested_interval_days INTEGER NOT NULL,
  current_due_date TEXT NOT NULL,
  suggested_due_date TEXT NOT NULL,
  days_earlier INTEGER NOT NULL,
  basis TEXT NOT NULL,              -- Node's own plain-language arithmetic, model-free
  action TEXT NOT NULL,             -- model-written
  rationale TEXT NOT NULL,          -- model-written
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | dismissed
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by_user_id INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pm_recommendations_status
  ON pm_recommendations (status, created_at);

-- Only one open proposal per machine + inspection point, so re-running detection cannot
-- pile up duplicates for the same underlying problem.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_recommendations_open
  ON pm_recommendations (machine_id, checklist_item_id)
  WHERE status = 'pending';

-- Audit trail for actual schedule changes. Written only when a proposal is approved.
CREATE TABLE IF NOT EXISTS pm_schedule_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  recommendation_id INTEGER REFERENCES pm_recommendations(id),
  previous_due_date TEXT,
  new_due_date TEXT NOT NULL,
  changed_by_user_id INTEGER REFERENCES users(id),
  changed_at TEXT NOT NULL
);
