/**
 * Umbrales de clasificación de métricas.
 *
 * Regla de límites (sin solapamientos):
 * - Cada rango es [min, max): `min` es inclusivo y `max` es exclusivo.
 * - El comportamiento depende de `direction`:
 *   - 'lower-is-better': valores menores son mejores (FCP, LCP, Speed Index).
 *   - 'higher-is-better': valores mayores son mejores (Performance).
 * - El límite superior global (100 en Performance) se considera inclusivo.
 *
 * @typedef {'good'|'needsImprovement'|'poor'} ThresholdLevel
 * @typedef {{ min: number, max: number|null }} ThresholdRange
 *
 * @type {Record<string, {
 *   unit: 'ms'|'score',
 *   direction: 'lower-is-better'|'higher-is-better',
 *   good: ThresholdRange,
 *   needsImprovement: ThresholdRange,
 *   poor: ThresholdRange
 * }>}
 */
const thresholds = {
  fcp: {
    unit: 'ms',
    direction: 'lower-is-better',
    good: { min: 0, max: 1800 },
    needsImprovement: { min: 1800, max: 3000 },
    poor: { min: 3000, max: null },
  },
  lcp: {
    unit: 'ms',
    direction: 'lower-is-better',
    good: { min: 0, max: 2500 },
    needsImprovement: { min: 2500, max: 4000 },
    poor: { min: 4000, max: null },
  },
  speedIndex: {
    unit: 'ms',
    direction: 'lower-is-better',
    good: { min: 0, max: 3400 },
    needsImprovement: { min: 3400, max: 5800 },
    poor: { min: 5800, max: null },
  },
  performance: {
    unit: 'score',
    direction: 'higher-is-better',
    good: { min: 90, max: 100 },
    needsImprovement: { min: 50, max: 90 },
    poor: { min: 0, max: 50 },
  },
};

/** Etiquetas visibles usadas por el reporte. */
const labels = {
  good: 'Bueno',
  needsImprovement: 'Por mejorar',
  poor: 'Deficiente',
};

module.exports = { thresholds, labels };
