import { useEffect } from 'react'
import Icon from './Icon.jsx'

function RailButton({ item, active, onClick, role }) {
  return (
    <button
      type="button"
      role={role}
      id={role === 'tab' ? `tab-${item.key}` : undefined}
      aria-selected={role === 'tab' ? active : undefined}
      aria-controls={role === 'tab' ? 'stage' : undefined}
      aria-expanded={role === 'tab' ? undefined : active}
      className={`rail__tab${active ? ' rail__tab--active' : ''}`}
      title={item.hint}
      onClick={onClick}
    >
      <span className="rail__icon" aria-hidden="true">
        <Icon className="rail__svg" name={item.key} />
      </span>
      <span className="rail__label">{item.label}</span>
    </button>
  )
}

/**
 * The frame of the dashboard (desktop browsers only): a slim top bar, a rail of icons, the stage, the shared timeline at
 * the bottom. The rail holds the views (tabs) and, at its foot, drawers (settings, missions) that open over the stage
 * instead of taking a column.
 *   tabs / drawers: [{ key, label, hint }] (the key also names the icon);  tab: active view;  drawer: open drawer or null.
 */
export default function Shell({ top, tabs, tab, onTab, drawers, drawer, onDrawer, drawerContent, bottom, children }) {
  useEffect(() => {
    if (!drawer) return undefined
    const onKey = (e) => e.key === 'Escape' && onDrawer(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer, onDrawer])
  const open = drawers.find((d) => d.key === drawer)

  return (
    <div className="shell">
      <header className="shell__top">{top}</header>
      <main className="shell__center">
        <nav className="rail" aria-label="Views and panels">
          <div className="rail__group" role="tablist" aria-orientation="vertical" aria-label="Views">
            {tabs.map((t) => (
              <RailButton key={t.key} role="tab" item={t} active={tab === t.key} onClick={() => onTab(t.key)} />
            ))}
          </div>
          <div className="rail__group rail__group--foot">
            {drawers.map((d) => (
              <RailButton key={d.key} item={d} active={drawer === d.key} onClick={() => onDrawer(drawer === d.key ? null : d.key)} />
            ))}
          </div>
        </nav>
        <section className="stage" id="stage" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {children}
          {open && (
            <>
              <div className="drawer__backdrop" onClick={() => onDrawer(null)} aria-hidden="true" />
              <aside className="drawer" aria-label={open.label}>
                <header className="drawer__head">
                  <h2 className="drawer__title">{open.label}</h2>
                  <button type="button" className="icon-button" aria-label={`Close ${open.label}`} onClick={() => onDrawer(null)}>
                    <Icon name="close" />
                  </button>
                </header>
                <div className="drawer__body">{drawerContent}</div>
              </aside>
            </>
          )}
        </section>
      </main>
      <footer className="shell__bottom">{bottom}</footer>
    </div>
  )
}
