import { useState } from 'react'
import { editMenu } from '../../api/catalogApi.js'

const money = (v) => (v == null ? '-' : `$${Number(v).toFixed(2)}`)
let nextKey = 0
const blankRow = () => ({ key: nextKey++, name: '', price: '' })

// A typed price counts only when it's a real change from what's on the menu now.
const priceChanged = (row) => row.newPrice !== '' && Number(row.newPrice) !== Number(row.current)

// One row per dish on the menu; a menu scan pre-fills the prices it read.
function menuRows(dishes, scan) {
  const read = new Map((scan?.dishes ?? []).filter((d) => d.dishId && d.price != null).map((d) => [d.dishId, d.price]))
  return dishes.map((d) => {
    const current = d.officialPrice ?? d.price
    const scanned = read.get(d.id)
    const newPrice = scanned != null && Number(scanned) !== Number(current) ? String(scanned) : ''
    return { dishId: d.id, name: d.name, current, newPrice, remove: false }
  })
}

// Dishes a scan found that aren't in the table become new rows - including any
// matched to a dish this page hasn't loaded, so nothing read off the photo is lost.
function newRows(dishes, scan) {
  const shown = new Set(dishes.map((d) => d.id))
  const found = (scan?.dishes ?? [])
    .filter((d) => !shown.has(d.dishId))
    .map((d) => ({ ...blankRow(), name: d.name, price: d.price == null ? '' : String(d.price) }))
  return found.length > 0 ? found : [blankRow()]
}

// The whole menu as one table: change several prices, add dishes, tick dishes
// to remove, then save everything together (the catalog applies it all or nothing).
// With a menu scan, the table starts filled in from the photo for the owner to check.
export default function PriceListEditor({ venueId, dishes, scan, onSaved, onCancel }) {
  const [rows, setRows] = useState(() => menuRows(dishes, scan))
  const [added, setAdded] = useState(() => newRows(dishes, scan))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const editRow = (dishId, change) => setRows((current) => current.map((r) => (r.dishId === dishId ? { ...r, ...change } : r)))
  const editAdded = (key, change) => setAdded((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)))

  const changes = {
    prices: rows.filter((r) => !r.remove && priceChanged(r)).map((r) => ({ dishId: r.dishId, price: Number(r.newPrice) })),
    added: added.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), price: r.price === '' ? null : Number(r.price) })),
    removed: rows.filter((r) => r.remove).map((r) => r.dishId),
  }
  const count = changes.prices.length + changes.added.length + changes.removed.length

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSaved(await editMenu(venueId, changes), count)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="price-list" onSubmit={save}>
      {scan && (
        <div className={`scan-banner${scan.sample ? ' sample' : ''}`}>
          {scan.photoUrl && <img src={scan.photoUrl} alt="Your menu photo" />}
          <p>
            {scan.sample ? (
              <>
                <strong>Sample result.</strong> Reading real photos isn't switched on yet, so these rows are made up.{' '}
              </>
            ) : (
              'Read from your photo. '
            )}
            Check every row - nothing is saved until you press Save.
          </p>
        </div>
      )}
      <table className="price-table">
        <thead>
          <tr>
            <th scope="col">Dish</th>
            <th scope="col">Now</th>
            <th scope="col">New price</th>
            <th scope="col">Remove</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.dishId} className={r.remove ? 'removing' : priceChanged(r) ? 'changed' : undefined}>
              <td className="price-table-name">{r.name}</td>
              <td className="price-table-now">{money(r.current)}</td>
              <td>
                <input
                  className="price-input"
                  type="number"
                  min="0.1"
                  max="999.99"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={r.current == null ? 'S$' : Number(r.current).toFixed(2)}
                  value={r.newPrice}
                  disabled={r.remove}
                  onChange={(e) => editRow(r.dishId, { newPrice: e.target.value })}
                  aria-label={`New price for ${r.name}`}
                />
              </td>
              <td className="price-table-remove">
                <input type="checkbox" checked={r.remove} onChange={(e) => editRow(r.dishId, { remove: e.target.checked })} aria-label={`Remove ${r.name}`} />
              </td>
            </tr>
          ))}
          {added.map((r) => (
            <tr key={r.key} className={r.name.trim() ? 'adding' : undefined}>
              <td colSpan={2}>
                <input className="search-input" placeholder="New dish" maxLength={80} value={r.name} onChange={(e) => editAdded(r.key, { name: e.target.value })} aria-label="New dish name" />
              </td>
              <td>
                <input
                  className="price-input"
                  type="number"
                  min="0.1"
                  max="999.99"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="S$"
                  value={r.price}
                  onChange={(e) => editAdded(r.key, { price: e.target.value })}
                  aria-label={`Price for ${r.name.trim() || 'the new dish'}`}
                />
              </td>
              <td className="price-table-remove">
                <button type="button" className="hours-remove" onClick={() => setAdded((current) => current.filter((x) => x.key !== r.key))} aria-label="Drop this new row">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="hours-add" onClick={() => setAdded((current) => [...current, blankRow()])}>
        + Another new dish
      </button>

      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button type="submit" className="btn go" disabled={busy || count === 0}>
          {busy ? 'Saving…' : count === 0 ? 'No changes yet' : `Save ${count} change${count === 1 ? '' : 's'}`}
        </button>
        <button type="button" className="btn quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
