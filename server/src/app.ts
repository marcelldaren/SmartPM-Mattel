import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { requestContext } from './util/requestContext.js'
import { authRouter } from './routes/auth.js'
import { machinesRouter } from './routes/machines.js'
import { dashboardRouter } from './routes/dashboard.js'
import { checksheetsRouter } from './routes/checksheets.js'
import { partRequestsRouter } from './routes/partRequests.js'
import { searchRouter } from './routes/search.js'
import { settingsRouter } from './routes/settings.js'
import { insightsRouter } from './routes/insights.js'
import { pmRecommendationsRouter } from './routes/pmRecommendations.js'
import { procurementRouter } from './routes/procurement.js'
import { inventoryRouter } from './routes/inventory.js'
import { assistantRouter } from './routes/assistant.js'
import { reportRouter } from './routes/report.js'

export const app = express()
// Checksheet submissions can carry base64 evidence photos. The client downscales to
// ~1024px before encoding, so this ceiling is generous for a handful of photos while
// still refusing anything pathological.
app.use(express.json({ limit: '12mb' }))
app.use(cookieParser())
// Scopes the caller's UI language to the request so AI prompts can answer in it.
app.use(requestContext)

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use(authRouter)
app.use(machinesRouter)
app.use(dashboardRouter)
app.use(checksheetsRouter)
app.use(partRequestsRouter)
app.use(searchRouter)
app.use(settingsRouter)
app.use(insightsRouter)
app.use(pmRecommendationsRouter)
app.use(procurementRouter)
app.use(inventoryRouter)
app.use(assistantRouter)
app.use(reportRouter)

/**
 * Serve the built frontend from this same process, when a build exists.
 *
 * In development Vite serves the UI on :5173 and proxies /api here, so this block finds no
 * dist/ and does nothing — local workflow is unchanged. In a deployment there is no Vite,
 * and having Node serve the bundle puts the UI and the API on one origin. That is not
 * merely convenient: auth is an httpOnly cookie, and splitting the two across origins
 * would force SameSite=None plus CORS credentials. Same origin avoids that entirely.
 *
 * Registered after the API routers so a route can never be shadowed by a file, and the
 * SPA fallback explicitly refuses /api so a mistyped endpoint returns JSON 404 rather than
 * index.html — an HTML body arriving where the client expects JSON is a confusing failure.
 */
// Terminal 404 for the API namespace, registered after every router. Without it an unknown
// /api path falls through to Express's default handler, which answers in HTML — and an HTML
// body arriving where the client parses JSON fails confusingly, several layers from the typo.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

const clientDist = process.env.CLIENT_DIST_PATH ?? path.resolve(import.meta.dirname, '../../dist')
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
  console.log(`Serving frontend from ${clientDist}`)
}

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})
