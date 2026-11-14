// Small formatting helpers for durations, percentages and UTC dates.

const DAY_MS = 86400000

/** 3 600 000 -> "1 h"; 90 000 000 -> "25 h"; 5e8 -> "5.8 days". null -> "-". */
export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '-'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  if (hours < 48) {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return m ? `${h} h ${m} min` : `${h} h`
  }
  return `${(hours / 24).toFixed(1)} days`
}

/** 0.4 -> "40 %". */
export function formatPercent(fraction) {
  return `${Math.round(fraction * 100)} %`
}

/** Timestamp (ms) -> "Nov 14" (UTC). */
export function formatDay(ms) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Timestamp (ms) -> "Nov 14, 03:00 UT". */
export function formatUtc(ms) {
  const d = new Date(ms)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${formatDay(ms)}, ${hh}:${mm} UT`
}

/** "2026-11-14" + 30 -> "2026-12-14"; "2026-11-14T08:30" + 2 -> "2026-11-16T08:30". Same shape as the input. */
export function addDaysIso(value, days) {
  const hasTime = value.includes('T')
  const ms = Date.parse(hasTime ? `${value}:00Z` : `${value}T00:00:00Z`) + days * DAY_MS
  const iso = new Date(ms).toISOString()
  return hasTime ? iso.slice(0, 16) : iso.slice(0, 10)
}

/** Today's date in UTC as "YYYY-MM-DD". */
export function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

/** "2026-11-14T08:30" -> "2026-11-14 08:30" (for display). */
export function showDateTime(value) {
  return value.replace('T', ' ')
}
