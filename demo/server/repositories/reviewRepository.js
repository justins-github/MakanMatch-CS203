// SQL for taste.reviews. `db` is anything with query(text, params): the pool, or
// a transaction from db.tx(), so the same code runs inside or outside one.

export function reviewRepository(db) {
  return {
    async listForUser(userId) {
      const { rows } = await db.query(
        `select dish_id, dish_name, venue_id, rating, sentiment, tags, body, score10, predicted, actual, created_at
           from taste.reviews where user_id = $1 order by created_at, id`,
        [userId],
      )
      return rows.map(toReview)
    },

    async insert(userId, review) {
      await db.query(
        `insert into taste.reviews
           (user_id, dish_id, dish_name, venue_id, rating, sentiment, tags, body, score10, predicted, actual, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          userId,
          review.dishId,
          review.dishName,
          review.venueId,
          review.rating,
          review.sentiment ?? null,
          review.tags ?? [],
          review.text ?? '',
          review.score10 ?? null,
          review.predicted,
          review.actual,
          review.at,
        ],
      )
    },

    async deleteForUser(userId) {
      await db.query('delete from taste.reviews where user_id = $1', [userId])
    },
  }
}

// Row -> the review shape learn.js works with (undefined, not null, for "absent").
function toReview(row) {
  return {
    dishId: row.dish_id,
    dishName: row.dish_name,
    venueId: row.venue_id,
    rating: row.rating,
    ...(row.sentiment != null ? { sentiment: row.sentiment } : {}),
    tags: row.tags ?? [],
    text: row.body,
    ...(row.score10 != null ? { score10: Math.round(row.score10 * 10) / 10 } : {}),
    predicted: row.predicted,
    actual: row.actual,
    at: new Date(row.created_at).toISOString(),
  }
}
