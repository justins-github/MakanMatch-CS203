// Daily snapshots of the learned Taste DNA, retained for the last 30 days.
export function tasteProfileHistoryRepository(db) {
  return {
    async saveSnapshot(userId, profile, recordedAt = new Date()) {
      const snapshotDate = recordedAt.toISOString().slice(0, 10)
      await db.query(
        `insert into taste.taste_profile_history (user_id, snapshot_date, profile)
         values ($1, $2::date, $3::jsonb)
         on conflict (user_id, snapshot_date) do update
         set profile = excluded.profile, updated_at = now()`,
        [userId, snapshotDate, JSON.stringify(profile)],
      )
      await db.query(
        `delete from taste.taste_profile_history
         where user_id = $1 and updated_at < now() - interval '30 days'`,
        [userId],
      )
    },

    async listRecent(userId) {
      const { rows } = await db.query(
        `select profile, updated_at as "recordedAt"
         from taste.taste_profile_history
         where user_id = $1 and updated_at >= now() - interval '30 days'
         order by snapshot_date`,
        [userId],
      )
      return rows
    },

    async deleteForUser(userId) {
      await db.query('delete from taste.taste_profile_history where user_id = $1', [userId])
    },
  }
}
