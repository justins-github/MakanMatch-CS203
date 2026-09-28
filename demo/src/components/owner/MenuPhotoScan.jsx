import { useEffect, useRef, useState } from 'react'
import { scanMenu } from '../../api/catalogApi.js'

const SENDABLE = ['image/jpeg', 'image/png', 'image/webp']
const SMALL_ENOUGH = 1.5 * 1024 * 1024
const MAX_EDGE = 2000 // a menu still reads fine at 2000px on the long edge

// Phone photos run 3-10 MB; redraw big ones (and HEIC or other formats the browser
// can decode) as a JPEG before upload. Returns the file unchanged when it's fine.
async function prepare(file) {
  if (SENDABLE.includes(file.type) && file.size <= SMALL_ENOUGH) return file
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("That file isn't a photo we can read - use a JPEG, PNG or WebP picture.")
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  return jpeg ? new File([jpeg], 'menu.jpg', { type: 'image/jpeg' }) : file
}

const canReadClipboard = typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'

// Take a photo of the menu, pick one, or paste a screenshot (button or Ctrl+V
// anywhere on the page). The catalog reads it and onRead gets
// { sample, dishes: [{ name, price, dishId }], photoUrl } for the owner to review.
export default function MenuPhotoScan({ venueId, onRead }) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const input = useRef(null)
  const scanRef = useRef(null)

  const scan = async (file) => {
    if (busy) return
    setError(null)
    setBusy(true)
    let url = null
    try {
      const photo = await prepare(file)
      url = URL.createObjectURL(photo)
      setPreview(url)
      const result = await scanMenu(venueId, photo)
      onRead({ ...result, photoUrl: url })
    } catch (err) {
      if (url) URL.revokeObjectURL(url)
      setError(err.message)
    } finally {
      setPreview(null)
      setBusy(false)
    }
  }
  scanRef.current = scan

  // Ctrl+V / Cmd+V with an image on the clipboard; ordinary text pastes are left alone.
  useEffect(() => {
    const onPaste = (e) => {
      const image = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!image) return
      e.preventDefault()
      scanRef.current(image)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const pasteFromClipboard = async () => {
    let items
    try {
      items = await navigator.clipboard.read()
    } catch {
      setError("Your browser didn't let us read the clipboard. Press Ctrl+V (Cmd+V on a Mac) on this page instead.")
      return
    }
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'))
      if (type) return scan(new File([await item.getType(type)], 'pasted', { type }))
    }
    setError('There is no picture on your clipboard - copy a photo or screenshot of your menu first.')
  }

  const picked = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // picking the same photo again still counts
    if (file) scan(file)
  }

  return (
    <div className="menu-scan">
      {busy ? (
        <div className="menu-scan-busy" role="status">
          {preview && <img src={preview} alt="" />}
          <span>Reading your menu…</span>
        </div>
      ) : (
        <>
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => input.current.click()}>
              📷 Menu photo
            </button>
            {canReadClipboard && (
              <button type="button" className="btn quiet" onClick={pasteFromClipboard}>
                Paste image
              </button>
            )}
          </div>
          <small className="menu-scan-hint">Snap your menu board, or paste a screenshot with Ctrl+V. We fill in the price list for you to check.</small>
        </>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={picked} />
      {error && <div className="error">{error}</div>}
    </div>
  )
}
