import { callAiService } from './client.js'
import { insertEmbedding } from '../db/repo/embeddings.js'

// Recorded against each stored vector for provenance. The actual embedding model is
// chosen by the Python service; this is just a label matching its default local model.
const MODEL_NAME = process.env.EMBED_MODEL_LABEL ?? 'nomic-embed-text'

/** Embeds text via the Python AI service. Returns null if the service is unreachable. */
export async function embedText(text: string): Promise<Float32Array | null> {
  const res = await callAiService<{ embedding: number[] }>('/embed', { text })
  if (!res || !Array.isArray(res.embedding) || res.embedding.length === 0) return null
  return Float32Array.from(res.embedding)
}

/**
 * Embeds and persists a checksheet/finding the moment it's written, so it's searchable
 * immediately. If embedding fails (AI service down) the entity is still persisted by the
 * caller — it just won't surface in AI Search until re-indexed. Never blocks a submission.
 */
export async function indexEntity(entityType: 'checksheet' | 'finding', entityId: number, text: string) {
  const embedding = await embedText(text)
  if (!embedding) {
    console.error(`Embedding failed; ${entityType} ${entityId} not indexed for search (AI service down?)`)
    return
  }
  insertEmbedding({
    entityType,
    entityId,
    embedding,
    modelName: MODEL_NAME,
    createdAt: new Date().toISOString(),
  })
}
