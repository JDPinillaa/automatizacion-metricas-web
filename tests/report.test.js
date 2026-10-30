const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const report = require('../report/app');
const { createServer, buildPublicConfig, resolveStatic } = require('../report/serve');
const { thresholds, labels } = require('../config/thresholds');

/* ======================================================================
 * 1. Formato y utilidades
 * ==================================================================== */

test('formatSeconds convierte ms a segundos con 2 decimales', () => {
  assert.equal(report.formatSeconds(2523.106), '2,52 s');
  assert.equal(report.formatSeconds(908.716), '0,91 s');
  assert.equal(report.formatSeconds(0), '0,00 s');
  assert.equal(report.formatSeconds(null), '—');
  assert.equal(report.formatSeconds(undefined), '—');
  assert.equal(report.formatSeconds(NaN), '—');
});

test('formatScore formatea puntajes de 0 a 100', () => {
  assert.equal(report.formatScore(84), '84');
  assert.equal(report.formatScore(96.7), '97');
  assert.equal(report.formatScore(null), '—');
});

test('formatMetric aplica la unidad correspondiente (segundos o puntos)', () => {
  assert.equal(report.formatMetric('performance', 84), '84');
  assert.equal(report.formatMetric('firstContentfulPaint', 1500), '1,50 s');
  assert.equal(report.formatMetric('largestContentfulPaint', null), '—');
});

test('formatDiff calcula diferencias con signo', () => {
  assert.equal(report.formatDiff('performance', 13), '+13 pts');
  assert.equal(report.formatDiff('performance', -5), '−5 pts');
  assert.equal(report.formatDiff('firstContentfulPaint', 1614.39), '+1,61 s');
  assert.equal(report.formatDiff('firstContentfulPaint', -200), '−0,20 s');
  assert.equal(report.formatDiff('firstContentfulPaint', null), '—');
});

test('formatDate formatea fechas en zona horaria America/Bogota', () => {
  // 15:26 UTC son las 10:26 en Bogotá (UTC-5)
  const formatted = report.formatDate('2026-10-29T15:26:06.621Z');
  assert.match(formatted, /29.*oct.*2026/i);
  assert.match(formatted, /10:26/);
});

test('toLocalDateString extrae la fecha de calendario en America/Bogota', () => {
  assert.equal(report.toLocalDateString('2026-10-29T15:26:06.621Z'), '2026-10-29');
  // 02:00 UTC del 30 de octubre sigue siendo 29 de octubre en Bogotá (21:00)
  assert.equal(report.toLocalDateString('2026-10-30T02:00:00Z'), '2026-10-29');
});

/* ======================================================================
 * 2. Clasificación y umbrales
 * ==================================================================== */

test('classifyValue respeta límites [min, max) y dirección de métricas', () => {
  const fcpThreshold = thresholds.firstContentfulPaint; // 0-1800, 1800-3000, >=3000
  assert.equal(report.classifyValue(1799, fcpThreshold), 'good');
  assert.equal(report.classifyValue(1800, fcpThreshold), 'needsImprovement');
  assert.equal(report.classifyValue(2999, fcpThreshold), 'needsImprovement');
  assert.equal(report.classifyValue(3000, fcpThreshold), 'poor');

  const perfThreshold = thresholds.performance; // >=90, 50-90, <50
  assert.equal(report.classifyValue(100, perfThreshold), 'good');
  assert.equal(report.classifyValue(90, perfThreshold), 'good');
  assert.equal(report.classifyValue(89.9, perfThreshold), 'needsImprovement');
  assert.equal(report.classifyValue(50, perfThreshold), 'needsImprovement');
  assert.equal(report.classifyValue(49.9, perfThreshold), 'poor');
  assert.equal(report.classifyValue(0, perfThreshold), 'poor');
});

test('levelOf extrae la etiqueta existente o la recalcula si falta', () => {
  const config = { thresholds, labels };
  const recordWithStatus = {
    performance: 84,
    performanceStatus: 'Por mejorar',
    firstContentfulPaint: 1200,
    // firstContentfulPaintStatus no viene
  };

  assert.equal(report.levelOf(recordWithStatus, 'performance', config), 'needsImprovement');
  assert.equal(report.levelOf(recordWithStatus, 'firstContentfulPaint', config), 'good');

  const errorRecord = { status: 'error', performance: null };
  assert.equal(report.levelOf(errorRecord, 'performance', config), 'error');
});

test('thresholdBands calcula rangos en unidades de despliegue', () => {
  const bands = report.thresholdBands('firstContentfulPaint', thresholds);
  assert.equal(bands.length, 3);
  assert.deepEqual(bands[0], { level: 'good', from: 0, to: 1.8 });
  assert.deepEqual(bands[1], { level: 'needsImprovement', from: 1.8, to: 3 });
  assert.deepEqual(bands[2], { level: 'poor', from: 3, to: Infinity });
});

/* ======================================================================
 * 3. Normalización y agrupación de datos
 * ==================================================================== */

test('normalizeRecords valida y rechaza registros defectuosos', () => {
  const config = { thresholds, labels, pages: [{ id: 'portal-pagos', name: 'Inicio' }] };
  const raw = [
    {
      recordId: 'r1',
      pageId: 'portal-pagos',
      deviceProfile: 'mobile',
      timestamp: '2026-10-29T15:00:00Z',
      performance: 95,
      status: 'success',
    },
    {
      // Registro inválido: falta timestamp
      recordId: 'r2',
      pageId: 'portal-pagos',
      deviceProfile: 'desktop',
    },
    {
      // Registro inválido: falta recordId
      pageId: 'portal-pagos',
      deviceProfile: 'desktop',
      timestamp: '2026-10-29T15:00:00Z',
    },
  ];

  const { records, rejected } = report.normalizeRecords(raw, config);
  assert.equal(records.length, 1);
  assert.equal(rejected.length, 2);
  assert.equal(records[0].pageName, 'Inicio');
  assert.equal(records[0].levels.performance, 'good');
});

test('groupRuns agrupa por corrida y ordena cronológicamente', () => {
  const records = [
    { runId: 'run-2', time: 200 },
    { runId: 'run-1', time: 100 },
    { runId: 'run-2', time: 250 },
  ];

  const runs = report.groupRuns(records);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].runId, 'run-1');
  assert.equal(runs[0].records.length, 1);
  assert.equal(runs[1].runId, 'run-2');
  assert.equal(runs[1].records.length, 2);
});

test('latestByPageAndDevice identifica última medición exitosa y errores recientes', () => {
  const records = [
    {
      recordId: '1',
      pageId: 'p1',
      deviceProfile: 'mobile',
      time: 100,
      isError: false,
      performance: 80,
    },
    {
      recordId: '2',
      pageId: 'p1',
      deviceProfile: 'mobile',
      time: 200,
      isError: false,
      performance: 85,
    },
    {
      recordId: '3',
      pageId: 'p1',
      deviceProfile: 'mobile',
      time: 300,
      isError: true,
      error: 'Timeout',
    },
  ];

  const latestMap = report.latestByPageAndDevice(records);
  const entry = latestMap.get('p1|mobile');

  assert.ok(entry);
  assert.equal(entry.latest.recordId, '2');
  assert.equal(entry.previous.recordId, '1');
  assert.equal(entry.lastError.recordId, '3');
});

/* ======================================================================
 * 4. Comparativa y tendencias
 * ==================================================================== */

test('compareDevices compara móvil vs escritorio indicando ganador', () => {
  const mobile = { firstContentfulPaint: 2500, performance: 80 };
  const desktop = { firstContentfulPaint: 900, performance: 95 };

  const comparison = report.compareDevices(mobile, desktop, thresholds);

  const fcpRow = comparison.find((r) => r.metric === 'firstContentfulPaint');
  assert.equal(fcpRow.diff, 1600); // 2500 - 900
  assert.equal(fcpRow.better, 'desktop'); // lower is better

  const perfRow = comparison.find((r) => r.metric === 'performance');
  assert.equal(perfRow.diff, -15); // 80 - 95
  assert.equal(perfRow.better, 'desktop'); // higher is better
});

test('trend detecta mejoría, empeoramiento y estabilidad dentro de tolerancia', () => {
  // Tiempos (lower-is-better, tolerancia relativa 5%)
  const optsTime = { direction: 'lower-is-better', unit: 'ms' };
  assert.equal(report.trend(1000, 1030, optsTime), 'same'); // 3% delta -> ruido
  assert.equal(report.trend(900, 1000, optsTime), 'better'); // -10% tiempo -> mejora
  assert.equal(report.trend(1200, 1000, optsTime), 'worse'); // +20% tiempo -> empeora

  // Performance (higher-is-better, tolerancia absoluta 2 pts)
  const optsScore = { direction: 'higher-is-better', unit: 'score' };
  assert.equal(report.trend(85, 84, optsScore), 'same'); // 1 pt delta -> ruido
  assert.equal(report.trend(90, 85, optsScore), 'better'); // +5 pts -> mejora
  assert.equal(report.trend(80, 85, optsScore), 'worse'); // -5 pts -> empeora
});

/* ======================================================================
 * 5. Filtros y resumen
 * ==================================================================== */

test('summarizeLevels totaliza niveles de métricas', () => {
  const records = [
    { levels: { performance: 'good', firstContentfulPaint: 'good', largestContentfulPaint: 'needsImprovement', speedIndex: 'poor' } },
  ];
  const summary = report.summarizeLevels(records);
  assert.equal(summary.good, 2);
  assert.equal(summary.needsImprovement, 1);
  assert.equal(summary.poor, 1);
});

test('filterRecords filtra por página, dispositivo y rango de fechas', () => {
  const records = [
    { pageId: 'p1', deviceProfile: 'mobile', time: Date.parse('2026-10-20T12:00:00Z') },
    { pageId: 'p1', deviceProfile: 'desktop', time: Date.parse('2026-10-21T12:00:00Z') },
    { pageId: 'p2', deviceProfile: 'mobile', time: Date.parse('2026-10-22T12:00:00Z') },
  ];

  assert.equal(report.filterRecords(records, { page: 'p1' }).length, 2);
  assert.equal(report.filterRecords(records, { device: 'mobile' }).length, 2);
  assert.equal(report.filterRecords(records, { from: '2026-10-21', to: '2026-10-22' }).length, 2);
  assert.equal(report.filterRecords(records, { page: 'p1', device: 'desktop' }).length, 1);
});

test('parseFilters y serializeFilters preservan parámetros de URL', () => {
  const query = '?page=portal-pagos&device=mobile&metric=firstContentfulPaint&from=2026-10-01&to=2026-10-15';
  const parsed = report.parseFilters(query);
  assert.equal(parsed.page, 'portal-pagos');
  assert.equal(parsed.device, 'mobile');
  assert.equal(parsed.metric, 'firstContentfulPaint');
  assert.equal(parsed.from, '2026-10-01');
  assert.equal(parsed.to, '2026-10-15');

  const serialized = report.serializeFilters(parsed, { demo: true });
  assert.ok(serialized.includes('demo=1'));
  assert.ok(serialized.includes('page=portal-pagos'));
});

/* ======================================================================
 * 6. Servidor local (report/serve.js)
 * ==================================================================== */

test('resolveStatic protege contra path traversal', () => {
  assert.equal(resolveStatic('/../package.json'), null);
  assert.equal(resolveStatic('/..%2Fpackage.json'), null);
  assert.equal(resolveStatic('/'), path.resolve(__dirname, '..', 'report', 'index.html'));
  assert.equal(resolveStatic('/styles.css'), path.resolve(__dirname, '..', 'report', 'styles.css'));
});

test('buildPublicConfig genera la configuración esperada', () => {
  const config = buildPublicConfig();
  assert.ok(config.thresholds);
  assert.ok(config.labels);
  assert.ok(Array.isArray(config.pages) && config.pages.length > 0);
  assert.ok(Array.isArray(config.devices) && config.devices.length > 0);
});

test('servidor HTTP responde a rutas estáticas y endpoints de datos', async (t) => {
  const server = createServer();

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => server.close());

  async function get(pathUrl) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${pathUrl}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  }

  // 1. Ruta principal
  const indexRes = await get('/');
  assert.equal(indexRes.status, 200);
  assert.ok(indexRes.headers['content-type'].includes('text/html'));
  assert.ok(indexRes.body.includes('Informe de métricas web'));

  // 2. Estático styles.css
  const cssRes = await get('/styles.css');
  assert.equal(cssRes.status, 200);
  assert.ok(cssRes.headers['content-type'].includes('text/css'));

  // 3. Estático app.js
  const jsRes = await get('/app.js');
  assert.equal(jsRes.status, 200);
  assert.ok(jsRes.headers['content-type'].includes('text/javascript'));

  // 4. Config JSON
  const configRes = await get('/data/config.json');
  assert.equal(configRes.status, 200);
  const configJson = JSON.parse(configRes.body);
  assert.ok(configJson.thresholds.firstContentfulPaint);

  // 5. Metrics JSON
  const metricsRes = await get('/data/metrics.json');
  assert.equal(metricsRes.status, 200);
  const metricsJson = JSON.parse(metricsRes.body);
  assert.ok(Array.isArray(metricsJson));

  // 6. Demo metrics JSON
  const demoRes = await get('/data/demo-metrics.json');
  assert.equal(demoRes.status, 200);
  const demoJson = JSON.parse(demoRes.body);
  assert.ok(Array.isArray(demoJson) && demoJson.length > 0);

  // 7. Path traversal no permite acceder a archivos fuera de report/ (bloqueado con 403 o 404)
  const traversalRes = await get('/%2e%2e/package.json');
  assert.ok([403, 404].includes(traversalRes.status));
  assert.ok(!traversalRes.body.includes('"name": "automatizacion-metricas-web"'));
});
