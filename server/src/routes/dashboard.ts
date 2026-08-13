import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { listSheetsForDashboard } from '../db/repo/checksheets.js'
import { getFindingTrend, listRecentFindings } from '../db/repo/findings.js'
import { listPartRequests } from '../db/repo/partRequests.js'
import { verificationSummaryByChecksheetCode } from '../db/repo/photoVerifications.js'

export const dashboardRouter = Router()

/** One aggregate endpoint returning the same {sheets, findings, approvals} shape the old mock state had. */
dashboardRouter.get('/api/dashboard', requireAuth, (req, res) => {
  // Rollup keyed by checksheet code — additive, so the existing sheet shape is unchanged
  // and a sheet with no photos simply has no entry.
  const verifications = verificationSummaryByChecksheetCode()
  res.json({
    sheets: listSheetsForDashboard().map((s) => ({ ...s, verification: verifications[s.id] ?? null })),
    findings: listRecentFindings(),
    approvals: listPartRequests(),
    trend: getFindingTrend(7),
  })
})
