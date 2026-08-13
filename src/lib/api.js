const BASE = '/api'

// Read straight from storage rather than through the React context: this module is
// imported by query functions that run outside the component tree.
function currentLang() {
  try {
    return window.localStorage.getItem('smartpm.lang') === 'id' ? 'id' : 'en'
  } catch {
    return 'en'
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-SmartPM-Lang': currentLang() },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  me: () => request('/me'),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  machines: () => request('/machines'),
  technicians: () => request('/technicians'),
  dashboard: () => request('/dashboard'),
  submitChecksheet: (payload) => request('/checksheets', { method: 'POST', body: payload }),
  // Returns a draft for the form only — this never writes a checksheet.
  scanChecksheet: (imageBase64) => request('/checksheets/scan', { method: 'POST', body: { imageBase64 } }),
  checksheetVerifications: (code) => request(`/checksheets/${code}/verifications`),
  partRequests: () => request('/part-requests'),
  approve: (code) => request(`/part-requests/${code}/approve`, { method: 'POST' }),
  reject: (code) => request(`/part-requests/${code}/reject`, { method: 'POST' }),
  search: (query) => request('/search', { method: 'POST', body: { query } }),
  settings: () => request('/settings'),
  insights: () => request('/insights'),
  pmRecommendations: () => request('/pm-recommendations'),
  generatePmRecommendations: () => request('/pm-recommendations/generate', { method: 'POST' }),
  approvePmRecommendation: (id) => request(`/pm-recommendations/${id}/approve`, { method: 'POST' }),
  dismissPmRecommendation: (id) => request(`/pm-recommendations/${id}/dismiss`, { method: 'POST' }),
  consolidations: () => request('/procurement/consolidations'),
  approveConsolidation: ({ vendorId, codes, subject, body }) =>
    request(`/procurement/consolidations/${vendorId}/approve`, { method: 'POST', body: { codes, subject, body } }),
  assistant: (messages) => request('/assistant', { method: 'POST', body: { messages } }),
  report: () => request('/report'),
  inventory: () => request('/inventory'),
  pullRequests: () => request('/pull-requests'),
  confirmPickup: (code) => request(`/pull-requests/${code}/pickup`, { method: 'POST' }),
  reportDiscrepancy: (code, note) =>
    request(`/pull-requests/${code}/discrepancy`, { method: 'POST', body: { note } }),
  updateSettings: (body) => request('/settings', { method: 'POST', body }),
}
