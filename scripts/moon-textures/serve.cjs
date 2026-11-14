// Helper used to build the Moon pictures of public/ from NASA Moon Trek tiles (see CLAUDE.md, "Real Moon").
//
// Usage: node scripts/moon-textures/serve.cjs <page.html> <output.jpg> [port]
//   then open http://127.0.0.1:<port>/ in a browser (the app's built-in browser works). The page fetches the tiles from
//   NASA Moon Trek (CORS is open), stitches them on a canvas and posts the JPEG back here, which saves it. Stop with Ctrl+C.
//   Pages: global.html -> public/moon-wac-4096.jpg, south.html -> public/moon-wac-south-2048.jpg, pole.html -> public/south-pole-photo.jpg.
const http = require('http')
const fs = require('fs')
const path = require('path')
const [page, out, port = '8766'] = process.argv.slice(2)
if (!page || !out) {
  console.error('Usage: node scripts/moon-textures/serve.cjs <page.html> <output.jpg> [port]')
  process.exit(1)
}
http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/save') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        fs.writeFileSync(out, Buffer.concat(chunks))
        res.writeHead(200)
        res.end('saved')
        console.log('saved', out)
      })
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      fs.createReadStream(path.resolve(__dirname, page)).pipe(res)
    }
  })
  .listen(Number(port), '127.0.0.1', () => console.log(`listening on http://127.0.0.1:${port}/`))
