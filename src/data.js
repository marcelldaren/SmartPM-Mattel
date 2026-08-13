// Client-side display constants. All record data (machines, vendors, technicians,
// checksheets, findings, part requests) now lives server-side — see server/src/seed.ts.

export const fmtIDR = (n) => 'Rp ' + n.toLocaleString('id-ID')

export const FINDING_CATEGORIES = [
  'Damaged part',
  'Needs replacement',
  'Needs lubrication',
  'Misaligned',
  'Leak detected',
  'Abnormal noise / vibration',
]

// Categories that trigger an auto-drafted vendor part request on submit — kept in sync
// with PART_REQUEST_CATEGORIES in server/src/routes/checksheets.ts.
export const PART_REQUEST_CATEGORIES = ['Damaged part', 'Needs replacement']

export const SEARCH_PHASES = [
  'Parsing query…',
  'Searching indexed PM records…',
  'Ranking matches by relevance…',
]

export const SEARCH_SUGGESTIONS = [
  'Spark plug issues on Line 7',
  'Filter replacements this quarter',
  'Recurring sensor problems on Molder A2',
]
