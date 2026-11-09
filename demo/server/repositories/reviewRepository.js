// SQL for taste.reviews. `db` is anything with query(text, params): the pool, or
// a transaction from db.tx(), so the same code runs inside or outside one.
import { TREND_WINDOW } from '../trends.js'

export function reviewRepository(db) {
  return {
    // profile_before only comes back for the reviews that use it: the latest
    // (Undo) and the last few (trends.js).
    async listForUser(userId) {
      const { rows } = await db.query(
        `select dish_id, dish_name, venue_id, rating, sentiment, tags, body, signals, read_by, score10, predicted, actual, created_at,
                undone_at is not null as undone,
                case when row_number() over (order by created_at desc, id desc) <= $2 then profile_before end as profile_before
           from taste.reviews where user_id = $1 order by created_at, id`,
        [userId, TREND_WINDOW],
      )
      return rows.map(toReview)
    },

    async insert(userId, review) {
      await db.query(
        `insert into taste.reviews
           (user_id, dish_id, dish_name, venue_id, rating, sentiment, tags, body, signals, read_by, profile_before,
            score10, predicted, actual, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          userId,
          review.dishId,
          review.dishName,
          review.venueId,
          review.rating,
          review.sentiment ?? null,
          review.tags ?? [],
          review.text ?? '',
          review.signals ? JSON.stringify(review.signals) : null,
          review.readBy ?? null,
          review.profileBefore ? JSON.stringify(review.profileBefore) : null,
          review.score10 ?? null,
          review.predicted,
          review.actual,
          review.at,
        ],
      )
    },

    async markLatestUndone(userId) {
      await db.query(
        `update taste.reviews set undone_at = now()
          where id = (select id from taste.reviews where user_id = $1 order by created_at desc, id desc limit 1)`,
        [userId],
      )
    },

    async deleteForUser(userId) {
      await db.query('delete from taste.reviews where user_id = $1', [userId])
    },

    // Other people's reviews: never undone ones, and never profile_before, which is private.
    // venueIds null means every venue.
    async listRecentAtVenues(venueIds, since) {
      if (venueIds?.length === 0) return []
      const { rows } = await db.query(
        `select ${SHARED_COLUMNS} from taste.reviews
          where ${SHAREABLE} and created_at >= $1 and ($2::text[] is null or venue_id = any($2::text[]))
          order by created_at desc, id desc`,
        [since, venueIds],
      )
      return rows.map(toSharedReview)
    },

    async listAtVenue(venueId, limit) {
      const { rows } = await db.query(
        `select ${SHARED_COLUMNS} from taste.reviews
          where ${SHAREABLE} and venue_id = $1
          order by created_at desc, id desc limit $2`,
        [venueId, limit],
      )
      return rows.map(toSharedReview)
    },

    async listByUsers(userIds, { limit, since = null }) {
      if (userIds.length === 0) return []
      const { rows } = await db.query(
        `select ${SHARED_COLUMNS} from taste.reviews
          where ${SHAREABLE} and user_id = any($1::uuid[]) and ($2::timestamptz is null or created_at >= $2::timestamptz)
          order by created_at desc, id desc limit $3`,
        [userIds, since, limit],
      )
      return rows.map(toSharedReview)
    },

    // user id -> how many reviews they stand by.
    async countByUsers(userIds) {
      if (userIds.length === 0) return new Map()
      const { rows } = await db.query(
        `select user_id, count(*)::int as reviews from taste.reviews
          where undone_at is null and user_id = any($1::uuid[]) group by user_id`,
        [userIds],
      )
      return new Map(rows.map((row) => [row.user_id, row.reviews]))
    },
  }
}

const SHARED_COLUMNS = 'user_id, dish_id, dish_name, venue_id, rating, sentiment, tags, body, signals, read_by, score10, predicted, actual, created_at'
const SHAREABLE = 'undone_at is null and sentiment is not null'
const toSharedReview = (row) => ({ userId: row.user_id, ...toReview(row) })

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
    ...(row.signals != null ? { signals: row.signals } : {}),
    ...(row.read_by != null ? { readBy: row.read_by } : {}),
    ...(row.profile_before != null ? { profileBefore: row.profile_before } : {}),
    ...(row.undone ? { undone: true } : {}),
    ...(row.score10 != null ? { score10: Math.round(row.score10 * 10) / 10 } : {}),
    predicted: row.predicted,
    actual: row.actual,
    at: new Date(row.created_at).toISOString(),
  }
}
