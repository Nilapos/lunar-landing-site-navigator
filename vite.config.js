import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { handleRequest } from './src/lib/horizons.js'

// In dev, serve /api/horizons with the same code as the Vercel function (api/horizons.js).
function horizonsDevApi() {
  return {
    name: 'horizons-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/horizons', async (req, res) => {
        const query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
        const { status, body } = await handleRequest(query)
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), horizonsDevApi()],
})
