const fs = require('fs');
const path = require('path');

const DEFAULT_METRICS_PATH = path.join(
  __dirname,
  '..',
  'cypress',
  'fixtures',
  'lighthouse-metrics.json'
);

/**
 * Lee el historial de métricas.
 *
 * @param {string} [filePath]
 * @returns {Object[]}
 */
function readMetrics(filePath = DEFAULT_METRICS_PATH) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();

  if (!raw) {
    return [];
  }

  const metrics = JSON.parse(raw);

  if (!Array.isArray(metrics)) {
    throw new Error('El archivo de métricas debe contener un arreglo JSON.');
  }

  return metrics;
}

/**
 * Escribe el historial completo de métricas.
 *
 * @param {Object[]} metrics
 * @param {string} [filePath]
 * @returns {void}
 */
function writeMetrics(metrics, filePath = DEFAULT_METRICS_PATH) {
  if (!Array.isArray(metrics)) {
    throw new Error('Las métricas deben ser un arreglo.');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const serialized = `${JSON.stringify(metrics, null, 2)}\n`;
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  fs.writeFileSync(temporaryPath, serialized, 'utf8');

  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    // En algunos sistemas no se puede renombrar sobre un archivo existente.
    fs.writeFileSync(filePath, serialized, 'utf8');
    fs.rmSync(temporaryPath, { force: true });
  }
}

/**
 * Agrega o actualiza una medición usando `recordId` como clave.
 *
 * @param {Object} record
 * @param {string} [filePath]
 * @returns {Object}
 */
function appendMetric(record, filePath = DEFAULT_METRICS_PATH) {
  if (!record || typeof record !== 'object') {
    throw new Error('El registro de métricas es obligatorio.');
  }

  if (!record.recordId) {
    throw new Error('El registro debe incluir recordId.');
  }

  const metrics = readMetrics(filePath);
  const existingIndex = metrics.findIndex(
    (metric) => metric.recordId === record.recordId
  );

  if (existingIndex >= 0) {
    metrics[existingIndex] = record;
  } else {
    metrics.push(record);
  }

  writeMetrics(metrics, filePath);

  return record;
}

module.exports = {
  DEFAULT_METRICS_PATH,
  readMetrics,
  writeMetrics,
  appendMetric,
};
