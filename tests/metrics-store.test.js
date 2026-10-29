const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readMetrics,
  writeMetrics,
  appendMetric,
} = require('../lib/metrics-store');

function temporaryMetricsFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uam-metrics-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'lighthouse-metrics.json');
}

test('lee un archivo inexistente como historial vacío', (t) => {
  const file = temporaryMetricsFile(t);
  assert.deepEqual(readMetrics(file), []);
});

test('agrega mediciones y conserva el historial', (t) => {
  const file = temporaryMetricsFile(t);

  appendMetric({ recordId: 'a', performance: 80 }, file);
  appendMetric({ recordId: 'b', performance: 90 }, file);

  const metrics = readMetrics(file);
  assert.equal(metrics.length, 2);
  assert.equal(metrics[0].recordId, 'a');
  assert.equal(metrics[1].recordId, 'b');
});

test('actualiza una medición con el mismo recordId en lugar de duplicarla', (t) => {
  const file = temporaryMetricsFile(t);

  appendMetric({ recordId: 'a', performance: 80 }, file);
  appendMetric({ recordId: 'a', performance: 95 }, file);

  const metrics = readMetrics(file);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].performance, 95);
});

test('escribe y lee un arreglo completo', (t) => {
  const file = temporaryMetricsFile(t);
  writeMetrics([{ recordId: 'x' }], file);

  assert.deepEqual(readMetrics(file), [{ recordId: 'x' }]);
});

test('rechaza un JSON que no sea un arreglo', (t) => {
  const file = temporaryMetricsFile(t);
  fs.writeFileSync(file, JSON.stringify({ foo: 'bar' }));

  assert.throws(() => readMetrics(file), /arreglo JSON/);
});

test('rechaza un registro sin recordId', (t) => {
  const file = temporaryMetricsFile(t);
  assert.throws(() => appendMetric({ performance: 80 }, file), /recordId/);
});
