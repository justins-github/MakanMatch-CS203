// One line of the Demo panel: what it is, where it stands, and what you can do.
// `detail` is the longer story behind the state, on hover.
export default function DemoRow({ title, state, detail, on = false, children }) {
  return (
    <div className={`demo-row${on ? ' on' : ''}`}>
      <div className="demo-row-text">
        <div className="demo-row-title">{title}</div>
        <div className="demo-row-state" title={detail}>{state}</div>
      </div>
      <div className="demo-row-actions">{children}</div>
    </div>
  )
}
