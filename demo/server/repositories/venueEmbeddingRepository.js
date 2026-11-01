// SQL for taste.venue_embeddings: venue prior vectors, queried with pgvector.
import { parseVector, toVectorLiteral } from '../db/pgvector.js'

export function venueEmbeddingRepository(db) {
  return {
    async count() {
      const { rows } = await db.query('select count(*)::int as n, min(model) as model from taste.venue_embeddings')
      return { count: rows[0].n, model: rows[0].model }
    },

    async vectorsFor(gersIds) {
      if (gersIds.length === 0) return new Map()
      const { rows } = await db.query(
        'select gers_id, embedding::text as embedding from taste.venue_embeddings where gers_id = any($1::text[])',
        [gersIds],
      )
      return new Map(rows.map((r) => [r.gers_id, parseVector(r.embedding)]))
    },

    // Cosine similarity (1 - pgvector's cosine distance) for each listed venue.
    async similarities(gersIds, vector) {
      if (gersIds.length === 0 || !vector) return new Map()
      const { rows } = await db.query(
        `select gers_id, 1 - (embedding <=> $2::vector) as similarity
           from taste.venue_embeddings where gers_id = any($1::text[])`,
        [gersIds, toVectorLiteral(vector)],
      )
      return new Map(rows.map((r) => [r.gers_id, Number(r.similarity)]))
    },

    // rows: [{ gersId, embedding: Float32Array }]
    async upsertMany(rows, model) {
      if (rows.length === 0) return
      await db.query(
        `insert into taste.venue_embeddings (gers_id, model, embedding)
         select t.gers_id, $3, t.embedding::vector
           from unnest($1::text[], $2::text[]) as t(gers_id, embedding)
         on conflict (gers_id) do update set model = excluded.model, embedding = excluded.embedding`,
        [rows.map((r) => r.gersId), rows.map((r) => toVectorLiteral(r.embedding)), model],
      )
    },
  }
}
