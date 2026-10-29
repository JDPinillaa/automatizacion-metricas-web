const { thresholds, labels } = require('../config/thresholds');

const LEVELS = ['good', 'needsImprovement', 'poor'];

/**
 * Clasifica un valor según los umbrales de una métrica.
 *
 * Regla: [min, max), con el límite superior 100 inclusivo para Performance.
 *
 * @param {number} value
 * @param {Object} metricThresholds
 * @returns {'good'|'needsImprovement'|'poor'|null}
 */
function classifyMetric(value, metricThresholds) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  for (const level of LEVELS) {
    const range = metricThresholds?.[level];

    if (!range) {
      continue;
    }

    const meetsMin = value >= range.min;
    const meetsMax =
      range.max === null ||
      value < range.max ||
      (range.max === 100 && value === 100);

    if (meetsMin && meetsMax) {
      return level;
    }
  }

  return null;
}

const METRIC_STATUS_FIELDS = {
  firstContentfulPaint: 'firstContentfulPaintStatus',
  largestContentfulPaint: 'largestContentfulPaintStatus',
  speedIndex: 'speedIndexStatus',
  performance: 'performanceStatus',
};

/**
 * Agrega las etiquetas de clasificación a un registro de métricas.
 *
 * @param {Object} record
 * @param {Object} [thresholdConfig]
 * @returns {Object}
 */
function classifyRecord(record, thresholdConfig = thresholds) {
  if (!record || typeof record !== 'object') {
    throw new Error('El registro de métricas es obligatorio.');
  }

  const classified = { ...record };

  for (const [metric, statusField] of Object.entries(METRIC_STATUS_FIELDS)) {
    const level = classifyMetric(record[metric], thresholdConfig[metric]);
    classified[statusField] = level ? labels[level] : null;
  }

  return classified;
}

module.exports = {
  classifyMetric,
  classifyRecord,
  METRIC_STATUS_FIELDS,
};
