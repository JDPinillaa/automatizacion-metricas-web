/**
 * Perfiles de emulación soportados.
 *
 * Cada perfil expone dos bloques:
 * - cypress: opciones de viewport para `cy.viewport(...)`.
 * - lighthouse: opciones de emulación para la tarea `runLighthouse`.
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
  desktop: {
    id: 'desktop',
    label: 'Escritorio 1350x940',
    cypress: {
      viewportWidth: 1350,
      viewportHeight: 940,
      isMobile: false,
      hasTouch: false,
    },
    lighthouse: {
      formFactor: 'desktop',
      screenEmulation: {
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        mobile: false,
        disabled: false,
      },
      // TODO: definir throttling (red/CPU) para escritorio
      throttling: {},
    },
  },

  'moto-g': {
    id: 'moto-g',
    label: 'Moto G (emulado)',
    cypress: {
      viewportWidth: 360,
      viewportHeight: 640,
      isMobile: true,
      hasTouch: true,
    },
    lighthouse: {
      formFactor: 'mobile',
      screenEmulation: {
        width: 360,
        height: 640,
        deviceScaleFactor: 3,
        mobile: true,
        disabled: false,
      },
      // TODO: definir throttling móvil (red/CPU) alineado con Lighthouse
      throttling: {},
    },
  },
};
