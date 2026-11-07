import { useEffect, useState } from 'react'
import { addDish, getMenu, reportPrice, updateDish } from '../../api/catalogApi.js'
import { Accordion, Fold, Unsaved, useAccordion } from '../Accordion.jsx'
import MenuPhotoScan from './MenuPhotoScan.jsx'
import PriceListEditor from './PriceListEditor.jsx'

const money = (v) => (v == null ? null : `$${Number(v).toFixed(2)}`)
const SOURCE = { OWNER: 'official', DINER: 'added by a diner', SEED: 'from our starter data' }

function DishRow({ dish, onChanged, onRemoved }) {
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setPrice('')
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const setOfficial = (value) => run(() => reportPrice(dish.id, Number(value)))
  const remove = () =>
    run(async () => {
      await updateDish(dish.id, { archived: true })
      onRemoved(dish)
    })

  const aside = (
    <>
      {dish.priceConflict && <span className="pill rejected">Check price</span>}
      <span className="menu-price">{money(dish.officialPrice) ?? money(dish.price) ?? 'no price'}</span>
    </>
  )

  return (
    <li>
      <Fold
        id={dish.id}
        sub
        title={dish.name}
        summary={`${SOURCE[dish.source]}${dish.officialPrice == null ? ' · price unconfirmed' : ''}`}
        aside={aside}
      >
        {dish.priceConflict && (
          <div className="price-stamp" role="note">
            <strong>Diners paid {money(dish.communityPrice)}</strong> since you set {money(dish.officialPrice)}.
            Update the menu if the price changed.
            <button type="button" className="btn stamp-btn" disabled={busy} onClick={() => setOfficial(dish.communityPrice)}>
              Make {money(dish.communityPrice)} official
            </button>
          </div>
        )}

        <div className="menu-actions">
          <input
            className="price-input"
            type="number"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            placeholder="New price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label={`New official price for ${dish.name}`}
          />
          <button type="button" className="btn go" disabled={!price || busy} onClick={() => setOfficial(price)}>
            Set price
          </button>
          <button type="button" className="btn quiet" disabled={busy} onClick={remove}>
            Remove
          </button>
        </div>
        <Unsaved when={price !== ''} />
        {error && <div className="error">{error}</div>}
      </Fold>
    </li>
  )
}

// The official menu. Diners' price reports are kept separately, so when what
// diners paid drifts from what the menu says, the owner sees it here.
export default function MenuEditor({ venueId }) {
  const accordion = useAccordion()
  const [dishes, setDishes] = useState(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [scan, setScan] = useState(null) // { sample, dishes, photoUrl } while checking a menu photo
  const [savedNote, setSavedNote] = useState(null)
  const [removed, setRemoved] = useState([]) // dishes removed on this visit, each with its Undo

  const load = () =>
    getMenu(venueId)
      .then(setDishes)
      .catch((err) => setError(err.message))

  const dropUndo = (dish) => setRemoved((list) => list.filter((d) => d.id !== dish.id))

  const putBack = async (dish) => {
    setBusy(true)
    setError(null)
    try {
      await updateDish(dish.id, { archived: false })
      dropUndo(dish)
      await load()
    } catch (err) {
      setError(err.message)
      if (err.status === 409) dropUndo(dish) // its name is on the menu again, so Undo can't work
    } finally {
      setBusy(false)
    }
  }

  // The photo preview is an object URL; let it go once the scan is done with.
  useEffect(() => () => scan?.photoUrl && URL.revokeObjectURL(scan.photoUrl), [scan])

  const startEditing = (fromScan = null) => {
    setSavedNote(null)
    setScan(fromScan)
    setEditing(true)
  }

  // The scan matched dishes against the live menu; show that same menu.
  const photoRead = async (result) => {
    await load()
    startEditing(result)
  }

  const stopEditing = () => {
    setEditing(false)
    setScan(null)
  }

  const listSaved = (menu, count) => {
    setDishes(menu)
    stopEditing()
    setSavedNote(`Saved ${count} change${count === 1 ? '' : 's'}. Diners see the new menu right away.`)
  }

  useEffect(() => {
    load()
  }, [venueId])

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await addDish(venueId, name.trim(), price ? Number(price) : null)
      setName('')
      setPrice('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const conflicts = dishes?.filter((d) => d.priceConflict).length ?? 0
  const summary = dishes && [
    `${dishes.length} dish${dishes.length === 1 ? '' : 'es'}`,
    conflicts > 0 && `${conflicts} price${conflicts === 1 ? '' : 's'} to check`,
  ].filter(Boolean).join(' · ')

  if (editing) {
    return (
      <Fold id="menu" title="Menu and prices" summary={summary}>
        <div className="panel-title">{scan ? 'Check your menu photo' : 'Edit price list'}</div>
        {!scan && <p className="panel-note">Type new prices, add dishes, tick dishes to remove, then save them all at once.</p>}
        <PriceListEditor venueId={venueId} dishes={dishes} scan={scan} onSaved={listSaved} onCancel={stopEditing} />
      </Fold>
    )
  }

  return (
    <Fold id="menu" title="Menu and prices" summary={summary}>
      {dishes && (
        <>
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => startEditing()}>
              Edit price list
            </button>
          </div>
          <MenuPhotoScan venueId={venueId} onStart={() => accordion?.setOpen('menu')} onRead={photoRead} />
        </>
      )}
      {savedNote && <div className="ok-note">{savedNote}</div>}
      {removed.map((d) => (
        <div key={d.id} className="removed-note" role="status">
          <span className="ok-note">Removed {d.name}. Diners no longer see it.</span>
          <button type="button" className="btn quiet" disabled={busy} onClick={() => putBack(d)}>
            Undo
          </button>
        </div>
      ))}
      {conflicts > 0 && (
        <p className="panel-note">
          {conflicts === 1 ? '1 dish has' : `${conflicts} dishes have`} a price diners disagree with.
        </p>
      )}
      {!dishes && !error && <div className="loading">Loading the menu…</div>}
      {dishes?.length === 0 && <p className="panel-note">No dishes yet. Add your first one below.</p>}
      {dishes?.length > 0 && (
        <Accordion>
          <ul className="fold-list">
            {dishes.map((d) => (
              <DishRow key={d.id} dish={d} onChanged={load} onRemoved={(dish) => setRemoved((list) => [...list, dish])} />
            ))}
          </ul>
        </Accordion>
      )}

      <form className="menu-add" onSubmit={add}>
        <input className="search-input" placeholder="Dish name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="New dish name" />
        <input className="search-input price-input" type="number" min="0.1" step="0.1" inputMode="decimal" placeholder="Price (S$)" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="New dish price" />
        <button type="submit" className="btn go" disabled={!name.trim() || busy}>
          Add dish
        </button>
      </form>
      <Unsaved when={name.trim() !== '' || price !== ''} />
      {error && <div className="error">{error}</div>}
    </Fold>
  )
}
