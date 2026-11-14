// Vercel serverless function: GET /api/sky?start=2026-11-14&stop=2026-12-14&stepMinutes=60
// Returns, over time, the point of the Moon under the Sun and under the Earth and the Earth's distance (JPL Horizons).
// From these, the sky of any point of the Moon can be computed (see src/lib/sky.js).
import { handleSkyRequest } from '../src/lib/horizons.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { status, body, cache } = await handleSkyRequest(req.query)
  if (cache) res.setHeader('Cache-Control', cache)
  return res.status(status).json(body)
}
