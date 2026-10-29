const pages = require('../../config/pages');
const devices = require('../../config/devices');
const { classifyRecord } = require('../../lib/classify');

/**
 * Convierte un valor de Cypress.expose en una lista de ids.
 * Acepta comas y puntos y comas como separadores.
 *
 * @param {string|string[]|undefined} value
 * @returns {string[]|null}
 */
function parseList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const selectedPageIds = parseList(Cypress.expose('pages'));
const selectedDeviceIds = parseList(Cypress.expose('devices'));
const runId = Cypress.expose('runId') || new Date().toISOString();

const unknownPages = (selectedPageIds || []).filter(
  (pageId) => !pages.some((page) => page.id === pageId)
);
const unknownDevices = (selectedDeviceIds || []).filter(
  (deviceId) => !devices[deviceId]
);

if (unknownPages.length > 0) {
  throw new Error(`Páginas no configuradas: ${unknownPages.join(', ')}`);
}

if (unknownDevices.length > 0) {
  throw new Error(`Dispositivos no configurados: ${unknownDevices.join(', ')}`);
}

const pagesToEvaluate = pages.filter(
  (page) => !selectedPageIds || selectedPageIds.includes(page.id)
);
const deviceIdsToEvaluate = (selectedDeviceIds || Object.keys(devices)).filter(
  (deviceId) => devices[deviceId]
);

/**
 * Suite de automatización de métricas con Lighthouse local.
 *
 * Cada página se evalúa en cada perfil configurado. Los resultados se guardan
 * en cypress/fixtures/lighthouse-metrics.json y se clasifican con
 * config/thresholds.js.
 */
describe('Lighthouse Metrics Automation', () => {
  if (pagesToEvaluate.length === 0 || deviceIdsToEvaluate.length === 0) {
    it('requires at least one configured page and device', () => {
      throw new Error(
        'No hay páginas o dispositivos seleccionados para evaluar.'
      );
    });

    return;
  }

  pagesToEvaluate.forEach((page) => {
    deviceIdsToEvaluate.forEach((deviceId) => {
      const device = devices[deviceId];

      it(`evaluates ${page.id} on ${deviceId}`, function () {
        this.timeout(180000);

        cy.task(
          'runLighthouse',
          { page, deviceProfile: deviceId, runId },
          { timeout: 180000 }
        )
          .then((record) => {
            const classified = classifyRecord(record);

            return cy
              .task('saveMetrics', classified)
              .then(() => record);
          })
          .then((record) => {
            expect(
              record.status,
              record.error || 'Lighthouse devolvió un error'
            ).to.eq('success');

            [
              'firstContentfulPaint',
              'largestContentfulPaint',
              'speedIndex',
              'performance',
            ].forEach((metric) => {
              expect(record[metric], metric).to.be.a('number');
            });
          });
      });
    });
  });
});
