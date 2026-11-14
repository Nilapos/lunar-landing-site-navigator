import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

// A small icon button that opens a floating panel (closes on a click elsewhere or Escape). Keeps rarely used
// controls and long explanations out of the way.
export default function Pop({ icon, label, children, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="pop" ref={ref}>
      <button type="button" className={`icon-button${open ? ' icon-button--active' : ''}`} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} />
      </button>
      {open && <div className={`pop__panel pop__panel--${align}`}>{children}</div>}
    </div>
  )
}
