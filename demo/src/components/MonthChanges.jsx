// What changed since the month we started from, for you: the screen an admin's Month
// switch (Demo controls) stops on before going back to Find. Places you've been lead,
// then what left and what is new within your walk. "Gone" is never stated more firmly
// than we know it: only places the source marks closed are called closed.

const TAG = { closed: ['Closed', 'closed'], unlisted: ['Gone', 'gone'] }
const number = (n) => n.toLocaleString('en-SG')

function Row({ tag, kind, name, address, children }) {
  return (
    <div className="month-row">
      <span className={`month-tag ${kind}`}>{tag}</span>
      <div className="month-row-text">
        <div className="month-row-name">{name}</div>
        {address && <div className="month-row-where">{address}</div>}
        {children}
      </div>
    </div>
  )
}

// You can overrule us: the place comes back into your picks for this session.
function StillOpen({ id, onStillOpen }) {
  return (
    <button type="button" className="btn quiet month-still-open" onClick={() => onStillOpen(id)}>
      It's still open
    </button>
  )
}

export default function MonthChanges({ changes, onStillOpen, onDone }) {
  const { yours, gone, added, nearby, totals } = changes
  const since = changes.since.split(' ')[0] // "August 2026" -> "August"
  const count = yours.length + nearby.gone + nearby.added
  const moreGone = nearby.gone - gone.length
  const moreAdded = nearby.added - added.length

  return (
    <main className="feed month-changes">
      <h2 className="month-title">
        {count === 0
          ? `Nothing changed near you since ${since}`
          : `${number(count)} change${count === 1 ? '' : 's'} near you since ${since}`}
      </h2>
      {yours.length > 0 && <p className="month-note">Places you've been come first.</p>}

      {yours.map((v) => (
        <Row key={v.id} tag={TAG[v.reason][0]} kind={TAG[v.reason][1]} name={v.name} address={v.address}>
          <div>
            {v.reason === 'closed'
              ? `You gave it ${v.yourScore}/10. It has closed.`
              : `You gave it ${v.yourScore}/10. It's no longer listed, so it may have closed.`}
          </div>
          {v.replacement && (
            <div className="month-row-next">
              Closest to it nearby: {v.replacement.name}, {v.replacement.matchScore}% match.
            </div>
          )}
          <StillOpen id={v.id} onStillOpen={onStillOpen} />
        </Row>
      ))}

      {gone.map((v) => (
        <Row key={v.id} tag={TAG[v.reason][0]} kind={TAG[v.reason][1]} name={v.name} address={v.address}>
          <div>
            {v.reason === 'closed'
              ? `${v.distanceMin} min walk. It has closed.`
              : `${v.distanceMin} min walk. No longer listed, so it may have closed.`}
          </div>
          <StillOpen id={v.id} onStillOpen={onStillOpen} />
        </Row>
      ))}
      {moreGone > 0 && <p className="month-more">and {number(moreGone)} more gone nearby</p>}

      {added.map((v) => (
        <Row key={v.id} tag="New" kind="new" name={v.name} address={v.address}>
          <div>{v.matchScore}% match · {v.distanceMin} min walk. New to MakanMatch.</div>
        </Row>
      ))}
      {moreAdded > 0 && <p className="month-more">and {number(moreAdded)} more new nearby</p>}

      <p className="month-totals">
        Across Singapore: {number(totals.gone)} places gone, {number(totals.added)} new.
      </p>
      <button type="button" className="btn go month-done" onClick={onDone}>
        See my picks
      </button>
    </main>
  )
}
