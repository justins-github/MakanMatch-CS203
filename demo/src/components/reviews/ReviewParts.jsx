import './reviews.css'

const VERDICTS = { loved: 'Loved it', fine: 'It was fine', disliked: 'Not for me' }
const CLOSE = 70
const FAR = 40

export function Verdict({ sentiment }) {
  return <span className={`rv-verdict ${sentiment}`}>{VERDICTS[sentiment]}</span>
}

// How close their taste is to yours; null means there's too little to compare yet.
export function ClosenessPill({ closeness }) {
  if (closeness == null) return <span className="rv-pill">New here</span>
  const tone = closeness >= CLOSE ? ' close' : closeness < FAR ? ' far' : ''
  return <span className={`rv-pill${tone}`}>{closeness}% like you</span>
}
