// SQL for taste.trend_decisions: which trends a user accepted or dismissed (CSD-56).
// The first choice on a trend stands; later ones for the same trend are ignored.

export function trendDecisionRepository(db) {
  return {
    async list(userId) {
      const { rows } = await db.query(
        `select trend_key as key, direction, decision from taste.trend_decisions
          where user_id = $1 order by trend_key, direction`,
        [userId],
      )
      return rows
    },

    async insert(userId, decisions) {
      for (const { key, direction, decision } of decisions) {
        await db.query(
          `insert into taste.trend_decisions (user_id, trend_key, direction, decision) values ($1, $2, $3, $4)
           on conflict (user_id, trend_key, direction) do nothing`,
          [userId, key, direction, decision],
        )
      }
    },

    async deleteForUser(userId) {
      await db.query('delete from taste.trend_decisions where user_id = $1', [userId])
    },
  }
}
