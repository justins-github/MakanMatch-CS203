import { useEffect, useState } from 'react'
import { getVenue } from '../../api/catalogApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Accordion } from '../Accordion.jsx'
import MenuEditor from './MenuEditor.jsx'
import OpeningHoursForm from './OpeningHoursForm.jsx'
import VenueStatusForm from './VenueStatusForm.jsx'
import './owner.css'

const LISTING_SOURCE = {
  overture: 'Overture Maps open data',
  community: 'our curated data',
  'community+overture': 'Overture Maps open data and our curated data',
}

function VenueDetail({ venueId, onBack }) {
  const [venue, setVenue] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getVenue(venueId)
      .then(setVenue)
      .catch((err) => setError(err.message))
  }, [venueId])

  return (
    <>
      <button className="back-link" onClick={onBack}>
        ← Your venues
      </button>
      {error && <div className="error">{error}</div>}
      {venue && (
        <header className="owner-venue-head">
          <h2 className="step-title">{venue.name}</h2>
          <div className="venue-row-meta">
            {[venue.cuisine?.replace(/-/g, ' '), venue.address].filter(Boolean).join(' · ')}
          </div>
          <div className="venue-row-meta">
            Listing from {LISTING_SOURCE[venue.source] ?? 'our data'}
            {venue.sourceUpdatedAt && `, last checked ${new Date(venue.sourceUpdatedAt).toLocaleDateString('en-SG')}`}
          </div>
        </header>
      )}
      <Accordion>
        <VenueStatusForm venueId={venueId} />
        <OpeningHoursForm venueId={venueId} />
        <MenuEditor venueId={venueId} />
      </Accordion>
    </>
  )
}

export default function MyVenues() {
  const { me } = useAuth()
  const venues = me.ownedVenues
  const [selected, setSelected] = useState(venues.length === 1 ? venues[0].venueId : null)

  if (selected) {
    return (
      <main className="owner">
        <VenueDetail venueId={selected} onBack={() => setSelected(null)} />
      </main>
    )
  }

  return (
    <main className="owner">
      <h2 className="step-title">Your venues</h2>
      {venues.length === 0 ? (
        <p className="panel-note">
          You don't manage a venue yet. Claim one from Me, under Venues you run; an admin approves it.
          {me.admin && ' (Admins can also give themselves a test venue with the seed script.)'}
        </p>
      ) : (
        <div className="venue-list">
          {venues.map((v) => (
            <button key={v.venueId} className="venue-row" onClick={() => setSelected(v.venueId)}>
              <span className="venue-row-main">
                <span className="venue-row-name">{v.venueName}</span>
                <span className="venue-row-meta">Manage status, hours, menu and prices</span>
              </span>
              <span className="pill approved">Owner</span>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
