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
    label: 'Escritorio 1366x768',
    cypress: {
      viewportWidth: 1366,
      viewportHeight: 768,
      isMobile: false,
      hasTouch: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
    lighthouse: {
      formFactor: 'desktop',
      screenEmulation: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        mobile: false,
        disabled: false,
      },
      // TODO: definir throttling (red/CPU) para escritorio
      throttling: {},
    },
  },

  mobile: {
    id: 'mobile',
    label: 'Mobile 412x823',
    cypress: {
      viewportWidth: 412,
      viewportHeight: 823,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
    lighthouse: {
      formFactor: 'mobile',
      screenEmulation: {
        width: 412,
        height: 823,
        deviceScaleFactor: 1,
        mobile: true,
        disabled: false,
      },
      // TODO: definir throttling (red/CPU) para este perfil.
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
