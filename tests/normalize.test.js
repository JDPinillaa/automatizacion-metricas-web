const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./fixtures/lhr-mobile.json');
const {
  buildRecordId,
  normalizeLighthouseResult,
  buildErrorRecord,
} = require('../lib/normalize');

const page = {
  id: 'portal-pagos',
  name: 'Portal de Pagos UAM (Inicio)',
  url: 'https://intrauam.autonoma.edu.co/ponline/',
};

const device = {
  id: 'mobile',
  label: 'Moto G Power (412x823)',
  lighthouse: {
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    },
  },
};

const runId = 'run-2026-10-29';

test('normaliza una medición exitosa', () => {
  const record = normalizeLighthouseResult(fixture, { page, device, runId });

  assert.equal(record.recordId, 'run-2026-10-29:lighthouse-local:portal-pagos:mobile');
  assert.equal(record.source, 'lighthouse-local');
  assert.equal(record.pageId, 'portal-pagos');
  assert.equal(record.deviceProfile, 'mobile');
  assert.equal(record.deviceLabel, 'Moto G Power (412x823)');
  assert.deepEqual(record.screenEmulation, {
    mobile: true,
    width: 412,
    height: 823,
    deviceScaleFactor: 1.75,
    disabled: false,
  });
  assert.equal(record.formFactor, 'mobile');
  assert.equal(record.url, page.url);
  assert.equal(record.finalUrl, page.url);
  assert.equal(record.timestamp, '2026-10-29T15:15:48.007Z');
  assert.equal(record.firstContentfulPaint, 2629.064);
  assert.equal(record.largestContentfulPaint, 3662.186);
  assert.equal(record.speedIndex, 3140.189);
  assert.equal(record.performance, 85);
  assert.equal(record.lighthouseVersion, '13.5.0');
  assert.equal(record.status, 'success');
  assert.equal(record.error, null);
});

test('acepta una URL con query string sin alterarla', () => {
  const pagoPage = {
    id: 'adjunto-pago',
    name: 'Adjunto de Pago',
    url: 'https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/adjuntoPago?tipoPago=M',
  };

  const record = normalizeLighthouseResult(fixture, {
    page: pagoPage,
    device,
    runId,
  });

  assert.equal(record.url, pagoPage.url);
  assert.match(record.recordId, /adjunto-pago/);
});

test('devuelve null cuando falta una auditoría', () => {
  const incomplete = JSON.parse(JSON.stringify(fixture));
  delete incomplete.audits['speed-index'];

  const record = normalizeLighthouseResult(incomplete, {
    page,
    device,
    runId,
  });

  assert.equal(record.speedIndex, null);
  assert.equal(record.firstContentfulPaint, 2629.064);
});

test('usa la emulación del perfil si Lighthouse no informa configSettings', () => {
  const withoutSettings = JSON.parse(JSON.stringify(fixture));
  delete withoutSettings.configSettings;

  const record = normalizeLighthouseResult(withoutSettings, {
    page,
    device,
    runId,
  });

  assert.deepEqual(record.screenEmulation, device.lighthouse.screenEmulation);
  assert.equal(record.formFactor, 'mobile');
});

test('usa la fecha actual si Lighthouse no entrega fetchTime', () => {
  const withoutFetchTime = JSON.parse(JSON.stringify(fixture));
  delete withoutFetchTime.fetchTime;

  const before = Date.now();
  const record = normalizeLighthouseResult(withoutFetchTime, {
    page,
    device,
    runId,
  });
  const after = Date.now();

  const timestamp = new Date(record.timestamp).getTime();
  assert.ok(timestamp >= before && timestamp <= after);
});

test('rechaza un resultado vacío', () => {
  assert.throws(
    () => normalizeLighthouseResult(null, { page, device, runId }),
    /No hay resultados/
  );
});

test('rechaza una página sin id o url', () => {
  assert.throws(
    () =>
      normalizeLighthouseResult(fixture, {
        page: { id: 'sin-url' },
        device,
        runId,
      }),
    /id y url/
  );
});

test('construye un registro de error con el mismo contrato', () => {
  const record = buildErrorRecord({
    page,
    device,
    runId,
    error: new Error('Chrome no disponible'),
  });

  assert.equal(record.recordId, 'run-2026-10-29:lighthouse-local:portal-pagos:mobile');
  assert.equal(record.status, 'error');
  assert.equal(record.error, 'Chrome no disponible');
  assert.equal(record.deviceLabel, 'Moto G Power (412x823)');
  assert.deepEqual(record.screenEmulation, device.lighthouse.screenEmulation);
  assert.equal(record.firstContentfulPaint, null);
  assert.equal(record.performance, null);
  assert.equal(record.url, page.url);
});

test('incluye todos los campos obligatorios del contrato', () => {
  const record = normalizeLighthouseResult(fixture, { page, device, runId });

  const requiredFields = [
    'url',
    'screenEmulation',
    'timestamp',
    'firstContentfulPaint',
    'largestContentfulPaint',
    'speedIndex',
    'performance',
    'status',
    'error',
    'runId',
    'pageId',
    'deviceProfile',
    'source',
    'lighthouseVersion',
    'recordId',
  ];

  requiredFields.forEach((field) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(record, field),
      `falta el campo ${field}`
    );
  });

  assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('buildRecordId es estable', () => {
  assert.equal(
    buildRecordId({ runId, pageId: 'portal-pagos', deviceProfile: 'mobile' }),
    'run-2026-10-29:lighthouse-local:portal-pagos:mobile'
  );
});
