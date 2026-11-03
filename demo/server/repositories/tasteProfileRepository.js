// SQL for taste.taste_profiles: the learned Taste DNA and taste vector per user.
import { parseVector, toVectorLiteral } from '../db/pgvector.js'

export function tasteProfileRepository(db) {
  return {
    async get(userId) {
      const { rows } = await db.query('select profile from taste.taste_profiles where user_id = $1', [userId])
      return rows[0]?.profile ?? null
    },

    async save(userId, profile) {
      await db.query(
        `insert into taste.taste_profiles (user_id, profile) values ($1, $2::jsonb)
         on conflict (user_id) do update set profile = excluded.profile, updated_at = now()`,
        [userId, JSON.stringify(profile)],
      )
    },

    // Only updates an existing row: the profile is always saved first.
    async saveVector(userId, vector) {
      await db.query(
        'update taste.taste_profiles set taste_vector = $2::vector, updated_at = now() where user_id = $1',
        [userId, toVectorLiteral(vector)],
      )
    },

    async getVector(userId) {
      const { rows } = await db.query(
        'select taste_vector::text as v from taste.taste_profiles where user_id = $1',
        [userId],
      )
      return parseVector(rows[0]?.v ?? null)
    },

    async deleteForUser(userId) {
      await db.query('delete from taste.taste_profiles where user_id = $1', [userId])
    },
  }
}
