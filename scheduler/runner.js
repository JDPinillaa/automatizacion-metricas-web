const cron = require('node-cron');
const jobs = require('../config/schedule');
const pages = require('../config/pages');

/**
 * Ejecuta un job programado.
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @returns {Promise<void>}
 */
async function runJob(job) {
  // TODO: Implementar ejecución programada de Cypress
  // TODO: resolver las páginas del job desde config/pages.js
  // TODO: invocar Cypress con el perfil de dispositivo correspondiente
  // TODO: persistir los resultados en cypress/fixtures/lighthouse-metrics.json
}

/**
 * Registra en node-cron los jobs habilitados de config/schedule.js.
 *
 * @returns {void}
 */
function startScheduler() {
  // TODO: validar expresiones cron y filtrar jobs por `enabled`
  // TODO: respetar `timezone`, `startDate`, `time` y `frequency`
  // TODO: registrar cada job con cron.schedule(...)
}

/**
 * Detiene las tareas programadas activas.
 *
 * @returns {void}
 */
function stopScheduler() {
  // TODO: detener las tareas registradas
}

module.exports = {
  runJob,
  startScheduler,
  stopScheduler,
};

if (require.main === module) {
  // TODO: iniciar el scheduler y manejar señales de cierre (SIGINT/SIGTERM)
  // startScheduler();
}
