const pages = require('../../config/pages');
const devices = require('../../config/devices');

/**
 * Suite de automatización de métricas web.
 *
 * Pendiente de implementación:
 * - Iterar las páginas de config/pages.js.
 * - Ejecutar auditorías Lighthouse con los perfiles de config/devices.js.
 * - Persistir y validar las métricas contra config/thresholds.js.
 */
describe('Lighthouse Metrics Automation', () => {
  it('evaluates configured pages...', () => {
    // TODO: Implementar la evaluación de páginas configuradas.
    // TODO: Usar `pages`, `devices` y `cy.task('runLighthouse')`.
    // TODO: Guardar resultados con `cy.task('saveMetrics')`.
  });
});
