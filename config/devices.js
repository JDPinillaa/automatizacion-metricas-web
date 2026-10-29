/**
 * Perfiles de emulación soportados.
 *
 * Cada perfil expone dos bloques:
 * - cypress: opciones de viewport para `cy.viewport(...)`.
 * - lighthouse: opciones de emulación para la tarea `runLighthouse`.
 *
 * Los valores de Lighthouse replican los presets oficiales:
 * - móvil: Moto G Power, 412x823, DSF 1.75, throttling mobileSlow4G.
 * - escritorio: 1350x940, DSF 1, throttling desktopDense4G.
 *
 * @typedef {Object} DeviceProfile
 * @property {string} id
 * @property {string} label
 * @property {Object} cypress
 * @property {Object} lighthouse
 *
 * @type {Record<string, DeviceProfile>}
 */
module.exports = {
  mobile: {
    id: 'mobile',
    label: 'Moto G Power (412x823)',
    cypress: {
      viewportWidth: 412,
      viewportHeight: 823,
      isMobile: true,
      hasTouch: true,
    },
    lighthouse: {
      formFactor: 'mobile',
      throttlingMethod: 'simulate',
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        disabled: false,
      },
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        requestLatencyMs: 562.5,
        downloadThroughputKbps: 1474.56,
        uploadThroughputKbps: 675,
        cpuSlowdownMultiplier: 4,
      },
    },
  },

  desktop: {
    id: 'desktop',
    label: 'Escritorio (1350x940)',
    cypress: {
      viewportWidth: 1350,
      viewportHeight: 940,
      isMobile: false,
      hasTouch: false,
    },
    lighthouse: {
      formFactor: 'desktop',
      throttlingMethod: 'simulate',
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttling: {
        rttMs: 40,
        throughputKbps: 10240,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
        cpuSlowdownMultiplier: 1,
      },
    },
  },
};
