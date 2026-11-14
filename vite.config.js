import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { handleRequest, handleSkyRequest } from './src/lib/horizons.js'

// In dev, serve /api/horizons and /api/sky with the same code as the Vercel functions (api/*.js).
function horizonsDevApi() {
  const serve = (handler) => async (req, res) => {
    const query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
    const { status, body } = await handler(query)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }
  return {
    name: 'horizons-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/horizons', serve(handleRequest))
      server.middlewares.use('/api/sky', serve(handleSkyRequest))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), horizonsDevApi()],
})
