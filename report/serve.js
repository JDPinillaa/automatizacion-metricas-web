const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { readMetrics, DEFAULT_METRICS_PATH } = require('../lib/metrics-store');
const { thresholds, labels } = require('../config/thresholds');
const pages = require('../config/pages');
const devices = require('../config/devices');

const REPORT_DIR = __dirname;
const DEMO_METRICS_PATH = path.join(REPORT_DIR, 'demo-metrics.json');
const CHART_JS_PATH = path.join(
  REPORT_DIR,
  '..',
  'node_modules',
  'chart.js',
  'dist',
  'chart.umd.min.js'
);
const DEFAULT_PORT = 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Construye la configuración pública que consume el informe.
 * Es la única fuente de verdad de umbrales, etiquetas, páginas y dispositivos.
 *
 * @returns {{ thresholds: Object, labels: Object, pages: Object[], devices: Object[] }}
 */
function buildPublicConfig() {
  return {
    thresholds,
    labels,
    pages: pages.map(({ id, name, url, owner }) => ({ id, name, url, owner })),
    devices: Object.values(devices).map(({ id, label }) => ({ id, label })),
  };
}

/**
 * Envía una respuesta JSON.
 *
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': MIME_TYPES['.json'],
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/**
 * Envía un archivo del disco, o 404 si no existe.
 *
 * @param {http.ServerResponse} res
 * @param {string} filePath
 * @param {Object} [headers]
 */
function sendFile(res, filePath, headers = {}) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, ...headers });
    res.end(content);
  });
}

/**
 * Resuelve una ruta estática dentro de report/, bloqueando `../`.
 *
 * @param {string} pathname
 * @returns {string|null}
 */
function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(REPORT_DIR, relative);
  return resolved.startsWith(REPORT_DIR + path.sep) ? resolved : null;
}

/**
 * Crea el servidor HTTP del informe.
 *
 * @param {{ metricsPath?: string, demoPath?: string }} [options]
 * @returns {http.Server}
 */
function createServer({ metricsPath = DEFAULT_METRICS_PATH, demoPath = DEMO_METRICS_PATH } = {}) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    const { pathname } = new URL(req.url, `http://${req.headers.host || HOST}`);

    if (pathname === '/data/metrics.json' || pathname === '/data/demo-metrics.json') {
      const source = pathname === '/data/metrics.json' ? metricsPath : demoPath;
      try {
        // Se lee en cada petición para reflejar corridas nuevas sin reiniciar.
        sendJson(res, 200, readMetrics(source));
      } catch (error) {
        sendJson(res, 500, { error: `No se pudo leer ${path.basename(source)}: ${error.message}` });
      }
      return;
    }

    if (pathname === '/data/config.json') {
      sendJson(res, 200, buildPublicConfig());
      return;
    }

    if (pathname === '/vendor/chart.umd.min.js') {
      sendFile(res, CHART_JS_PATH, { 'Cache-Control': 'public, max-age=86400' });
      return;
    }

    const filePath = resolveStatic(pathname);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Prohibido');
      return;
    }
    sendFile(res, filePath, { 'Cache-Control': 'no-cache' });
  });
}

module.exports = { createServer, buildPublicConfig, resolveStatic };

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createServer()
    .listen(port, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`Informe disponible en http://localhost:${port}  (demo: http://localhost:${port}/?demo=1)`);
    })
    .on('error', (error) => {
      // eslint-disable-next-line no-console
      console.error(
        error.code === 'EADDRINUSE'
          ? `El puerto ${port} está en uso. Usa otro: PORT=4180 npm run report`
          : error.message
      );
      process.exit(1);
    });
}
