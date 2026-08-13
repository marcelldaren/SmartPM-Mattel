import { describe, expect, it } from 'vitest'
import {
  MIN_INTERVAL_DAYS,
  averageGapDays,
  computeProposal,
  parseIntervalDays,
  parseStoredDate,
} from '../src/pm/schedule.js'

// The PM date a supervisor approves comes from this module and nowhere else, so it is
// tested directly rather than only through the model-dependent path around it.

describe('parsing helpers', () => {
  it('reads a day count out of the interval label', () => {
    expect(parseIntervalDays('Every 30 days')).toBe(30)
    expect(parseIntervalDays('Every 45 days')).toBe(45)
  })

  it('returns null for a label with no day count', () => {
    expect(parseIntervalDays('Quarterly')).toBeNull()
    expect(parseIntervalDays('')).toBeNull()
  })

  it('normalises the human dates the seed stores', () => {
    expect(parseStoredDate('Jun 19, 2026')).toBe('2026-06-19')
    expect(parseStoredDate('not a date')).toBeNull()
  })
})

describe('averageGapDays', () => {
  it('averages the gaps between consecutive failures', () => {
    const avg = averageGapDays(['2026-01-01T00:00:00', '2026-01-11T00:00:00', '2026-01-21T00:00:00'])
    expect(avg).toBe(10)
  })

  it('needs at least two failures to have a gap', () => {
    expect(averageGapDays(['2026-01-01T00:00:00'])).toBeNull()
    expect(averageGapDays([])).toBeNull()
  })
})

describe('computeProposal', () => {
  const base = {
    pmIntervalLabel: 'Every 30 days',
    lastPmDate: 'Jun 19, 2026',
    storedNextPmDueDate: null,
  }

  it('brings PM forward when failures recur faster than the PM cycle', () => {
    // Failures every 10 days against a 30-day PM cycle -> 0.8 * 10 = 8 days.
    const p = computeProposal({
      ...base,
      failureTimestamps: ['2026-07-01T00:00:00', '2026-07-11T00:00:00', '2026-07-21T00:00:00'],
    })
    expect(p).not.toBeNull()
    expect(p!.avgGapDays).toBe(10)
    expect(p!.suggestedIntervalDays).toBe(8) // 10 * 0.8, above the 7-day floor
    expect(p!.currentDueDate).toBe('2026-07-19') // 19 Jun + 30d
    expect(p!.suggestedDueDate).toBe('2026-06-27') // 19 Jun + 8d
    expect(p!.daysEarlier).toBe(22)
    expect(p!.basis).toContain('10.0 days')
  })

  it('never proposes a cycle tighter than the floor', () => {
    // Failing daily would otherwise suggest a 1-day PM cycle.
    const p = computeProposal({
      ...base,
      failureTimestamps: ['2026-07-01T00:00:00', '2026-07-02T00:00:00', '2026-07-03T00:00:00'],
    })
    expect(p!.suggestedIntervalDays).toBe(MIN_INTERVAL_DAYS)
  })

  it('returns null when failures are rarer than the PM cycle (nothing to bring forward)', () => {
    // 100-day gaps against a 30-day cycle: PM is already more frequent than the failures.
    const p = computeProposal({
      ...base,
      failureTimestamps: ['2026-01-01T00:00:00', '2026-04-11T00:00:00', '2026-07-20T00:00:00'],
    })
    expect(p).toBeNull()
  })

  it('returns null with too little history to average', () => {
    expect(computeProposal({ ...base, failureTimestamps: ['2026-07-01T00:00:00'] })).toBeNull()
  })

  it('returns null when the interval label cannot be parsed', () => {
    expect(
      computeProposal({
        ...base,
        pmIntervalLabel: 'Quarterly',
        failureTimestamps: ['2026-07-01T00:00:00', '2026-07-11T00:00:00'],
      }),
    ).toBeNull()
  })

  it('measures against an already-approved date when one is stored', () => {
    const p = computeProposal({
      ...base,
      storedNextPmDueDate: '2026-06-30',
      failureTimestamps: ['2026-07-01T00:00:00', '2026-07-11T00:00:00', '2026-07-21T00:00:00'],
    })
    expect(p!.currentDueDate).toBe('2026-06-30')
    expect(p!.daysEarlier).toBe(3) // 30 Jun -> 27 Jun, not 19 Jul -> 27 Jun
  })

  it('returns null when the suggestion would not actually be earlier', () => {
    const p = computeProposal({
      ...base,
      storedNextPmDueDate: '2026-06-20',
      failureTimestamps: ['2026-07-01T00:00:00', '2026-07-11T00:00:00', '2026-07-21T00:00:00'],
    })
    expect(p).toBeNull()
  })
})
