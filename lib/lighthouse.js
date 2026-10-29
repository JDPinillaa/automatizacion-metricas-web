/**
 * Ejecuta una auditoría Lighthouse local sobre una URL.
 *
 * Lighthouse 13 y chrome-launcher son paquetes ESM, por eso se importan
 * dinámicamente dentro de esta función (el proyecto usa CommonJS).
 *
 * @param {{ url: string, device: import('../config/devices').DeviceProfile }} args
 * @returns {Promise<Object>} Objeto `lhr` devuelto por Lighthouse.
 */
async function runLighthouseAudit({ url, device }) {
  if (!url) {
    throw new Error('La URL es obligatoria para ejecutar Lighthouse.');
  }

  if (!device || !device.lighthouse) {
    throw new Error('El perfil de dispositivo no tiene configuración de Lighthouse.');
  }

  const { launch } = await import('chrome-launcher');
  const { default: lighthouse } = await import('lighthouse');

  const chromeFlags = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  const launchOptions = { chromeFlags };

  // Permite indicar una instalación de Chrome distinta a la detectada por defecto.
  if (process.env.CHROME_PATH) {
    launchOptions.chromePath = process.env.CHROME_PATH;
  }

  const chrome = await launch(launchOptions);

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      formFactor: device.lighthouse.formFactor,
      screenEmulation: device.lighthouse.screenEmulation,
      throttling: device.lighthouse.throttling,
      throttlingMethod: device.lighthouse.throttlingMethod || 'simulate',
      maxWaitForLoad: 60000,
    });

    if (!result || !result.lhr) {
      throw new Error('Lighthouse no devolvió resultados.');
    }

    return result.lhr;
  } finally {
    // Nunca dejar un proceso de Chrome abierto, incluso si Lighthouse falla.
    try {
      await chrome.kill();
    } catch (error) {
      // El error original de Lighthouse es más relevante que un fallo al cerrar Chrome.
    }
  }
}

module.exports = { runLighthouseAudit };
