import { beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

// Stub the HTTP boundary to the Python AI service — everything else (cost lookup, threshold
// comparison, deterministic fallbacks, cosine retrieval, candidate filtering, the Node-run
// assistant tool loop, procurement grouping) is real production code exercised end-to-end
// through the API. /embed returns a fixed vector; /draft, /search, /analyze-trends and
// /consolidate-po return null so the deterministic fallbacks run; /assistant/plan simulates
// a tool call followed by a final answer, so the real tool-execution loop is exercised.
const hoisted = vi.hoisted(() => ({ planCalls: 0 }))
vi.mock('../src/ai/client.js', () => ({
  callAiService: vi.fn(async (path: string) => {
    if (path === '/embed') return { embedding: Array.from({ length: 8 }, (_, i) => i + 1) }
    if (path === '/assistant/plan') {
      hoisted.planCalls++
      if (hoisted.planCalls === 1) {
        return { content: null, tool_calls: [{ id: 'c1', name: 'list_recurring_issues', arguments: '{}' }] }
      }
      return { content: 'Spindle lubrication is the main recurring issue based on the records.', tool_calls: null }
    }
    return null
  }),
  // Simulate the AI service being unreachable from the test process (no real fetch).
  getAiHealth: vi.fn(async () => null),
}))

// Stub SMTP too — real sending is opt-in via env vars in production, but tests must never
// attempt a real network send regardless of what's in a developer's local .env.
vi.mock('../src/email/mailer.js', () => ({
  sendMail: vi.fn(async () => false),
  isEmailConfigured: vi.fn(() => false),
}))

const { app } = await import('../src/app.js')

let supervisorCookie: string
let technicianCookie: string

async function login(username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password })
  const rawCookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]
  return { res, cookie: rawCookie ? rawCookie.split(';')[0] : '' }
}

beforeAll(async () => {
  const sup = await login('supervisor', 'test1234')
  supervisorCookie = sup.cookie
  const tech = await login('tech1', 'test1234')
  technicianCookie = tech.cookie
})

describe('auth', () => {
  it('rejects an unknown user', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'x' })
    expect(res.status).toBe(401)
  })

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'supervisor', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('logs in and returns the authenticated user via /api/me', async () => {
    const res = await request(app).get('/api/me').set('Cookie', supervisorCookie)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ displayName: 'Test Supervisor', role: 'supervisor' })
  })

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/me')
    expect(res.status).toBe(401)
  })
})

describe('machines', () => {
  it('lists machines with their checklist', async () => {
    const res = await request(app).get('/api/machines').set('Cookie', supervisorCookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ name: 'Test Machine' })
    expect(res.body[0].checklist).toHaveLength(2)
  })
})

describe('checksheet submission + approval threshold', () => {
  it('requires a technicianUserId when a supervisor submits', async () => {
    const res = await request(app).post('/api/checksheets').set('Cookie', supervisorCookie).send({
      machineId: 1,
      answers: [
        { checklistItemId: 1, result: 'pass' },
        { checklistItemId: 2, result: 'pass' },
      ],
    })
    expect(res.status).toBe(400)
  })

  it('routes a costly finding to pending (above the Rp 500,000 threshold)', async () => {
    const res = await request(app).post('/api/checksheets').set('Cookie', technicianCookie).send({
      machineId: 1,
      answers: [
        { checklistItemId: 1, result: 'pass' },
        { checklistItemId: 2, result: 'fail', category: 'Damaged part' },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.sheet.status).toBe('Pending Approval')
    expect(res.body.requests).toHaveLength(1)
    expect(res.body.requests[0]).toMatchObject({ status: 'pending', cost: 1850000 })
  })

  it('auto-sends a cheap finding (below the Rp 500,000 threshold)', async () => {
    const res = await request(app).post('/api/checksheets').set('Cookie', technicianCookie).send({
      machineId: 1,
      answers: [
        { checklistItemId: 1, result: 'fail', category: 'Needs replacement' },
        { checklistItemId: 2, result: 'pass' },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.requests[0]).toMatchObject({ status: 'auto', cost: 200000 })
  })

  it('does not draft a part request for a non-part finding category', async () => {
    const res = await request(app).post('/api/checksheets').set('Cookie', technicianCookie).send({
      machineId: 1,
      answers: [
        { checklistItemId: 1, result: 'fail', category: 'Needs lubrication' },
        { checklistItemId: 2, result: 'pass' },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.requests).toHaveLength(0)
    expect(res.body.sheet.status).toBe('Flagged')
  })
})

describe('approvals — role gating', () => {
  it('blocks a technician from rejecting a request', async () => {
    const list = await request(app).get('/api/part-requests').set('Cookie', supervisorCookie)
    const pendingCode = list.body.find((r: { status: string }) => r.status === 'pending').id

    const res = await request(app)
      .post(`/api/part-requests/${pendingCode}/reject`)
      .set('Cookie', technicianCookie)
    expect(res.status).toBe(403)
  })

  it('lets a supervisor reject a request', async () => {
    const list = await request(app).get('/api/part-requests').set('Cookie', supervisorCookie)
    const pendingCode = list.body.find((r: { status: string }) => r.status === 'pending').id

    const rejectRes = await request(app)
      .post(`/api/part-requests/${pendingCode}/reject`)
      .set('Cookie', supervisorCookie)
    expect(rejectRes.status).toBe(200)

    const after = await request(app).get('/api/part-requests').set('Cookie', supervisorCookie)
    const rejected = after.body.find((r: { id: string }) => r.id === pendingCode)
    expect(rejected.status).toBe('rejected')
  })
})

describe('settings', () => {
  it('exposes the single source of truth for the approval threshold and provider', async () => {
    const res = await request(app).get('/api/settings').set('Cookie', supervisorCookie)
    expect(res.status).toBe(200)
    expect(res.body.approvalThresholdIdr).toBe(500000)
    expect(res.body.chatProvider).toBe('ollama')
    expect(res.body.ai).toHaveProperty('reachable')
  })

  it('blocks a technician from changing settings', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Cookie', technicianCookie)
      .send({ chatProvider: 'gemini' })
    expect(res.status).toBe(403)
  })

  it('lets a supervisor switch the chat provider and update the threshold', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Cookie', supervisorCookie)
      .send({ chatProvider: 'gemini', approvalThresholdIdr: 750000 })
    expect(res.status).toBe(200)
    expect(res.body.chatProvider).toBe('gemini')
    expect(res.body.approvalThresholdIdr).toBe(750000)

    // Restore defaults so later assertions on the threshold are unaffected.
    await request(app)
      .post('/api/settings')
      .set('Cookie', supervisorCookie)
      .send({ chatProvider: 'ollama', approvalThresholdIdr: 500000 })
  })
})

describe('AI shift report', () => {
  it('returns deterministic stats plus an AI narrative (template fallback when the model is stubbed)', async () => {
    const res = await request(app).get('/api/report').set('Cookie', supervisorCookie)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('totalFindings')
    expect(typeof res.body.headline).toBe('string')
    expect(typeof res.body.summary).toBe('string')
    expect(Array.isArray(res.body.highlights)).toBe(true)
    expect(res.body.highlights.length).toBeGreaterThan(0)
  })
})

describe('search', () => {
  it('returns a summary and results even with the synthesis step stubbed out', async () => {
    const res = await request(app).post('/api/search').set('Cookie', supervisorCookie).send({ query: 'anything' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
    expect(Array.isArray(res.body.results)).toBe(true)
  })
})

describe('predictive-PM insights', () => {
  it('returns deterministic recurrence stats and recommendations', async () => {
    const res = await request(app).get('/api/insights').set('Cookie', supervisorCookie)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.stats)).toBe(true)
    expect(Array.isArray(res.body.recommendations)).toBe(true)
    expect(typeof res.body.summary).toBe('string')
    // Every recommendation carries a code-decided urgency, never model-decided.
    for (const r of res.body.recommendations) {
      expect(['High', 'Medium']).toContain(r.urgency)
    }
  })
})

describe('smart procurement — role gating', () => {
  it('blocks a technician from the consolidation endpoint', async () => {
    const res = await request(app).get('/api/procurement/consolidations').set('Cookie', technicianCookie)
    expect(res.status).toBe(403)
  })

  it('returns an array of vendor consolidations for a supervisor', async () => {
    const res = await request(app).get('/api/procurement/consolidations').set('Cookie', supervisorCookie)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('assistant', () => {
  it('runs the Node tool loop and returns an answer with the tools it used', async () => {
    const res = await request(app)
      .post('/api/assistant')
      .set('Cookie', supervisorCookie)
      .send({ messages: [{ role: 'user', content: 'what keeps breaking down?' }] })
    expect(res.status).toBe(200)
    expect(typeof res.body.answer).toBe('string')
    expect(res.body.answer.length).toBeGreaterThan(0)
    expect(res.body.toolsUsed).toContain('list_recurring_issues')

    // The structured tool data the UI renders as cards — the real DB rows, not a re-parse
    // of the model's prose.
    const call = res.body.toolCalls.find((c: { name: string }) => c.name === 'list_recurring_issues')
    expect(call).toBeDefined()
    expect(call).toHaveProperty('args')
    expect(call).toHaveProperty('result')
  })

  it('rejects an empty messages array', async () => {
    const res = await request(app).post('/api/assistant').set('Cookie', supervisorCookie).send({ messages: [] })
    expect(res.status).toBe(400)
  })
})
