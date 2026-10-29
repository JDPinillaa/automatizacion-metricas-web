const { defineConfig } = require('cypress');

/**
 * Configuración base de Cypress (E2E).
 *
 * Tareas de Node pendientes de implementar:
 * - runLighthouse: ejecuta Lighthouse sobre una URL y un perfil de dispositivo.
 * - saveMetrics: persiste las métricas obtenidas en el fixture/repositorio de resultados.
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
         * Ejecuta una auditoría Lighthouse.
         *
         * @param {{ url: string, deviceProfile: string }} args
         * @returns {Promise<null>} // TODO: devolver el reporte/resultado de Lighthouse
         */
        runLighthouse({ url, deviceProfile }) {
          // TODO: Implementar ejecución de Lighthouse (lighthouse + chrome-launcher)
          // TODO: Aplicar config/devices.js y config/thresholds.js
          return null;
        },

        /**
         * Guarda las métricas de una página en el almacenamiento de resultados.
         *
         * @param {{ pageId: string, deviceProfile: string, metrics: object }} payload
         * @returns {null} // TODO: devolver el resultado de la persistencia
         */
        saveMetrics({ pageId, deviceProfile, metrics }) {
          // TODO: Implementar persistencia en cypress/fixtures/lighthouse-metrics.json
          return null;
        },
      });

      // TODO: registrar más plugins/tareas si el equipo lo requiere
      return config;
    },
  },
});
