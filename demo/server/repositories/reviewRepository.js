// SQL for taste.reviews. `db` is anything with query(text, params): the pool, or
// a transaction from db.tx(), so the same code runs inside or outside one.

export function reviewRepository(db) {
  return {
<<<<<<< Updated upstream
    async listForUser(userId) {
      const { rows } = await db.query(
        `select dish_id, dish_name, venue_id, rating, sentiment, tags, body, score10, predicted, actual, created_at
=======
    // Only the latest review can be undone, so only it brings its profile_before.
    async listForUser(userId) {
      const { rows } = await db.query(
        `select dish_id, dish_name, venue_id, rating, sentiment, tags, body, signals, read_by, score10, predicted, actual, created_at,
                undone_at is not null as undone,
                case when row_number() over (order by created_at desc, id desc) = 1 then profile_before end as profile_before
>>>>>>> Stashed changes
           from taste.reviews where user_id = $1 order by created_at, id`,
        [userId],
      )
      return rows.map(toReview)
    },

    async insert(userId, review) {
      await db.query(
        `insert into taste.reviews
<<<<<<< Updated upstream
           (user_id, dish_id, dish_name, venue_id, rating, sentiment, tags, body, score10, predicted, actual, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
=======
           (user_id, dish_id, dish_name, venue_id, rating, sentiment, tags, body, signals, read_by, profile_before,
            score10, predicted, actual, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
>>>>>>> Stashed changes
        [
          userId,
          review.dishId,
          review.dishName,
          review.venueId,
          review.rating,
          review.sentiment ?? null,
          review.tags ?? [],
          review.text ?? '',
<<<<<<< Updated upstream
=======
          review.signals ? JSON.stringify(review.signals) : null,
          review.readBy ?? null,
          review.profileBefore ? JSON.stringify(review.profileBefore) : null,
>>>>>>> Stashed changes
          review.score10 ?? null,
          review.predicted,
          review.actual,
          review.at,
        ],
      )
    },

<<<<<<< Updated upstream
=======
    async markLatestUndone(userId) {
      await db.query(
        `update taste.reviews set undone_at = now()
          where id = (select id from taste.reviews where user_id = $1 order by created_at desc, id desc limit 1)`,
        [userId],
      )
    },

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
    ...(row.signals != null ? { signals: row.signals } : {}),
    ...(row.read_by != null ? { readBy: row.read_by } : {}),
    ...(row.profile_before != null ? { profileBefore: row.profile_before } : {}),
    ...(row.undone ? { undone: true } : {}),
>>>>>>> Stashed changes
    ...(row.score10 != null ? { score10: Math.round(row.score10 * 10) / 10 } : {}),
    predicted: row.predicted,
    actual: row.actual,
    at: new Date(row.created_at).toISOString(),
  }
}
