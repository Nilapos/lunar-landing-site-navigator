// Colors and labels shared by the 3D scenes (the scene itself is polarSkyScene.js).
import * as THREE from 'three'
import { cssToken } from './cssTokens.js'

// Pin colors come from the design tokens, so the 3D views match the score colors of the interface.
const LEVEL_TOKEN = { ok: '--color-ok', warn: '--color-warn', fail: '--color-off', unknown: '--color-text-muted' }
/** Ring around the sites of scenarios A and B: the bright edge of the region squares. */
export function selectionColor() {
  return new THREE.Color(cssToken('--color-region-edge') || '#70e0df')
}
export function levelColor(level) {
  return new THREE.Color(cssToken(LEVEL_TOKEN[level] ?? LEVEL_TOKEN.unknown) || '#b3b3ad')
}

export function makeLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  // White bold sans with a soft shadow, like the region names in NASA's Artemis III videos.
  ctx.font = `bold 44px ${cssToken('--font-label') || 'Helvetica, Arial, sans-serif'}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
  ctx.shadowBlur = 10
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.strokeText(text, 256, 48)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, 256, 48)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.scale.set(110, 20.6, 1)
  sprite.renderOrder = 10
  return sprite
}
