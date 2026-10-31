// SQL for taste.rankings: each user's dish leaderboard, best first.

export function rankingRepository(db) {
  return {
    async get(userId) {
      const { rows } = await db.query(
        'select dish_id from taste.rankings where user_id = $1 order by position',
        [userId],
      )
      return rows.map((r) => r.dish_id)
    },

    // Replaces the whole list; call inside a transaction.
    async replace(userId, dishIds) {
      await db.query('delete from taste.rankings where user_id = $1', [userId])
      if (dishIds.length === 0) return
      await db.query(
        `insert into taste.rankings (user_id, position, dish_id)
         select $1, t.ord - 1, t.dish_id from unnest($2::text[]) with ordinality as t(dish_id, ord)`,
        [userId, dishIds],
      )
    },

    async deleteForUser(userId) {
      await db.query('delete from taste.rankings where user_id = $1', [userId])
    },
  }
}
