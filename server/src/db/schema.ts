import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core'

export const vendors = sqliteTable('vendors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['supervisor', 'technician'] }).notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id),
})

export const machines = sqliteTable('machines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  area: text('area').notNull(),
  pmIntervalLabel: text('pm_interval_label').notNull(),
  lastPmDate: text('last_pm_date').notNull(),
  dueLabel: text('due_label').notNull(),
  dueTone: text('due_tone', { enum: ['primary', 'accent', 'neutral'] }).notNull(),
  // Actual next scheduled PM (ISO date). NULL until a supervisor approves a proposal —
  // Node derives a fallback from lastPmDate + pmIntervalLabel while it is unset, so the
  // migration never silently reschedules anything.
  nextPmDueDate: text('next_pm_due_date'),
})

export const checklistItems = sqliteTable('checklist_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  machineId: integer('machine_id').notNull().references(() => machines.id),
  label: text('label').notNull(),
  hint: text('hint').notNull(),
  sortOrder: integer('sort_order').notNull(),
})

export const checksheets = sqliteTable('checksheets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(), // e.g. CS-2049
  machineId: integer('machine_id').notNull().references(() => machines.id),
  technicianUserId: integer('technician_user_id').notNull().references(() => users.id),
  workOrderCode: text('work_order_code').notNull(),
  status: text('status', { enum: ['Complete', 'Flagged', 'Pending Approval'] }).notNull(),
  submittedAt: text('submitted_at').notNull(),
  isSeed: integer('is_seed', { mode: 'boolean' }).notNull().default(false),
})

export const checksheetAnswers = sqliteTable('checksheet_answers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  checksheetId: integer('checksheet_id').notNull().references(() => checksheets.id),
  checklistItemId: integer('checklist_item_id').notNull().references(() => checklistItems.id),
  result: text('result', { enum: ['pass', 'fail'] }).notNull(),
  category: text('category'),
})

export const findings = sqliteTable('findings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  checksheetId: integer('checksheet_id').notNull().references(() => checksheets.id),
  checklistItemId: integer('checklist_item_id').notNull().references(() => checklistItems.id),
  machineId: integer('machine_id').notNull().references(() => machines.id),
  title: text('title').notNull(),
  itemLabel: text('item_label').notNull(),
  category: text('category').notNull(),
  severity: text('severity', { enum: ['High', 'Medium', 'Low'] }).notNull(),
  createdAt: text('created_at').notNull(),
})

export const partCatalog = sqliteTable('part_catalog', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  partName: text('part_name').notNull(),
  typicalCostIdr: integer('typical_cost_idr').notNull(),
})

export const partRequests = sqliteTable('part_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(), // e.g. PR-118
  findingId: integer('finding_id').notNull().references(() => findings.id),
  checksheetId: integer('checksheet_id').notNull().references(() => checksheets.id),
  machineId: integer('machine_id').notNull().references(() => machines.id),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  partName: text('part_name').notNull(),
  costIdr: integer('cost_idr').notNull(),
  status: text('status', { enum: ['pending', 'auto', 'sent', 'rejected'] }).notNull(),
  emailSubject: text('email_subject').notNull(),
  emailBody: text('email_body').notNull(),
  draftedBy: text('drafted_by', { enum: ['template', 'agent'] }).notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
  sentAt: text('sent_at'),
  isSeed: integer('is_seed', { mode: 'boolean' }).notNull().default(false),
  // Advisory second-pass review of the drafted email. NULL = no review recorded (call
  // failed, or the row predates the feature) and the UI shows no badge — an absent
  // review must never read as a failed one. Never consulted by routing or the threshold.
  reviewOk: integer('review_ok', { mode: 'boolean' }),
  reviewIssues: text('review_issues'),
  reviewModel: text('review_model'),
  reviewedAt: text('reviewed_at'),
})

export const recordEmbeddings = sqliteTable('record_embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type', { enum: ['checksheet', 'finding'] }).notNull(),
  entityId: integer('entity_id').notNull(),
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
  modelName: text('model_name').notNull(),
  createdAt: text('created_at').notNull(),
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

/**
 * Advisory AI verification of a technician's evidence photo against the finding category
 * they claimed. Separate from `findings` on purpose: it is optional, resolved
 * asynchronously after submission, and must never gate the finding write path.
 */
export const photoVerifications = sqliteTable('photo_verifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  checksheetId: integer('checksheet_id').notNull().references(() => checksheets.id),
  findingId: integer('finding_id').references(() => findings.id),
  checklistItemId: integer('checklist_item_id').notNull().references(() => checklistItems.id),
  itemLabel: text('item_label').notNull(),
  category: text('category').notNull(),
  photoName: text('photo_name'),
  status: text('status', { enum: ['pending', 'done', 'skipped', 'failed'] }).notNull().default('pending'),
  verdict: text('verdict', { enum: ['Consistent', 'Uncertain', 'Possible mismatch'] }),
  description: text('description'),
  reasoning: text('reasoning'),
  note: text('note'),
  model: text('model'),
  provider: text('provider'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
})

/**
 * Warehouse spare-parts stock. Consumed by the deterministic stock check that runs
 * *before* the vendor-drafting agent — see ai/inventory.ts.
 */
export const warehouseParts = sqliteTable('warehouse_parts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sku: text('sku').notNull().unique(),
  partName: text('part_name').notNull(),
  // Same taxonomy as findings.category / FINDING_CATEGORIES — not a parallel one.
  category: text('category').notNull(),
  // NULL = general consumable that fits any machine.
  machineId: integer('machine_id').references(() => machines.id),
  // Optional precision link; when set it beats a category+machine match.
  checklistItemId: integer('checklist_item_id').references(() => checklistItems.id),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  reorderThreshold: integer('reorder_threshold').notNull().default(0),
  maxQuantity: integer('max_quantity').notNull().default(0),
  binLocation: text('bin_location').notNull(),
  unitCostIdr: integer('unit_cost_idr'),
  // Display-only flag raised by a reported discrepancy. Never blocks a pull.
  needsRecount: integer('needs_recount', { mode: 'boolean' }).notNull().default(false),
  recountNote: text('recount_note'),
  updatedAt: text('updated_at'),
})

/**
 * A request to collect an in-stock part. Distinct from `partRequests` on purpose: no
 * vendor, no cost, no approval threshold, no email — the only thing confirmed here is
 * that a human physically fetched the item off the shelf.
 */
export const internalPullRequests = sqliteTable('internal_pull_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(), // e.g. IPR-101
  warehousePartId: integer('warehouse_part_id').notNull().references(() => warehouseParts.id),
  findingId: integer('finding_id').references(() => findings.id),
  checksheetId: integer('checksheet_id').notNull().references(() => checksheets.id),
  machineId: integer('machine_id').notNull().references(() => machines.id),
  technicianUserId: integer('technician_user_id').notNull().references(() => users.id),
  // Snapshotted at creation so a later re-bin doesn't rewrite what someone was told to collect.
  partName: text('part_name').notNull(),
  sku: text('sku').notNull(),
  binLocation: text('bin_location').notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status', {
    enum: ['pending_pickup', 'picked_up', 'discrepancy', 'cancelled'],
  }).notNull().default('pending_pickup'),
  itemLabel: text('item_label'),
  category: text('category'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
  resolvedAt: text('resolved_at'),
  resolvedByUserId: integer('resolved_by_user_id').references(() => users.id),
  isSeed: integer('is_seed', { mode: 'boolean' }).notNull().default(false),
})

/** Audit trail for every change to quantity_on_hand. Mirrors pmScheduleChanges. */
export const stockMovements = sqliteTable('stock_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  warehousePartId: integer('warehouse_part_id').notNull().references(() => warehouseParts.id),
  pullRequestId: integer('pull_request_id').references(() => internalPullRequests.id),
  delta: integer('delta').notNull(),
  previousQuantity: integer('previous_quantity').notNull(),
  newQuantity: integer('new_quantity').notNull(),
  reason: text('reason').notNull(),
  movedByUserId: integer('moved_by_user_id').references(() => users.id),
  movedAt: text('moved_at').notNull(),
})
