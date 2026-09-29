import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'

// Collapsible sections for the profile, owner and admin screens. Everything starts
// closed and opening one closes its siblings, so a screen shows one thing at a time.
// Folds nest (each level needs its own <Accordion>). Closed sections stay mounted,
// so a half-filled form keeps its edits and its header says they aren't saved yet.
const OpenContext = createContext(null)
const UnsavedContext = createContext(null)

export function Accordion({ children }) {
  const [open, setOpen] = useState(null)
  return <OpenContext.Provider value={{ open, setOpen }}>{children}</OpenContext.Provider>
}

// Lets a section open itself, e.g. the menu when a pasted photo starts scanning.
export const useAccordion = () => useContext(OpenContext)

// Tell every Fold around this component whether it holds unsaved edits.
function useReportUnsaved(unsaved) {
  const report = useContext(UnsavedContext)
  const key = useId()
  useEffect(() => {
    if (!report) return
    report(key, unsaved)
    return () => report(key, false)
  }, [report, key, unsaved])
}

// Red warning under a save button; the Folds above it pick it up too.
export function Unsaved({ when }) {
  useReportUnsaved(when)
  return when ? <p className="unsaved">Unsaved changes</p> : null
}

const Chevron = () => (
  <svg className="fold-arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// `sub` is the lighter style for folds inside a fold. With onSubmit the body is the <form>.
// onOpen runs each time the fold opens, e.g. to refetch a list that went stale while closed.
export function Fold({ id, title, summary, aside, sub = false, className = '', onOpen, onSubmit, children }) {
  const { open, setOpen } = useContext(OpenContext)
  const isOpen = open === id
  const bodyId = useId()
  const headRef = useRef(null)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  const [unsavedInside, setUnsavedInside] = useState({})
  const report = useCallback(
    (key, unsaved) => setUnsavedInside((all) => (all[key] === unsaved ? all : { ...all, [key]: unsaved })),
    [],
  )
  const unsaved = Object.values(unsavedInside).some(Boolean)
  useReportUnsaved(unsaved)

  // Closing a long section above can leave this header off screen.
  useEffect(() => {
    if (!isOpen) return
    headRef.current?.scrollIntoView({ block: 'nearest' })
    onOpenRef.current?.()
  }, [isOpen])

  const Body = onSubmit ? 'form' : 'div'
  const Heading = sub ? 'h4' : 'h3'
  return (
    <section className={`panel fold${sub ? ' sub' : ''}${isOpen ? ' open' : ''} ${className}`.trim()}>
      <Heading className="fold-heading">
        <button
          ref={headRef}
          type="button"
          className="fold-head"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => setOpen(isOpen ? null : id)}
        >
          <span className="fold-text">
            <span className="fold-title">{title}</span>
            {summary && <span className="fold-summary">{summary}</span>}
            {unsaved && !isOpen && <span className="unsaved">Unsaved changes</span>}
          </span>
          {aside && <span className="fold-aside">{aside}</span>}
          <Chevron />
        </button>
      </Heading>
      <Body id={bodyId} className="fold-body" hidden={!isOpen} onSubmit={onSubmit}>
        <UnsavedContext.Provider value={report}>{children}</UnsavedContext.Provider>
      </Body>
    </section>
  )
}
