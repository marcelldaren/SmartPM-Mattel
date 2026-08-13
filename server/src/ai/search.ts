import { callAiService } from './client.js'
import { cosineSimilarity } from '../util/cosine.js'
import { embedText } from './embed.js'
import { listEmbeddings } from '../db/repo/embeddings.js'
import { getFindingSearchDetail, type FindingSearchDetail } from '../db/repo/findings.js'
import { getChatProvider } from '../db/repo/settings.js'
import { stripHtml } from '../util/text.js'

export interface SearchResult {
  sheet: string
  machine: string
  tech: string
  date: string
  finding: string
  status: string
  reason: string
}

export interface SearchResponse {
  summary: string
  results: SearchResult[]
}

const TOP_K = 6

/**
 * Real RAG. Node owns retrieval: it embeds the query (via the Python service), then ranks
 * the findings embedded at submit-time by cosine similarity over vectors it stored. The
 * top candidates go to the Python service purely for synthesis (summary + per-record
 * justification). The model is constrained to the candidate set, and Node re-joins reasons
 * back onto its own trusted candidate details — so a hallucinated sheet ID can't leak into
 * the results.
 */
export async function searchRecords(query: string): Promise<SearchResponse> {
  const stored = listEmbeddings().filter((e) => e.entityType === 'finding')
  if (stored.length === 0) {
    return { summary: 'No maintenance findings have been indexed yet.', results: [] }
  }

  const queryEmbedding = await embedText(query)
  if (!queryEmbedding) {
    return { summary: 'Search is unavailable right now (the AI service is not responding).', results: [] }
  }
  const q = Array.from(queryEmbedding)

  const scored = stored
    .map((e) => ({ entityId: e.entityId, score: cosineSimilarity(q, Array.from(e.embedding)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)

  const candidates = scored
    .map((c) => getFindingSearchDetail(c.entityId))
    .filter((d): d is FindingSearchDetail => !!d)

  if (candidates.length === 0) {
    return { summary: 'No matching maintenance records found.', results: [] }
  }

  const bySheet = new Map(candidates.map((c) => [c.sheet, c]))

  const synthesis = await callAiService<{
    summary: string
    results: Array<{ sheet: string; reason: string }>
  }>('/search', { provider: getChatProvider(), query, candidates })

  // Deterministic fallback if the AI service is down or returned nothing usable.
  const summary =
    synthesis?.summary ??
    `${candidates.length} matching finding${candidates.length > 1 ? 's' : ''} found for "${query}".`

  const reasonBySheet = new Map<string, string>()
  for (const r of synthesis?.results ?? []) {
    // Only trust reasons keyed to a sheet the model was actually given — guards against
    // a hallucinated sheet ID leaking into the results.
    if (bySheet.has(r.sheet)) reasonBySheet.set(r.sheet, r.reason)
  }

  // When synthesis justified at least one candidate, return just that subset (the model
  // pruning false-positive retrievals is the point of the analyst step), keeping retrieval
  // order and Node's OWN trusted detail — never the model's echoed fields. If synthesis
  // produced nothing usable, fall back to every retrieved candidate with a generic reason.
  const results: SearchResult[] =
    reasonBySheet.size > 0
      ? candidates
          .filter((c) => reasonBySheet.has(c.sheet))
          .map((c) => ({ ...c, reason: stripHtml(reasonBySheet.get(c.sheet)!) }))
      : candidates.map((c) => ({ ...c, reason: 'Matched by semantic similarity to the query.' }))

  return { summary: stripHtml(summary), results }
}
