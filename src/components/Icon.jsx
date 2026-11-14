// Line icons drawn on a 24x24 grid with the current text color. Decorative: always paired with a text label.
const PATHS = {
  // Rail of tabs
  sky: (
    <>
      <path d="M3 17a9 9 0 0 1 18 0" />
      <path d="M2 17h20" />
      <circle cx="16" cy="7" r="2.2" />
      <path d="M8 21h8" />
    </>
  ),
  terrain: (
    <>
      <path d="m2 19 6.5-10 4 6 2.5-3.5L22 19Z" />
      <path d="m8.5 9 1.8 2.7" />
      <circle cx="18" cy="5.5" r="1.6" />
    </>
  ),
  why: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7" />
      <path d="M12 17.2h.01" />
    </>
  ),
  analysis: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-5 3 3 5-6" />
    </>
  ),
  sites: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  site: (
    <>
      <circle cx="12" cy="5.5" r="2.4" />
      <path d="M12 8.5v6.5m0 0-3 6m3-6 3 6M7.5 11.5h9" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  missions: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </>
  ),
  mission: (
    <>
      <path d="M12 3 8 9v5l-3 4h14l-3-4V9Z" />
      <path d="M12 14v7M9 21h6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6h.01" />
    </>
  ),
  tune: (
    <>
      <path d="M5 4v16M12 4v16M19 4v16" />
      <circle cx="5" cy="14" r="2" />
      <circle cx="12" cy="8" r="2" />
      <circle cx="19" cy="15" r="2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  // Controls
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  play: <path d="M7 4.5v15l12-7.5Z" />,
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
}

export default function Icon({ name, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
