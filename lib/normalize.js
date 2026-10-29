const SOURCE = 'lighthouse-local';

/**
 * Identificador determinista de una medición.
 * Permite que un reintento actualice el registro en lugar de duplicarlo.
 *
 * @param {{ runId: string, pageId: string, deviceProfile: string, source?: string }} args
 * @returns {string}
 */
function buildRecordId({ runId, pageId, deviceProfile, source = SOURCE }) {
  return [runId, source, pageId, deviceProfile].join(':');
}

/**
 * Extrae el valor numérico de una auditoría de Lighthouse.
 *
 * @param {Object} lhr
 * @param {string} auditId
 * @returns {number|null}
 */
function numericAudit(lhr, auditId) {
  const value = lhr?.audits?.[auditId]?.numericValue;
  return Number.isFinite(value) ? value : null;
}

/**
 * Recupera la emulación de pantalla aplicada por Lighthouse y, si no está
 * disponible, usa la del perfil de dispositivo.
 *
 * @param {Object} lhr
 * @param {Object} device
 * @returns {Object|null}
 */
function resolveScreenEmulation(lhr, device) {
  return (
    lhr?.configSettings?.screenEmulation ||
    device?.lighthouse?.screenEmulation ||
    null
  );
}

/**
 * Convierte el resultado de Lighthouse al esquema común de métricas.
 *
 * @param {Object} lhr Resultado `lighthouseResult`/`lhr`.
 * @param {{ page: Object, device: Object, runId: string }} context
 * @returns {Object}
 */
function normalizeLighthouseResult(lhr, { page, device, runId }) {
  if (!lhr) {
    throw new Error('No hay resultados de Lighthouse para normalizar.');
  }

  if (!page?.id || !page?.url) {
    throw new Error('La página debe tener id y url.');
  }

  if (!device?.id) {
    throw new Error('El perfil de dispositivo debe tener id.');
  }

  if (!runId) {
    throw new Error('El runId es obligatorio.');
  }

  const score = lhr?.categories?.performance?.score;

  return {
    recordId: buildRecordId({
      runId,
      pageId: page.id,
      deviceProfile: device.id,
    }),
    runId,
    source: SOURCE,
    pageId: page.id,
    deviceProfile: device.id,
    deviceLabel: device.label || device.id,
    screenEmulation: resolveScreenEmulation(lhr, device),
    formFactor: lhr?.configSettings?.formFactor || device.lighthouse?.formFactor || null,
    url: page.url,
    finalUrl: lhr?.finalUrl || page.url,
    timestamp: lhr?.fetchTime || new Date().toISOString(),
    firstContentfulPaint: numericAudit(lhr, 'first-contentful-paint'),
    largestContentfulPaint: numericAudit(lhr, 'largest-contentful-paint'),
    speedIndex: numericAudit(lhr, 'speed-index'),
    performance: Number.isFinite(score) ? Math.round(score * 100) : null,
    lighthouseVersion: lhr?.lighthouseVersion || null,
    status: 'success',
    error: null,
  };
}

/**
 * Construye un registro de error con el mismo contrato que una medición exitosa.
 *
 * @param {{ page?: Object, device?: Object, runId: string, error: unknown }} args
 * @returns {Object}
 */
function buildErrorRecord({ page, device, runId, error }) {
  const pageId = page?.id || 'unknown-page';
  const deviceProfile = device?.id || 'unknown-device';
  const message = error instanceof Error ? error.message : String(error);

  return {
    recordId: buildRecordId({ runId, pageId, deviceProfile }),
    runId,
    source: SOURCE,
    pageId,
    deviceProfile,
    deviceLabel: device?.label || deviceProfile,
    screenEmulation: device?.lighthouse?.screenEmulation || null,
    formFactor: device?.lighthouse?.formFactor || null,
    url: page?.url || null,
    finalUrl: null,
    timestamp: new Date().toISOString(),
    firstContentfulPaint: null,
    largestContentfulPaint: null,
    speedIndex: null,
    performance: null,
    lighthouseVersion: null,
    status: 'error',
    error: message,
  };
}

module.exports = {
  SOURCE,
  buildRecordId,
  normalizeLighthouseResult,
  buildErrorRecord,
};
