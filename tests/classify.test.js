const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyMetric, classifyRecord } = require('../lib/classify');
const { thresholds } = require('../config/thresholds');

test('clasifica FCP en los límites', () => {
  const fcp = thresholds.firstContentfulPaint;

  assert.equal(classifyMetric(1799, fcp), 'good');
  assert.equal(classifyMetric(1800, fcp), 'needsImprovement');
  assert.equal(classifyMetric(2999, fcp), 'needsImprovement');
  assert.equal(classifyMetric(3000, fcp), 'poor');
});

test('clasifica LCP en los límites', () => {
  const lcp = thresholds.largestContentfulPaint;

  assert.equal(classifyMetric(2499, lcp), 'good');
  assert.equal(classifyMetric(2500, lcp), 'needsImprovement');
  assert.equal(classifyMetric(3999, lcp), 'needsImprovement');
  assert.equal(classifyMetric(4000, lcp), 'poor');
});

test('clasifica Speed Index en los límites', () => {
  const speedIndex = thresholds.speedIndex;

  assert.equal(classifyMetric(3399, speedIndex), 'good');
  assert.equal(classifyMetric(3400, speedIndex), 'needsImprovement');
  assert.equal(classifyMetric(5799, speedIndex), 'needsImprovement');
  assert.equal(classifyMetric(5800, speedIndex), 'poor');
});

test('clasifica Performance en los límites', () => {
  const performance = thresholds.performance;

  assert.equal(classifyMetric(100, performance), 'good');
  assert.equal(classifyMetric(90, performance), 'good');
  assert.equal(classifyMetric(89.9, performance), 'needsImprovement');
  assert.equal(classifyMetric(50, performance), 'needsImprovement');
  assert.equal(classifyMetric(49.9, performance), 'poor');
  assert.equal(classifyMetric(0, performance), 'poor');
});

test('devuelve null para valores inválidos', () => {
  assert.equal(classifyMetric(null, thresholds.firstContentfulPaint), null);
  assert.equal(classifyMetric(undefined, thresholds.firstContentfulPaint), null);
  assert.equal(classifyMetric(NaN, thresholds.firstContentfulPaint), null);
  assert.equal(classifyMetric('1200', thresholds.firstContentfulPaint), null);
});

test('agrega las etiquetas visibles al registro', () => {
  const record = {
    firstContentfulPaint: 2629,
    largestContentfulPaint: 3662,
    speedIndex: 3140,
    performance: 85,
  };

  const classified = classifyRecord(record);

  assert.equal(classified.firstContentfulPaintStatus, 'Por mejorar');
  assert.equal(classified.largestContentfulPaintStatus, 'Por mejorar');
  assert.equal(classified.speedIndexStatus, 'Bueno');
  assert.equal(classified.performanceStatus, 'Por mejorar');
});

test('clasifica un registro con métricas nulas como sin estado', () => {
  const classified = classifyRecord({
    firstContentfulPaint: null,
    largestContentfulPaint: null,
    speedIndex: null,
    performance: null,
  });

  assert.equal(classified.firstContentfulPaintStatus, null);
  assert.equal(classified.largestContentfulPaintStatus, null);
  assert.equal(classified.speedIndexStatus, null);
  assert.equal(classified.performanceStatus, null);
});
