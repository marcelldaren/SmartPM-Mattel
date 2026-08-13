-- Warehouse spare-parts inventory, and the internal pull requests it satisfies.
--
-- The point of this table is to stop the part-request agent reaching for a vendor when the
-- part is already on a shelf twenty metres away. The stock check that consumes it lives in
-- Node and is plain SQL — "quantity_on_hand > 0" is a fact, not a judgement, and must never
-- be delegated to a model.

CREATE TABLE IF NOT EXISTS warehouse_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  part_name TEXT NOT NULL,

  -- Reuses the existing finding-category taxonomy (src/data.js FINDING_CATEGORIES) rather
  -- than introducing a parallel one. That is what lets a finding's category map straight
  -- onto a shelf with no translation layer in between.
  category TEXT NOT NULL,

  -- NULL machine_id = a general consumable that fits any machine.
  machine_id INTEGER REFERENCES machines(id),

  -- Optional precision link. Category + machine alone is coarse: a "Damaged part" finding
  -- on CNC Mill #3 would otherwise match any damaged-part SKU for that machine regardless
  -- of which component actually failed. When this is set, it wins.
  checklist_item_id INTEGER REFERENCES checklist_items(id),

  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  reorder_threshold INTEGER NOT NULL DEFAULT 0,  -- at or below this = "low stock"
  max_quantity INTEGER NOT NULL DEFAULT 0,       -- bin capacity; the denominator of the level bar
  bin_location TEXT NOT NULL,
  unit_cost_idr INTEGER,

  -- Set when a technician reports the shelf did not match the record. Display-only: it
  -- never blocks a pull, it marks the row as untrustworthy until someone recounts it.
  needs_recount INTEGER NOT NULL DEFAULT 0,
  recount_note TEXT,

  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_warehouse_parts_lookup
  ON warehouse_parts (category, machine_id);

-- A request to collect a part that is already in stock. Deliberately a different record
-- type from part_requests: no vendor, no cost, no approval threshold, no email. The only
-- thing it gates is whether someone physically fetched the item.
CREATE TABLE IF NOT EXISTS internal_pull_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                    -- IPR-###
  warehouse_part_id INTEGER NOT NULL REFERENCES warehouse_parts(id),
  finding_id INTEGER REFERENCES findings(id),
  checksheet_id INTEGER NOT NULL REFERENCES checksheets(id),
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  technician_user_id INTEGER NOT NULL REFERENCES users(id),

  -- Snapshotted at creation. The shelf can be renamed or the SKU re-binned later; what the
  -- technician was told to go and collect should not change retroactively.
  part_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  bin_location TEXT NOT NULL,
  quantity INTEGER NOT NULL,

  -- pending_pickup -> picked_up | discrepancy | cancelled
  status TEXT NOT NULL DEFAULT 'pending_pickup',
  item_label TEXT,
  category TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id INTEGER REFERENCES users(id),
  is_seed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_internal_pull_requests_status
  ON internal_pull_requests (status, created_at);

-- Audit trail for every actual change to quantity_on_hand, mirroring pm_schedule_changes.
-- Stock is only ever decremented through a confirmed pickup, so this doubles as the
-- record of who collected what.
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_part_id INTEGER NOT NULL REFERENCES warehouse_parts(id),
  pull_request_id INTEGER REFERENCES internal_pull_requests(id),
  delta INTEGER NOT NULL,               -- negative for a pickup
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,                 -- 'pickup' | 'recount' | 'restock'
  moved_by_user_id INTEGER REFERENCES users(id),
  moved_at TEXT NOT NULL
);
