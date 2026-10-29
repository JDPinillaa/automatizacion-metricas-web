const { defineConfig } = require('cypress');
const devices = require('./config/devices');
const { runLighthouseAudit } = require('./lib/lighthouse');
const {
  normalizeLighthouseResult,
  buildErrorRecord,
} = require('./lib/normalize');
const { appendMetric } = require('./lib/metrics-store');

/**
 * Configuración base de Cypress (E2E).
 *
 * Tareas de Node:
 * - runLighthouse: ejecuta Lighthouse local y normaliza el resultado.
 * - saveMetrics: agrega/actualiza la medición en el historial JSON.
 *
 * @see https://docs.cypress.io/app/references/configuration
 */
module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://intrauam.autonoma.edu.co',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    setupNodeEvents(on, config) {
      on('task', {
        /**
         * Ejecuta Lighthouse sobre una página y un perfil de dispositivo.
         * Si falla, devuelve un registro con status "error" para no perder el intento.
         *
         * @param {{ page: Object, deviceProfile: string, runId: string }} args
         * @returns {Promise<Object>}
         */
        async runLighthouse({ page, deviceProfile, runId }) {
          const device = devices[deviceProfile];

          if (!device) {
            return buildErrorRecord({
              page,
              device: { id: deviceProfile, label: deviceProfile },
              runId,
              error: new Error(`Perfil de dispositivo no configurado: ${deviceProfile}`),
            });
          }

          try {
            const lhr = await runLighthouseAudit({ url: page.url, device });
            return normalizeLighthouseResult(lhr, { page, device, runId });
          } catch (error) {
            return buildErrorRecord({ page, device, runId, error });
          }
        },

        /**
         * Persiste una medición en cypress/fixtures/lighthouse-metrics.json.
         *
         * @param {Object} record
         * @returns {null}
         */
        saveMetrics(record) {
          appendMetric(record);
          return null;
        },
      });

      return config;
    },
  },
});
