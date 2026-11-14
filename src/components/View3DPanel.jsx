import { lazy, Suspense, useState } from 'react'

// The 3D library and data are only downloaded when the user asks for the 3D view.
const Terrain3D = lazy(() => import('./Terrain3D.jsx'))

export default function View3DPanel(props) {
  const [open, setOpen] = useState(false)
  return (
    <section className="panel" aria-label="3D view of the south pole">
      <div className="requirements__head">
        <h2 className="panel__title">3D view of the south pole</h2>
        {!open && (
          <button type="button" className="button" onClick={() => setOpen(true)}>
            Open the 3D view (loads about 2 MB of 3D library and data)
          </button>
        )}
      </div>
      {open && (
        <Suspense fallback={<p className="notice">Loading the 3D view…</p>}>
          <Terrain3D {...props} />
        </Suspense>
      )}
    </section>
  )
}
