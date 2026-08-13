-- Advisory AI photo verification results, one row per photo attached to a failed
-- inspection point. Deliberately its own table rather than columns on `findings`:
-- verification is optional, asynchronous, and may exist before its finding is judged,
-- so it must never widen or block the finding write path.
CREATE TABLE IF NOT EXISTS photo_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checksheet_id INTEGER NOT NULL REFERENCES checksheets(id),
  finding_id INTEGER REFERENCES findings(id),
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id),
  item_label TEXT NOT NULL,
  category TEXT NOT NULL,
  photo_name TEXT,
  -- pending: queued or in flight | done: model answered | skipped: provider has no
  -- vision | failed: call errored or returned nothing usable
  status TEXT NOT NULL DEFAULT 'pending',
  verdict TEXT,
  description TEXT,
  reasoning TEXT,
  note TEXT,
  model TEXT,
  provider TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_photo_verifications_checksheet
  ON photo_verifications (checksheet_id);
