import { useState } from 'react'

/**
 * A number input that can be typed in freely: while it has the focus it shows what is typed (even an empty or half-typed number) and
 * sends each valid number, clamped to [min, max]; the rest of the time it shows `value`, so a change from outside (another mission,
 * a reset, Settings) shows at once.
 */
export default function NumberField({ value, onChange, min, max, step, label, title, className = 'controls__input' }) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <input
      className={className}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      aria-label={label}
      title={title}
      value={focused ? draft : String(value)}
      onFocus={() => {
        setDraft(String(value))
        setFocused(true)
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setDraft(e.target.value)
        const v = e.target.valueAsNumber
        if (Number.isFinite(v)) onChange(Math.min(Math.max(v, min), max))
      }}
    />
  )
}
