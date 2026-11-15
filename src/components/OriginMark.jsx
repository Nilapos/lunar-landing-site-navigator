// The mark next to a number of the Mission tab: where it comes from (see valueOrigin in vehicles.js). A published number has no mark
// (its source shows when the value is hovered); an estimate, a reference value or a number typed by the user has one.
import { originText } from '../data/vehicles.js'

const MARKS = {
  estimate: { symbol: '≈', label: 'Estimate' },
  reference: { symbol: '◇', label: 'Reference' },
  edited: { symbol: '●', label: 'Edited' },
}

/** origin: { origin, from, source } of valueOrigin; edited: the user typed this number (`editedFrom` says what the vehicle says). */
export default function OriginMark({ origin, edited = false, editedFrom = '' }) {
  const kind = edited ? 'edited' : origin.origin
  const mark = MARKS[kind]
  if (!mark) return null
  const title = edited ? `Changed by you. ${editedFrom}` : originText(origin)
  return (
    <span className={`origin origin--${kind}`} title={title}>
      <span aria-hidden="true">{mark.symbol}</span> {mark.label}
      <span className="origin__why">{title}</span>
    </span>
  )
}
