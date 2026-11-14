import { useState } from 'react'

// A side column that can be folded to a thin strip. `title` is shown on the strip when folded.
function Side({ side, title, open, onToggle, children }) {
  return (
    <aside className={`shell__side shell__side--${side}${open ? '' : ' shell__side--closed'}`} aria-label={title}>
      <button
        type="button"
        className="shell__fold"
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} ${title}`}
        title={`${open ? 'Hide' : 'Show'} ${title}`}
        onClick={onToggle}
      >
        {open ? (side === 'left' ? '‹' : '›') : side === 'left' ? '›' : '‹'}
        {!open && <span className="shell__fold-label">{title}</span>}
      </button>
      {open && <div className="shell__sidebody">{children}</div>}
    </aside>
  )
}

/**
 * The dashboard frame of the mockup: top bar (brand and scores), left and right side columns that fold,
 * a rail of tabs next to the main stage, and the shared timeline at the bottom. Desktop browsers only.
 * tabs: [{ key, label, hint }], tab: the active key.
 */
export default function Shell({ top, left, leftTitle, right, rightTitle, bottom, tabs, tab, onTab, children }) {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const columns = `${leftOpen ? 'minmax(280px, 330px)' : '44px'} minmax(0, 1fr) ${rightOpen ? 'minmax(280px, 340px)' : '44px'}`
  return (
    <div className="shell">
      <header className="shell__top">{top}</header>
      <div className="shell__body" style={{ gridTemplateColumns: columns }}>
        <Side side="left" title={leftTitle} open={leftOpen} onToggle={() => setLeftOpen((o) => !o)}>
          {left}
        </Side>
        <main className="shell__center">
          <nav className="rail" role="tablist" aria-orientation="vertical" aria-label="Views">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="stage"
                className={`rail__tab${tab === t.key ? ' rail__tab--active' : ''}`}
                title={t.hint}
                onClick={() => onTab(t.key)}
              >
                <span className="rail__icon" aria-hidden="true">
                  {t.icon}
                </span>
                <span className="rail__label">{t.label}</span>
              </button>
            ))}
          </nav>
          <section className="stage" id="stage" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {children}
          </section>
        </main>
        <Side side="right" title={rightTitle} open={rightOpen} onToggle={() => setRightOpen((o) => !o)}>
          {right}
        </Side>
      </div>
      <footer className="shell__bottom">{bottom}</footer>
    </div>
  )
}
