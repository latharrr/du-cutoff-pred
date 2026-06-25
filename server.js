// ============================================================
//  CUET College Campus — Local Dev Server v1
//  Serves static files and routes Vercel serverless functions locally
// ============================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// Load environment variables from .env file if it exists
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index > 0) {
        const key = trimmed.substring(0, index).trim();
        const val = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = val;
      }
    });
    console.log('[server] Loaded local .env variables');
  }
} catch (e) {
  console.log('[server] No .env file loaded:', e.message);
}

// Map Vercel API endpoints to their handlers
const apiRoutes = {
  '/api/programs': './api/programs.js',
  '/api/chat': './api/chat.js',
  '/api/track': './api/track.js',
  '/api/lead': './api/lead.js',
  '/api/submit': './api/submit.js'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  console.log(`[server] ${req.method} ${pathname}`);

  // CORS Headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Route API requests
  if (apiRoutes[pathname]) {
    try {
      const modulePath = path.join(__dirname, apiRoutes[pathname]);
      const { default: handler } = await import(`file://${modulePath}`);

      // Decorate res with Vercel helper functions
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
        return res;
      };

      // Decorate req with parsed body
      req.body = {};
      if (req.method === 'POST') {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        const dataStr = Buffer.concat(buffers).toString();
        if (dataStr) {
          try {
            req.body = JSON.parse(dataStr);
          } catch (_) {
            // fallback to raw body or urlencoded
            req.body = dataStr;
          }
        }
      }

      // Check for GROQ API Key missing on chat endpoint, fallback to a local mock response
      if (pathname === '/api/chat' && !process.env.GROQ_API_KEY) {
        res.status(200).json({
          reply: "I am running on your local server. Since GROQ_API_KEY is not configured in .env, I am in offline mode. Don't worry! You can ask your seniors directly on the Picapool app. Install the app, set your location to North Campus, and create an 'Ask Around' post to get all your answers for free! 📱"
        });
        return;
      }

      await handler(req, res);
    } catch (err) {
      console.error(`[server] Error executing api route ${pathname}:`, err.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Internal Server Error: ${err.message}` }));
    }
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Return 404
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html');
      res.end('<h1>404 Not Found</h1><p>The requested file does not exist.</p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n============================================================`);
  console.log(`🚀 CUET College Campus dev server is running!`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`📁 Serving directory: ${__dirname}`);
  console.log(`============================================================\n`);
});
