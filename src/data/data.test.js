import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { missions } from './missions.js'
import { SITE_GROUPS, southPoleSites } from './south-pole-sites.js'

const readJson = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
const profiles = readJson('./horizon-profiles.json').profiles
const terrain = readJson('./site-terrain.json').sites

const isHttps = (s) => typeof s.url === 'string' && s.url.startsWith('https://') && s.label.length > 0

test('sites: unique ids, inside the LOLA map (80 S to the pole), documented with sources', () => {
  const ids = southPoleSites.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  const groups = new Set(SITE_GROUPS.map((g) => g.key))
  for (const s of southPoleSites) {
    assert.ok(s.lat <= -80 && s.lat >= -90, `${s.id} latitude ${s.lat} must be in the map (<= -80)`)
    assert.ok(s.lon >= 0 && s.lon <= 360, `${s.id} longitude`)
    assert.ok(groups.has(s.group), `${s.id} group`)
    assert.ok(s.name.length > 0 && s.note.length > 20, `${s.id} needs a name and a note`)
    assert.ok(s.sources.length > 0 && s.sources.every(isHttps), `${s.id} needs https sources`)
  }
})

test('every site has precomputed horizon and terrain data (run scripts/compute-horizons.mjs after changes)', () => {
  for (const s of southPoleSites) {
    assert.equal(profiles[s.id]?.length, 360, `${s.id} horizon profile`)
    assert.equal(typeof terrain[s.id]?.slopeMaxDeg, 'number', `${s.id} slope data`)
  }
  for (const id of Object.keys(profiles)) assert.ok(southPoleSites.some((s) => s.id === id), `stale profile ${id}`)
})

test('missions: valid status, coordinates both set or both null, links point to real sites', () => {
  const statuses = new Set(['success', 'landed', 'impact', 'planned', 'delayed', 'orbit', 'cancelled'])
  const siteIds = new Set(southPoleSites.map((s) => s.id))
  const ids = missions.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const m of missions) {
    assert.ok(statuses.has(m.status), `${m.id} status`)
    assert.equal(m.lat === null, m.lon === null, `${m.id} coordinates`)
    if (m.siteId) assert.ok(siteIds.has(m.siteId), `${m.id} siteId`)
    assert.ok(m.sources.length > 0 && m.sources.every(isHttps), `${m.id} sources`)
  }
})
