import 'dotenv/config'
import { sqlite } from './db/client.js'
import { hashPassword } from './auth/password.js'
import { indexEntity } from './ai/embed.js'

function checklistItemId(machineId: number, label: string): number {
  const row = sqlite
    .prepare('SELECT id FROM checklist_items WHERE machine_id = ? AND label = ?')
    .get(machineId, label) as { id: number } | undefined
  if (!row) throw new Error(`Seed error: no checklist item "${label}" on machine ${machineId}`)
  return row.id
}

/**
 * Warehouse stock. Seeded separately from the main block and guarded on its own table, so
 * running `npm run db:seed` against an already-populated database still fills in the
 * inventory without touching (or duplicating) anything else.
 *
 * Covers every machine and deliberately includes low and out-of-stock rows: a screen that
 * only ever renders healthy states hides exactly the cases worth designing for.
 */
function seedWarehouse() {
  const already = sqlite.prepare('SELECT COUNT(*) AS n FROM warehouse_parts').get() as { n: number }
  if (already.n > 0) {
    console.log(`Warehouse already has ${already.n} parts — skipping inventory seed.`)
    return
  }

  const machineIdByName = Object.fromEntries(
    (sqlite.prepare('SELECT id, name FROM machines').all() as { id: number; name: string }[]).map((m) => [
      m.name,
      m.id,
    ]),
  )
  const itemId = (machineName: string, label: string): number | null => {
    const row = sqlite
      .prepare('SELECT id FROM checklist_items WHERE machine_id = ? AND label = ?')
      .get(machineIdByName[machineName], label) as { id: number } | undefined
    return row?.id ?? null
  }

  // [sku, part, category, machine|null, checklistItem|null, onHand, reorder, max, bin, unitCost]
  const parts: Array<
    [string, string, string, string | null, string | null, number, number, number, string, number]
  > = [
    // --- CNC Mill #3 ---
    ['SPM-CNC-001', 'Cabinet Air Filter — Camfil 30/30', 'Needs replacement', 'CNC Mill #3', 'Cabinet air filter', 6, 4, 12, 'A1-03', 312_500],
    ['SPM-CNC-002', 'Way Cover Wiper Set', 'Damaged part', 'CNC Mill #3', 'Way covers & wipers', 3, 2, 6, 'A1-05', 890_000],
    ['SPM-CNC-003', 'Spindle Lubricant — Mobil Velocite 10 (1 L)', 'Needs lubrication', 'CNC Mill #3', 'Spindle lubrication level', 2, 3, 8, 'A1-04', 265_000],
    ['SPM-CNC-004', 'Tool Changer Cam Follower', 'Damaged part', 'CNC Mill #3', 'Tool changer alignment', 0, 2, 6, 'A1-06', 1_480_000],

    // --- Injection Molder A2 ---
    ['SPM-IMA-001', 'Proximity Sensor — Omron E2E-X7D1', 'Needs replacement', 'Injection Molder A2', 'Mold position sensor', 4, 2, 8, 'B2-02', 2_400_000],
    ['SPM-IMA-002', 'Heater Band 230 V 2.5 kW', 'Damaged part', 'Injection Molder A2', 'Heater band continuity', 0, 2, 6, 'B2-01', 1_950_000],
    ['SPM-IMA-003', 'Hydraulic Seal Kit', 'Leak detected', 'Injection Molder A2', 'Water lines & fittings', 5, 2, 10, 'B2-03', 740_000],
    ['SPM-IMA-004', 'Safety Gate Interlock Switch', 'Damaged part', 'Injection Molder A2', 'Safety gate interlock', 2, 1, 4, 'B2-04', 1_120_000],

    // --- Conveyor Line 7 ---
    ['SPM-CV7-001', 'Spark Plug — NGK BPR6ES', 'Damaged part', 'Conveyor Line 7', 'Drive motor spark plug', 12, 6, 24, 'C1-07', 45_000],
    ['SPM-CV7-002', 'Roller Bearing — SKF 6204-2RS', 'Needs replacement', 'Conveyor Line 7', 'Roller bearings', 0, 4, 12, 'C1-08', 385_000],
    ['SPM-CV7-003', 'Bearing Grease — SKF LGMT 2 (1 kg)', 'Needs lubrication', 'Conveyor Line 7', 'Drive chain & belt lubrication', 3, 4, 10, 'C1-09', 320_000],
    ['SPM-CV7-004', 'Photo Sensor Reflector', 'Misaligned', 'Conveyor Line 7', 'Photo sensor alignment', 7, 3, 12, 'C1-10', 175_000],

    // --- Packaging Robot B1 ---
    ['SPM-RB1-001', 'Gripper Pad Set (×4)', 'Needs replacement', 'Packaging Robot B1', 'Gripper pads & alignment', 5, 3, 10, 'D3-02', 640_000],
    ['SPM-RB1-002', 'Vacuum Cup Seal Kit', 'Damaged part', 'Packaging Robot B1', 'Vacuum cup seals', 1, 3, 8, 'D3-03', 520_000],
    ['SPM-RB1-003', 'Servo Cable Carrier Link', 'Damaged part', 'Packaging Robot B1', 'Cable carrier condition', 0, 2, 6, 'D3-04', 980_000],

    // --- General consumables (any machine) ---
    // Restricted to categories OUTSIDE PART_REQUEST_CATEGORIES on purpose. A generic
    // "Damaged part" row would match every machine and quietly make the vendor path
    // unreachable, which is the opposite of what this feature is for.
    ['SPM-GEN-001', 'Cable Tie & Loom Kit (assorted)', 'Misaligned', null, null, 25, 10, 60, 'E0-01', 85_000],
    ['SPM-GEN-002', 'General Purpose Grease (400 g)', 'Needs lubrication', null, null, 8, 4, 20, 'E0-02', 140_000],
  ]

  const stmt = sqlite.prepare(
    `INSERT INTO warehouse_parts
       (sku, part_name, category, machine_id, checklist_item_id, quantity_on_hand,
        reorder_threshold, max_quantity, bin_location, unit_cost_idr, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = new Date().toISOString()
  for (const [sku, name, category, machine, label, onHand, reorder, max, bin, cost] of parts) {
    stmt.run(
      sku,
      name,
      category,
      machine ? machineIdByName[machine] : null,
      machine && label ? itemId(machine, label) : null,
      onHand,
      reorder,
      max,
      bin,
      cost,
      now,
    )
  }

  const out = parts.filter((p) => p[5] === 0).length
  const low = parts.filter((p) => p[5] > 0 && p[5] <= p[6]).length
  console.log(`Seeded ${parts.length} warehouse parts (${low} low stock, ${out} out of stock).`)
}

async function main() {
  const already = sqlite.prepare('SELECT COUNT(*) AS n FROM vendors').get() as { n: number }
  if (already.n > 0) {
    console.log('Database already seeded — skipping core seed. Delete data/smartpm.db to reseed from scratch.')
    seedWarehouse()
    return
  }

  console.log('Seeding vendors...')
  const vendorId = (name: string, email: string) =>
    Number(sqlite.prepare('INSERT INTO vendors (name, email) VALUES (?, ?)').run(name, email).lastInsertRowid)

  // Placeholder addresses on the reserved .example TLD, which can never resolve or deliver.
  // A real inbox must not be seeded here: this file is committed, and a seeded address ends
  // up in the demo database that ships with a deployment. To have a live demo actually
  // deliver, set DEMO_VENDOR_EMAIL in the environment — sendMail redirects every message
  // there, so the receiving address is supplied at run time and never stored in the repo.
  const tristarId = vendorId('Tristar Maintenance', 'purchasing@tristar-maintenance.example')
  const apexId = vendorId('Apex Industrial Services', 'orders@apex-industrial.example')

  console.log('Seeding users...')
  const insertUser = (u: {
    username: string
    passwordHash: string
    displayName: string
    role: 'supervisor' | 'technician'
    vendorId: number | null
  }) =>
    Number(
      sqlite
        .prepare('INSERT INTO users (username, password_hash, display_name, role, vendor_id) VALUES (?, ?, ?, ?, ?)')
        .run(u.username, u.passwordHash, u.displayName, u.role, u.vendorId).lastInsertRowid,
    )

  const defaultHash = await hashPassword('smartpm123')

  const supervisorId = insertUser({
    username: 'supervisor',
    passwordHash: defaultHash,
    displayName: 'Marcell Darren',
    role: 'supervisor',
    vendorId: null,
  })

  const techs = [
    { name: 'Budi Santoso', vendor: tristarId, username: 'budi' },
    { name: 'Sari Rahmawati', vendor: tristarId, username: 'sari' },
    { name: 'Agus Wijaya', vendor: tristarId, username: 'agus' },
    { name: 'Dewi Lestari', vendor: apexId, username: 'dewi' },
    { name: 'Rizky Pratama', vendor: apexId, username: 'rizky' },
    { name: 'Andi Saputra', vendor: apexId, username: 'andi' },
  ]
  const techId: Record<string, number> = {}
  for (const t of techs) {
    techId[t.name] = insertUser({
      username: t.username,
      passwordHash: defaultHash,
      displayName: t.name,
      role: 'technician',
      vendorId: t.vendor,
    })
  }

  console.log('Seeding machines + checklists...')
  const machineDefs = [
    {
      slug: 'cnc3',
      name: 'CNC Mill #3',
      code: 'MC-104',
      area: 'Machining — Bay 2',
      pmIntervalLabel: 'Every 30 days',
      lastPmDate: 'Jun 19, 2026',
      dueLabel: 'PM due today',
      dueTone: 'primary' as const,
      checklist: [
        { label: 'Spindle lubrication level', hint: 'Reservoir between MIN–MAX marks' },
        { label: 'Coolant concentration', hint: 'Target 6–8% on refractometer' },
        { label: 'Way covers & wipers', hint: 'No tears, chips cleared from tracks' },
        { label: 'Tool changer alignment', hint: 'Dry-run 3 change cycles' },
        { label: 'Axis backlash check', hint: 'X/Y axis ≤ 0.01 mm' },
        { label: 'Cabinet air filter', hint: 'Swap if pressure drop > 250 Pa' },
      ],
    },
    {
      slug: 'im-a2',
      name: 'Injection Molder A2',
      code: 'MC-221',
      area: 'Molding — Hall A',
      pmIntervalLabel: 'Every 30 days',
      lastPmDate: 'Jun 21, 2026',
      dueLabel: 'Due in 2 days',
      dueTone: 'neutral' as const,
      checklist: [
        { label: 'Hydraulic oil level & temperature', hint: '45–55 °C at idle' },
        { label: 'Heater band continuity', hint: 'Zones 1–6 within ±5%' },
        { label: 'Nozzle & barrel condition', hint: 'No drool, no scoring' },
        { label: 'Mold position sensor', hint: 'Verify trigger at set point' },
        { label: 'Safety gate interlock', hint: 'Must halt cycle instantly' },
        { label: 'Water lines & fittings', hint: 'No leaks at manifold' },
      ],
    },
    {
      slug: 'conv7',
      name: 'Conveyor Line 7',
      code: 'MC-317',
      area: 'Final Assembly — Line 7',
      pmIntervalLabel: 'Every 30 days',
      lastPmDate: 'Jun 15, 2026',
      dueLabel: 'Overdue by 4 days',
      dueTone: 'accent' as const,
      checklist: [
        { label: 'Belt tension & tracking', hint: 'Deflection ≤ 12 mm mid-span' },
        { label: 'Drive motor spark plug', hint: 'Gap 0.8 mm, no fouling' },
        { label: 'Roller bearings', hint: 'No play or grinding noise' },
        { label: 'Drive chain & belt lubrication', hint: 'Full pass with SKF LGMT 2' },
        { label: 'Photo sensor alignment', hint: 'Beam centered on reflector' },
        { label: 'Emergency stop circuit', hint: 'Test both end stations' },
      ],
    },
    {
      slug: 'rob-b1',
      name: 'Packaging Robot B1',
      code: 'MC-412',
      area: 'Packing — Cell B',
      pmIntervalLabel: 'Every 45 days',
      lastPmDate: 'Jun 28, 2026',
      dueLabel: 'Due Aug 12',
      dueTone: 'neutral' as const,
      checklist: [
        { label: 'Gripper pads & alignment', hint: 'Replace pads worn below 2 mm' },
        { label: 'Vacuum cup seals', hint: 'Hold 8 s at −60 kPa' },
        { label: 'Servo motor temperature', hint: '< 65 °C after 10 cycles' },
        { label: 'Cable carrier condition', hint: 'No cracked links' },
        { label: 'Home position calibration', hint: 'Offset ≤ 0.5 mm' },
        { label: 'Safety scanner zones', hint: 'Verify slow & stop fields' },
      ],
    },
  ]

  const machineId: Record<string, number> = {}
  for (const m of machineDefs) {
    const id = Number(
      sqlite
        .prepare(
          `INSERT INTO machines (slug, name, code, area, pm_interval_label, last_pm_date, due_label, due_tone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(m.slug, m.name, m.code, m.area, m.pmIntervalLabel, m.lastPmDate, m.dueLabel, m.dueTone).lastInsertRowid,
    )
    machineId[m.name] = id
    m.checklist.forEach((item, i) => {
      sqlite
        .prepare('INSERT INTO checklist_items (machine_id, label, hint, sort_order) VALUES (?, ?, ?, ?)')
        .run(id, item.label, item.hint, i)
    })
  }

  console.log('Seeding part catalog + settings...')
  sqlite
    .prepare('INSERT INTO part_catalog (category, part_name, typical_cost_idr) VALUES (?, ?, ?)')
    .run('Damaged part', 'Replacement part (damaged component)', 1_850_000)
  sqlite
    .prepare('INSERT INTO part_catalog (category, part_name, typical_cost_idr) VALUES (?, ?, ?)')
    .run('Needs replacement', 'Replacement part (worn component)', 1_450_000)

  sqlite
    .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
    .run('approval_threshold_idr', '500000')

  console.log('Seeding historical checksheets...')
  const sheetDefs = [
    { code: 'CS-2048', machine: 'CNC Mill #3', tech: 'Budi Santoso', submittedAt: '2026-07-19T09:41:00', status: 'Complete' },
    { code: 'CS-2047', machine: 'Conveyor Line 7', tech: 'Dewi Lestari', submittedAt: '2026-07-19T08:15:00', status: 'Flagged' },
    { code: 'CS-2046', machine: 'Injection Molder A2', tech: 'Andi Saputra', submittedAt: '2026-07-19T07:52:00', status: 'Pending Approval' },
    { code: 'CS-2045', machine: 'Packaging Robot B1', tech: 'Rizky Pratama', submittedAt: '2026-07-18T16:20:00', status: 'Complete' },
    { code: 'CS-2044', machine: 'CNC Mill #3', tech: 'Sari Rahmawati', submittedAt: '2026-07-18T13:05:00', status: 'Pending Approval' },
    { code: 'CS-2043', machine: 'Conveyor Line 7', tech: 'Budi Santoso', submittedAt: '2026-07-17T15:40:00', status: 'Flagged' },
    { code: 'CS-2042', machine: 'Injection Molder A2', tech: 'Agus Wijaya', submittedAt: '2026-07-16T10:22:00', status: 'Complete' },
    { code: 'CS-2041', machine: 'Packaging Robot B1', tech: 'Dewi Lestari', submittedAt: '2026-07-15T09:10:00', status: 'Complete' },
  ]
  const checksheetId: Record<string, number> = {}
  for (const s of sheetDefs) {
    checksheetId[s.code] = Number(
      sqlite
        .prepare(
          `INSERT INTO checksheets (code, machine_id, technician_user_id, work_order_code, status, submitted_at, is_seed)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(s.code, machineId[s.machine], techId[s.tech], `WO-SEED-${s.code}`, s.status, s.submittedAt).lastInsertRowid,
    )
  }

  console.log('Seeding findings + embedding them for search...')
  const findingDefs = [
    { code: 'F-101', title: 'Spark plug damaged', item: 'Drive motor spark plug', machine: 'Conveyor Line 7', sheet: 'CS-2047', severity: 'High' as const },
    { code: 'F-102', title: 'Belt needs lubrication', item: 'Drive chain & belt lubrication', machine: 'Conveyor Line 7', sheet: 'CS-2047', severity: 'Low' as const },
    { code: 'F-103', title: 'Sensor misaligned', item: 'Mold position sensor', machine: 'Injection Molder A2', sheet: 'CS-2046', severity: 'Medium' as const },
    { code: 'F-104', title: 'Filter needs replacement', item: 'Cabinet air filter', machine: 'CNC Mill #3', sheet: 'CS-2044', severity: 'Medium' as const },
    { code: 'F-105', title: 'Abnormal vibration', item: 'Roller bearings', machine: 'Conveyor Line 7', sheet: 'CS-2043', severity: 'Low' as const },
  ]
  const findingId: Record<string, number> = {}
  for (const f of findingDefs) {
    const mId = machineId[f.machine]
    const csId = checksheetId[f.sheet]
    const itemId = checklistItemId(mId, f.item)
    const category = f.title
    const submittedAt = sheetDefs.find((s) => s.code === f.sheet)!.submittedAt
    const id = Number(
      sqlite
        .prepare(
          `INSERT INTO findings (checksheet_id, checklist_item_id, machine_id, title, item_label, category, severity, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(csId, itemId, mId, f.title, f.item, category, f.severity, submittedAt).lastInsertRowid,
    )
    findingId[f.code] = id
    await indexEntity('finding', id, `${f.title} — ${f.item} — ${f.machine} — ${f.severity} severity`)
  }

  console.log('Seeding part requests...')
  const approvalDefs = [
    {
      code: 'PR-118', finding: 'F-103', machine: 'Injection Molder A2', vendor: apexId,
      part: 'Proximity Sensor — Omron E2E-X7D1', cost: 2_400_000, status: 'pending' as const,
      note: 'Flagged 3× in 60 days — replacement recommended',
      subject: 'Part Request PR-118 — Proximity Sensor, Injection Molder A2',
      body: `Dear Apex Industrial Services,\n\nDuring preventive maintenance on Injection Molder A2 (checksheet CS-2046, 19 Jul 2026), the mold position sensor was found misaligned — the third occurrence in 60 days. Realignment is no longer holding; replacement is recommended.\n\nRequested part: Omron E2E-X7D1 proximity sensor × 1\nEstimated cost: Rp 2.400.000\nNeeded by: 24 Jul 2026\n\nPlease confirm availability and lead time.\n\n— SmartPM automated request • PT Mattel Indonesia (PTMI)`,
      sentAt: null as string | null,
    },
    {
      code: 'PR-116', finding: 'F-104', machine: 'CNC Mill #3', vendor: tristarId,
      part: 'Cabinet Air Filter Set — Camfil 30/30 (×4)', cost: 1_250_000, status: 'pending' as const,
      note: null,
      subject: 'Part Request PR-116 — Cabinet Air Filter Set, CNC Mill #3',
      body: `Dear Tristar Maintenance,\n\nDuring preventive maintenance on CNC Mill #3 (checksheet CS-2044, 18 Jul 2026), the electrical cabinet air filters exceeded the 250 Pa pressure-drop limit and require replacement.\n\nRequested part: Camfil 30/30 filter panel × 4\nEstimated cost: Rp 1.250.000\nNeeded by: 25 Jul 2026\n\nPlease confirm availability and lead time.\n\n— SmartPM automated request • PT Mattel Indonesia (PTMI)`,
      sentAt: null as string | null,
    },
    {
      code: 'PR-117', finding: 'F-101', machine: 'Conveyor Line 7', vendor: apexId,
      part: 'Spark Plug — NGK BPR6ES (×4)', cost: 180_000, status: 'auto' as const,
      note: null,
      subject: 'Part Request PR-117 — Spark Plugs, Conveyor Line 7',
      body: `Dear Apex Industrial Services,\n\nDuring preventive maintenance on Conveyor Line 7 (checksheet CS-2047, 19 Jul 2026), the drive motor spark plug was found damaged.\n\nRequested part: NGK BPR6ES spark plug × 4\nEstimated cost: Rp 180.000\nNeeded by: 22 Jul 2026\n\nThis request was auto-approved (below the Rp 500.000 threshold).\n\n— SmartPM automated request • PT Mattel Indonesia (PTMI)`,
      sentAt: '2026-07-19T08:31:00' as string | null,
    },
    {
      code: 'PR-115', finding: 'F-102', machine: 'Conveyor Line 7', vendor: apexId,
      part: 'Bearing Grease — SKF LGMT 2 (1 kg)', cost: 320_000, status: 'auto' as const,
      note: null,
      subject: 'Part Request PR-115 — Bearing Grease, Conveyor Line 7',
      body: `Dear Apex Industrial Services,\n\nDuring preventive maintenance on Conveyor Line 7 (checksheet CS-2047, 19 Jul 2026), the drive chain and belt were found under-lubricated.\n\nRequested part: SKF LGMT 2 bearing grease, 1 kg tin × 1\nEstimated cost: Rp 320.000\nNeeded by: 22 Jul 2026\n\nThis request was auto-approved (below the Rp 500.000 threshold).\n\n— SmartPM automated request • PT Mattel Indonesia (PTMI)`,
      sentAt: '2026-07-19T08:30:00' as string | null,
    },
  ]

  for (const a of approvalDefs) {
    const fId = findingId[a.finding]
    const csRow = sqlite
      .prepare('SELECT cs.id AS checksheet_id, cs.submitted_at AS submitted_at FROM findings f JOIN checksheets cs ON cs.id = f.checksheet_id WHERE f.id = ?')
      .get(fId) as { checksheet_id: number; submitted_at: string }
    sqlite
      .prepare(
        `INSERT INTO part_requests
           (code, finding_id, checksheet_id, machine_id, vendor_id, part_name, cost_idr, status,
            email_subject, email_body, drafted_by, note, created_at, sent_at, is_seed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', ?, ?, ?, 1)`,
      )
      .run(
        a.code,
        fId,
        csRow.checksheet_id,
        machineId[a.machine],
        a.vendor,
        a.part,
        a.cost,
        a.status,
        a.subject,
        a.body,
        a.note,
        csRow.submitted_at,
        a.sentAt,
      )
  }

  seedWarehouse()

  console.log('Seed complete.')
  console.log('Login as supervisor: username "supervisor", password "smartpm123"')
  console.log('Login as a technician: e.g. username "dewi", password "smartpm123"')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
