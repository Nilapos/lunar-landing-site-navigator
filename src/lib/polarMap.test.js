import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAP_RADIUS_KM, circleRadius, projectToMap } from './polarMap.js'

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`)

test('the pole is the center of the map', () => {
  const p = projectToMap(-90, 123)
  close(p.x, 0.5)
  close(p.y, 0.5)
})

test('longitude 0 is up, 90 E is right, 180 is down, 270 E (90 W) is left', () => {
  const up = projectToMap(-85, 0)
  const right = projectToMap(-85, 90)
  const down = projectToMap(-85, 180)
  const left = projectToMap(-85, 270)
  assert.ok(up.y < 0.5)
  close(up.x, 0.5)
  assert.ok(right.x > 0.5)
  close(right.y, 0.5)
  assert.ok(down.y > 0.5)
  assert.ok(left.x < 0.5)
})

test('80 S sits on the edge of the picture and the edge radius is about 304 km', () => {
  close(circleRadius(-80), 0.5)
  close(projectToMap(-80, 0).y, 0)
  assert.ok(Math.abs(MAP_RADIUS_KM - 304) < 0.5)
})

test('closer to the pole means closer to the center', () => {
  assert.ok(circleRadius(-88) < circleRadius(-85))
  assert.ok(circleRadius(-85) < circleRadius(-80))
})
