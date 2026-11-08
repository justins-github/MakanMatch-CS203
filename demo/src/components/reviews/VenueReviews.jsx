import { useEffect, useState } from 'react'
import { getVenueReviews } from '../../api/engineApi.js'
import Avatar from '../kakis/Avatar.jsx'
import { ClosenessPill, Verdict } from './ReviewParts.jsx'
import { relativeDay } from './when.js'

function ReviewRow({ review, onOpenReviewer }) {
  const { reviewer } = review
  const open = () => onOpenReviewer(reviewer.id)
  return (
    <div className={`rv-row${review.faded ? ' faded' : ''}`}>
      <button type="button" className="rv-face" aria-label={`See ${reviewer.displayName}'s profile`} onClick={open}>
        <Avatar id={reviewer.id} name={reviewer.displayName} />
      </button>
      <div className="rv-body">
        <button type="button" className="rv-who" onClick={open}>
          {review.isYou ? 'You' : reviewer.displayName}
          {reviewer.username && <span className="rv-handle"> @{reviewer.username}</span>}
        </button>
        <div className="rv-tags">
          {review.isKaki && <span className="rv-pill kaki">your kaki</span>}
          {!review.isYou && <ClosenessPill closeness={review.closeness} />}
          {review.counts && <span className="rv-counts">{review.counts}</span>}
          <Verdict sentiment={review.sentiment} />
        </div>
        {review.text && <div className="rv-said">{review.text}</div>}
        <div className="rv-meta">{review.dishName} · {relativeDay(review.at)}</div>
      </div>
    </div>
  )
}

// What people said about a venue, closest to your taste first. Loads when the card opens,
// and a failure here never touches the card.
export default function VenueReviews({ venueId, onOpenReviewer }) {
  const [reviews, setReviews] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    getVenueReviews(venueId)
      .then((answer) => live && setReviews(answer.reviews))
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [venueId])

  return (
    <section className="rv-section" aria-label="Reviews">
      <div className="rv-title">Reviews · closest to your taste first</div>
      {error && <div className="rv-note">Reviews unavailable: {error}</div>}
      {!error && !reviews && <div className="rv-note">Loading reviews…</div>}
      {reviews?.length === 0 && <div className="rv-note">No reviews yet.</div>}
      {reviews?.map((review) => (
        <ReviewRow key={review.reviewer.id} review={review} onOpenReviewer={onOpenReviewer} />
      ))}
    </section>
  )
}
