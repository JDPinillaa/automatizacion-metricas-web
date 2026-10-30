/**
 * Jobs de ejecución programada.
 *
 * Contrato de cada job:
 * @typedef {Object} ScheduleJob
 * @property {string} id             Identificador único del job.
 * @property {boolean} enabled       Si el job debe registrarse en node-cron.
 * @property {string} startDate      Fecha de inicio (YYYY-MM-DD).
 * @property {string} time           Hora local de ejecución (HH:mm, 24 h).
 * @property {string} [timezone]     Zona horaria IANA (por defecto America/Bogota).
 * @property {'once'|'daily'|'weekly'} frequency
 *   - once:   una sola vez, en `startDate` a la hora `time`.
 *   - daily:  todos los días a `time`, desde `startDate` (inclusive).
 *   - weekly: cada semana el mismo día de la semana que `startDate`, a `time`.
 * @property {string} deviceProfile  Clave de config/devices.js.
 * @property {string[]} pages        Ids de config/pages.js.
 *
 * Los jobs se entregan deshabilitados para evitar ejecuciones accidentales
 * contra producción al clonar el repositorio.
 *
 * @type {ScheduleJob[]}
 */
module.exports = [
  {
    id: 'mobile-daily',
    enabled: false,
    startDate: '2026-11-01',
    time: '06:00',
    timezone: 'America/Bogota',
    frequency: 'daily',
    deviceProfile: 'mobile',
    pages: ['portal-pagos', 'pago-publico', 'adjunto-pago'],
  },
  {
    id: 'desktop-weekly',
    enabled: false,
    startDate: '2026-11-01',
    time: '07:00',
    timezone: 'America/Bogota',
    frequency: 'weekly',
    deviceProfile: 'desktop',
    pages: ['portal-pagos', 'pago-publico', 'adjunto-pago'],
  },
];
