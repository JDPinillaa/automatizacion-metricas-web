/**
 * Páginas institucionales a monitorear.
 *
 * Contrato de cada elemento:
 * @typedef {Object} PageConfig
 * @property {string} id    Identificador único (usado en schedule.js y en el reporte).
 * @property {string} name  Nombre legible para el reporte.
 * @property {string} url   URL absoluta (Lighthouse la consume directamente).
 * @property {string} owner Responsable o equipo asignado.
 *
 * Nota: la tercera URL depende del query string `?tipoPago=M`; debe conservarse
 * tal cual para que las métricas sigan siendo comparables entre ejecuciones.
 *
 * @type {PageConfig[]}
 */
module.exports = [
  {
    id: 'portal-pagos',
    name: 'Portal de Pagos UAM (Inicio)',
    url: 'https://intrauam.autonoma.edu.co/ponline/',
    path: '/ponline/',
    owner: 'Ever',
    enabled: true,
  },
  {
    id: 'pago-publico',
    name: 'Pago Público en Línea',
    url: 'https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/pagoPublico',
    owner: 'Pendiente',
  },
  {
    id: 'adjunto-pago',
    name: 'Adjunto de Pago (tipo M)',
    url: 'https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/adjuntoPago?tipoPago=M',
    owner: 'Pendiente',
  },
];
