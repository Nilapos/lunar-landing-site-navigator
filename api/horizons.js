// Vercel serverless function: GET /api/horizons?lat=-89.9&lon=129.78&start=2026-11-14&stop=2026-12-14&stepMinutes=60
// Returns Sun and Earth azimuth/elevation over time for a point on the Moon (JPL Horizons).
import { handleRequest } from '../src/lib/horizons.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { status, body, cache } = await handleRequest(req.query)
  if (cache) res.setHeader('Cache-Control', cache)
  return res.status(status).json(body)
}
