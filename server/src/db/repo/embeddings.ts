import { sqlite } from '../client.js'

export function insertEmbedding(e: {
  entityType: 'checksheet' | 'finding'
  entityId: number
  embedding: Float32Array
  modelName: string
  createdAt: string
}) {
  const buf = Buffer.from(e.embedding.buffer, e.embedding.byteOffset, e.embedding.byteLength)
  sqlite
    .prepare(
      'INSERT INTO record_embeddings (entity_type, entity_id, embedding, model_name, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(e.entityType, e.entityId, buf, e.modelName, e.createdAt)
}

export interface StoredEmbedding {
  entityType: 'checksheet' | 'finding'
  entityId: number
  embedding: Float32Array
}

export function listEmbeddings(): StoredEmbedding[] {
  const rows = sqlite.prepare('SELECT entity_type, entity_id, embedding FROM record_embeddings').all() as Array<{
    entity_type: 'checksheet' | 'finding'
    entity_id: number
    embedding: Buffer
  }>
  return rows.map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    embedding: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4),
  }))
}
