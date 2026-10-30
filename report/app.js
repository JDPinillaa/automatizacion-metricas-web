/**
 * Informe web de métricas Lighthouse — Portal de Pagos UAM.
 *
 * Estructura:
 * - Lógica pura (normalización, agrupación, comparativas, tendencias, formato):
 *   sin DOM, exportada con `module.exports` para las pruebas de node:test.
 * - Capa de presentación: solo se activa en el navegador (existe `document`).
 *
 * Datos: GET data/metrics.json (o data/demo-metrics.json con ?demo=1) y
 * GET data/config.json, servidos por report/serve.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MetricsReport = api;
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => api.bootstrap());
    } else {
      api.bootstrap();
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ======================================================================
   * Constantes
   * ==================================================================== */

  const LOCALE = 'es-CO';
  const TIMEZONE = 'America/Bogota';
  const LEVELS = ['good', 'needsImprovement', 'poor'];
  const HISTORY_PAGE_SIZE = 12;

  /** Métricas en el orden de presentación. */
  const METRICS = [
    { key: 'performance', short: 'Performance', name: 'Puntaje de Performance', unit: 'score' },
    { key: 'firstContentfulPaint', short: 'FCP', name: 'First Contentful Paint', unit: 'ms' },
    { key: 'largestContentfulPaint', short: 'LCP', name: 'Largest Contentful Paint', unit: 'ms' },
    { key: 'speedIndex', short: 'SI', name: 'Speed Index', unit: 'ms' },
  ];

  const DEVICE_NAMES = { mobile: 'Móvil', desktop: 'Escritorio' };

  /** Señal visual por nivel: icono (forma) + clase CSS + estilo de punto en Chart.js. */
  const LEVEL_META = {
    good: { icon: '●', css: 'good', pointStyle: 'circle' },
    needsImprovement: { icon: '▲', css: 'warn', pointStyle: 'triangle' },
    poor: { icon: '■', css: 'poor', pointStyle: 'rect' },
    error: { icon: '✕', css: 'error', pointStyle: 'crossRot', label: 'Error' },
    none: { icon: '–', css: 'none', pointStyle: 'circle', label: 'Sin dato' },
  };

  const TREND_META = {
    better: { icon: '↑', label: 'Mejora', css: 'better' },
    worse: { icon: '↓', label: 'Empeora', css: 'worse' },
    same: { icon: '=', label: 'Estable', css: 'same' },
  };

  /**
   * Configuración de respaldo cuando el informe se abre sin servidor (file://).
   * La fuente de verdad es config/*.js, servida en data/config.json.
   */
  const DEFAULT_CONFIG = {
    thresholds: {
      firstContentfulPaint: { unit: 'ms', direction: 'lower-is-better', good: { min: 0, max: 1800 }, needsImprovement: { min: 1800, max: 3000 }, poor: { min: 3000, max: null } },
      largestContentfulPaint: { unit: 'ms', direction: 'lower-is-better', good: { min: 0, max: 2500 }, needsImprovement: { min: 2500, max: 4000 }, poor: { min: 4000, max: null } },
      speedIndex: { unit: 'ms', direction: 'lower-is-better', good: { min: 0, max: 3400 }, needsImprovement: { min: 3400, max: 5800 }, poor: { min: 5800, max: null } },
      performance: { unit: 'score', direction: 'higher-is-better', good: { min: 90, max: 100 }, needsImprovement: { min: 50, max: 90 }, poor: { min: 0, max: 50 } },
    },
    labels: { good: 'Bueno', needsImprovement: 'Por mejorar', poor: 'Deficiente' },
    pages: [],
    devices: [
      { id: 'mobile', label: 'Moto G Power (412x823)' },
      { id: 'desktop', label: 'Escritorio (1350x940)' },
    ],
  };

  const DEFAULT_FILTERS = { page: 'all', device: 'all', metric: 'performance', from: '', to: '' };

  /* ======================================================================
   * Utilidades genéricas
   * ==================================================================== */

  /** @param {unknown} value @returns {value is number} */
  function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  /**
   * Escapa texto para insertarlo en HTML.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** @param {string} key @returns {typeof METRICS[number]|undefined} */
  function getMetric(key) {
    return METRICS.find((metric) => metric.key === key);
  }

  /**
   * Dirección de mejora de una métrica.
   *
   * @param {string} key
   * @param {Object} [thresholds]
   * @returns {'lower-is-better'|'higher-is-better'}
   */
  function getDirection(key, thresholds) {
    const configured = thresholds && thresholds[key] && thresholds[key].direction;
    if (configured) return configured;
    return getMetric(key)?.unit === 'score' ? 'higher-is-better' : 'lower-is-better';
  }

  /* ======================================================================
   * Formato
   * ==================================================================== */

  /**
   * Convierte milisegundos a segundos con 2 decimales en formato es-CO.
   *
   * @param {number|null|undefined} ms
   * @returns {string} p. ej. "2,52 s" o "—"
   */
  function formatSeconds(ms) {
    if (!isNumber(ms)) return '—';
    const seconds = (ms / 1000).toLocaleString(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${seconds} s`;
  }

  /**
   * Formatea el puntaje de Performance (0-100).
   *
   * @param {number|null|undefined} score
   * @returns {string}
   */
  function formatScore(score) {
    return isNumber(score) ? String(Math.round(score)) : '—';
  }

  /**
   * Formatea el valor de una métrica según su unidad.
   *
   * @param {string} key
   * @param {number|null|undefined} value
   * @returns {string}
   */
  function formatMetric(key, value) {
    return getMetric(key)?.unit === 'score' ? formatScore(value) : formatSeconds(value);
  }

  /**
   * Formatea una diferencia con signo (segundos o puntos).
   *
   * @param {string} key
   * @param {number|null} diff
   * @returns {string}
   */
  function formatDiff(key, diff) {
    if (!isNumber(diff)) return '—';
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
    const magnitude = Math.abs(diff);
    return getMetric(key)?.unit === 'score'
      ? `${sign}${Math.round(magnitude)} pts`
      : `${sign}${formatSeconds(magnitude)}`;
  }

  /**
   * Valor en unidades de presentación (segundos para tiempos, puntos para score).
   *
   * @param {string} key
   * @param {number|null|undefined} value
   * @returns {number|null}
   */
  function toDisplayValue(key, value) {
    if (!isNumber(value)) return null;
    return getMetric(key)?.unit === 'score' ? value : Math.round(value) / 1000;
  }

  /**
   * Formatea fecha y hora en America/Bogota.
   *
   * @param {string|number|Date} value
   * @param {{ time?: boolean }} [options]
   * @returns {string}
   */
  function formatDate(value, { time = true } = {}) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    }).format(date);
  }

  /**
   * Fecha local (America/Bogota) en formato YYYY-MM-DD.
   *
   * @param {string|number|Date} value
   * @returns {string}
   */
  function toLocalDateString(value) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  }

  /* ======================================================================
   * Clasificación
   * ==================================================================== */

  /**
   * Clasifica un valor con la misma regla que lib/classify.js: [min, max),
   * con el límite superior 100 inclusivo para Performance.
   *
   * @param {number} value
   * @param {Object} metricThresholds
   * @returns {'good'|'needsImprovement'|'poor'|null}
   */
  function classifyValue(value, metricThresholds) {
    if (!isNumber(value) || !metricThresholds) return null;
    for (const level of LEVELS) {
      const range = metricThresholds[level];
      if (!range) continue;
      const meetsMin = value >= range.min;
      const meetsMax = range.max === null || value < range.max || (range.max === 100 && value === 100);
      if (meetsMin && meetsMax) return level;
    }
    return null;
  }

  /**
   * Nivel de una métrica en un registro. Usa la etiqueta guardada (`*Status`)
   * y, si falta, la recalcula con los umbrales.
   *
   * @param {Object} record
   * @param {string} key
   * @param {Object} config
   * @returns {'good'|'needsImprovement'|'poor'|'error'|null}
   */
  function levelOf(record, key, config) {
    const value = record[key];
    if (!isNumber(value)) {
      return record.status === 'error' ? 'error' : null;
    }
    const label = record[`${key}Status`];
    if (label) {
      const level = LEVELS.find((candidate) => config.labels[candidate] === label);
      if (level) return level;
    }
    return classifyValue(value, config.thresholds[key]);
  }

  /**
   * Etiqueta visible de un nivel.
   *
   * @param {string|null} level
   * @param {Object} labels
   * @returns {string}
   */
  function levelLabel(level, labels) {
    if (level && labels[level]) return labels[level];
    return (LEVEL_META[level] || LEVEL_META.none).label || LEVEL_META.none.label;
  }

  /**
   * Bandas de umbral en unidades de presentación (para gráficas y barras).
   *
   * @param {string} key
   * @param {Object} thresholds
   * @returns {{ level: string, from: number, to: number }[]}
   */
  function thresholdBands(key, thresholds) {
    const config = thresholds[key];
    if (!config) return [];
    return LEVELS.filter((level) => config[level]).map((level) => ({
      level,
      from: toDisplayValue(key, config[level].min),
      to: config[level].max === null ? Infinity : toDisplayValue(key, config[level].max),
    }));
  }

  /* ======================================================================
   * Datos
   * ==================================================================== */

  /**
   * Valida, enriquece y ordena los registros del JSON.
   *
   * @param {unknown} raw
   * @param {Object} config
   * @returns {{ records: Object[], rejected: unknown[] }}
   */
  function normalizeRecords(raw, config) {
    if (!Array.isArray(raw)) {
      throw new Error('El archivo de métricas debe contener un arreglo JSON.');
    }

    const pageNames = new Map((config.pages || []).map((page) => [page.id, page.name]));
    const records = [];
    const rejected = [];

    for (const record of raw) {
      const time = record && typeof record === 'object' ? Date.parse(record.timestamp) : NaN;
      if (!record || !record.recordId || !record.pageId || !record.deviceProfile || !Number.isFinite(time)) {
        rejected.push(record);
        continue;
      }

      const levels = {};
      for (const metric of METRICS) {
        levels[metric.key] = levelOf(record, metric.key, config);
      }

      records.push({
        ...record,
        time,
        pageName: pageNames.get(record.pageId) || record.pageId,
        isError: record.status === 'error',
        levels,
      });
    }

    records.sort((a, b) => a.time - b.time);
    return { records, rejected };
  }

  /** @param {Object} record @returns {string} */
  function seriesKey(record) {
    return `${record.pageId}|${record.deviceProfile}`;
  }

  /**
   * Agrupa registros por corrida (`runId`), ordenadas por fecha de inicio.
   *
   * @param {Object[]} records
   * @returns {{ runId: string, startedAt: number, records: Object[] }[]}
   */
  function groupRuns(records) {
    const runs = new Map();
    for (const record of records) {
      const run = runs.get(record.runId) || { runId: record.runId, startedAt: record.time, records: [] };
      run.startedAt = Math.min(run.startedAt, record.time);
      run.records.push(record);
      runs.set(record.runId, run);
    }
    return [...runs.values()].sort((a, b) => a.startedAt - b.startedAt);
  }

  /**
   * Última medición por página x dispositivo.
   *
   * @param {Object[]} records Ordenados por fecha ascendente.
   * @returns {Map<string, { latest: Object|null, previous: Object|null, lastError: Object|null }>}
   *   `latest`/`previous`: últimas mediciones exitosas; `lastError`: error más
   *   reciente que `latest` (la última medición falló).
   */
  function latestByPageAndDevice(records) {
    const result = new Map();
    for (const record of records) {
      const key = seriesKey(record);
      const entry = result.get(key) || { latest: null, previous: null, lastError: null };
      if (record.isError) {
        entry.lastError = record;
      } else {
        entry.previous = entry.latest;
        entry.latest = record;
        entry.lastError = null;
      }
      result.set(key, entry);
    }
    return result;
  }

  /**
   * Mapa recordId → medición exitosa anterior de la misma página y dispositivo.
   *
   * @param {Object[]} records Ordenados por fecha ascendente.
   * @returns {Map<string, Object>}
   */
  function linkPrevious(records) {
    const lastByKey = new Map();
    const previous = new Map();
    for (const record of records) {
      const key = seriesKey(record);
      if (lastByKey.has(key)) previous.set(record.recordId, lastByKey.get(key));
      if (!record.isError) lastByKey.set(key, record);
    }
    return previous;
  }

  /**
   * Compara móvil vs. escritorio para cada métrica.
   *
   * @param {Object|null} mobile
   * @param {Object|null} desktop
   * @param {Object} thresholds
   * @returns {{ metric: string, mobile: number|null, desktop: number|null, diff: number|null, ratio: number|null, better: 'mobile'|'desktop'|'equal'|null }[]}
   */
  function compareDevices(mobile, desktop, thresholds) {
    return METRICS.map(({ key }) => {
      const a = mobile ? mobile[key] : null;
      const b = desktop ? desktop[key] : null;
      if (!isNumber(a) || !isNumber(b)) {
        return { metric: key, mobile: isNumber(a) ? a : null, desktop: isNumber(b) ? b : null, diff: null, ratio: null, better: null };
      }
      const direction = getDirection(key, thresholds);
      let better = 'equal';
      if (a !== b) {
        const mobileWins = direction === 'lower-is-better' ? a < b : a > b;
        better = mobileWins ? 'mobile' : 'desktop';
      }
      return { metric: key, mobile: a, desktop: b, diff: a - b, ratio: b !== 0 ? a / b : null, better };
    });
  }

  /**
   * Tendencia de una métrica respecto a la medición anterior, ignorando la
   * variación normal de Lighthouse (±5 % en tiempos, ±2 pts en Performance).
   *
   * @param {number|null} current
   * @param {number|null} previous
   * @param {{ direction: string, unit: string, relativeTolerance?: number, absoluteTolerance?: number }} options
   * @returns {'better'|'worse'|'same'|null}
   */
  function trend(current, previous, { direction, unit, relativeTolerance = 0.05, absoluteTolerance = 2 }) {
    if (!isNumber(current) || !isNumber(previous)) return null;
    const delta = current - previous;
    const withinNoise =
      unit === 'score'
        ? Math.abs(delta) <= absoluteTolerance
        : previous === 0
          ? delta === 0
          : Math.abs(delta) / previous <= relativeTolerance;
    if (withinNoise) return 'same';
    const improved = direction === 'higher-is-better' ? delta > 0 : delta < 0;
    return improved ? 'better' : 'worse';
  }

  /**
   * Cuenta niveles en un conjunto de registros.
   *
   * @param {Object[]} records
   * @returns {{ good: number, needsImprovement: number, poor: number, error: number }}
   */
  function summarizeLevels(records) {
    const counts = { good: 0, needsImprovement: 0, poor: 0, error: 0 };
    for (const record of records) {
      for (const metric of METRICS) {
        const level = record.levels[metric.key];
        if (level && level in counts) counts[level] += 1;
      }
    }
    return counts;
  }

  /**
   * Aplica filtros de página, dispositivo y rango de fechas (locales, inclusivos).
   *
   * @param {Object[]} records
   * @param {{ page?: string, device?: string, from?: string, to?: string }} filters
   * @returns {Object[]}
   */
  function filterRecords(records, { page = 'all', device = 'all', from = '', to = '' } = {}) {
    return records.filter((record) => {
      if (page !== 'all' && record.pageId !== page) return false;
      if (device !== 'all' && record.deviceProfile !== device) return false;
      if (from || to) {
        const day = toLocalDateString(record.time);
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      return true;
    });
  }

  /**
   * Lee filtros desde el query string.
   *
   * @param {string} search
   * @returns {typeof DEFAULT_FILTERS}
   */
  function parseFilters(search) {
    const params = new URLSearchParams(search);
    const filters = { ...DEFAULT_FILTERS };
    for (const key of Object.keys(DEFAULT_FILTERS)) {
      const value = params.get(key);
      if (value) filters[key] = value;
    }
    if (!getMetric(filters.metric)) filters.metric = DEFAULT_FILTERS.metric;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.from)) filters.from = '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) filters.to = '';
    return filters;
  }

  /**
   * Serializa filtros (omitiendo valores por defecto) y el modo demo.
   *
   * @param {typeof DEFAULT_FILTERS} filters
   * @param {{ demo?: boolean }} [options]
   * @returns {string} Query string con `?` o cadena vacía.
   */
  function serializeFilters(filters, { demo = false } = {}) {
    const params = new URLSearchParams();
    if (demo) params.set('demo', '1');
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== DEFAULT_FILTERS[key]) params.set(key, value);
    }
    const query = params.toString();
    return query ? `?${query}` : '';
  }

  /**
   * Orden de páginas: el de la configuración y luego las desconocidas.
   *
   * @param {Object[]} records
   * @param {Object} config
   * @returns {{ id: string, name: string, url?: string, owner?: string }[]}
   */
  function listPages(records, config) {
    const pages = [...(config.pages || [])];
    for (const record of records) {
      if (!pages.some((page) => page.id === record.pageId)) {
        pages.push({ id: record.pageId, name: record.pageName, url: record.url });
      }
    }
    return pages;
  }

  /* ======================================================================
   * Presentación (solo navegador)
   * ==================================================================== */

  const state = {
    config: DEFAULT_CONFIG,
    records: [],
    rejected: [],
    demo: false,
    offline: false,
    filters: { ...DEFAULT_FILTERS },
    view: 'resumen',
    historyPage: 1,
    charts: {},
  };

  const VIEWS = ['resumen', 'comparativa', 'historial', 'umbrales'];

  /** @param {string} id @returns {HTMLElement} */
  const $ = (id) => document.getElementById(id);

  /** Lee un color definido en styles.css. */
  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function levelColor(level) {
    const map = {
      good: cssVar('--good', '#34d399'),
      needsImprovement: cssVar('--warn', '#fbbf24'),
      poor: cssVar('--poor', '#f87171'),
      error: cssVar('--muted', '#94a3b8'),
    };
    return map[level] || map.error;
  }

  /* ---------- Componentes HTML ---------- */

  /**
   * Insignia de estado: color + forma + texto (accesible sin depender del color).
   */
  function badge(level, { compact = false } = {}) {
    const meta = LEVEL_META[level] || LEVEL_META.none;
    const label = levelLabel(level, state.config.labels);
    return `<span class="badge badge--${meta.css}${compact ? ' badge--compact' : ''}" title="${escapeHtml(label)}">
      <span class="badge__icon" aria-hidden="true">${meta.icon}</span><span class="badge__text">${escapeHtml(label)}</span></span>`;
  }

  function trendChip(value) {
    if (!value) return '';
    const meta = TREND_META[value];
    return `<span class="trend trend--${meta.css}" title="${meta.label} vs. medición anterior" aria-label="${meta.label}">${meta.icon}</span>`;
  }

  /** Mini barra con las tres zonas de umbral y un marcador del valor. */
  function thresholdBar(key, value) {
    const bands = thresholdBands(key, state.config.thresholds);
    const display = toDisplayValue(key, value);
    if (!bands.length) return '';
    const isScore = getMetric(key).unit === 'score';
    const finite = bands.filter((band) => Number.isFinite(band.to)).map((band) => band.to);
    const max = isScore ? 100 : Math.max(...finite) * 1.5;
    const ordered = [...bands].sort((a, b) => a.from - b.from);
    const segments = ordered
      .map((band) => {
        const to = Math.min(band.to, max);
        const width = ((to - band.from) / max) * 100;
        return `<span class="tbar__zone tbar__zone--${LEVEL_META[band.level].css}" style="width:${width}%"></span>`;
      })
      .join('');
    const marker =
      display === null
        ? ''
        : `<span class="tbar__marker" style="left:${Math.min(display, max) / max * 100}%"></span>`;
    return `<span class="tbar" aria-hidden="true">${segments}${marker}</span>`;
  }

  function metricAria(record, key) {
    const metric = getMetric(key);
    return `${metric.short} ${formatMetric(key, record[key])}, ${levelLabel(record.levels[key], state.config.labels)}`;
  }

  function deviceName(id) {
    return DEVICE_NAMES[id] || id;
  }

  function deviceLabel(id) {
    return (state.config.devices || []).find((device) => device.id === id)?.label || id;
  }

  function devicesInScope() {
    const ids = [...new Set([...(state.config.devices || []).map((d) => d.id), ...state.records.map((r) => r.deviceProfile)])];
    return state.filters.device === 'all' ? ids : ids.filter((id) => id === state.filters.device);
  }

  function pagesInScope() {
    const pages = listPages(state.records, state.config);
    return state.filters.page === 'all' ? pages : pages.filter((page) => page.id === state.filters.page);
  }

  function scopedRecords() {
    return filterRecords(state.records, state.filters);
  }

  /* ---------- Carga ---------- */

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        message = (await response.json()).error || message;
      } catch {
        /* respuesta sin JSON */
      }
      throw new Error(message);
    }
    return response.json();
  }

  async function bootstrap() {
    const params = new URLSearchParams(location.search);
    state.demo = params.get('demo') === '1';
    state.filters = parseFilters(location.search);
    state.view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'resumen';

    bindUi();
    setupChartDefaults();

    if (location.protocol === 'file:') {
      showFallback('El informe se abrió directamente desde el disco, sin servidor.');
      return;
    }

    try {
      const [config, raw] = await Promise.all([
        fetchJson('/data/config.json'),
        fetchJson(state.demo ? '/data/demo-metrics.json' : '/data/metrics.json'),
      ]);
      setData(raw, config);
    } catch (error) {
      showFallback(`No se pudieron cargar los datos: ${error.message}`);
    }
  }

  function setData(raw, config) {
    const { records, rejected } = normalizeRecords(raw, config);
    state.config = config;
    state.records = records;
    state.rejected = rejected;
    if (rejected.length) {
      // eslint-disable-next-line no-console
      console.warn(`${rejected.length} registro(s) descartados por no cumplir el contrato mínimo.`, rejected);
    }

    const loader = $('loader');
    if (loader) {
      loader.hidden = true;
    }
    const fallback = $('fallback');
    if (fallback) fallback.hidden = true;
    const app = $('app');
    if (app) app.hidden = false;

    populateFilters();
    renderHeader();
    activateView(state.view);
  }

  function showFallback(reason) {
    state.offline = true;
    const loader = $('loader');
    if (loader) {
      loader.hidden = true;
    }
    const fallback = $('fallback');
    if (fallback) {
      fallback.hidden = false;
    }
    $('fallback-reason').textContent = reason;
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setData(JSON.parse(reader.result), DEFAULT_CONFIG);
        $('source-label').textContent = `Archivo local: ${file.name}`;
      } catch (error) {
        $('fallback-reason').textContent = `El archivo no es válido: ${error.message}`;
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Eventos ---------- */

  function bindUi() {
    for (const tab of document.querySelectorAll('[data-view]')) {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        activateView(tab.dataset.view);
      });
    }

    window.addEventListener('hashchange', () => {
      const view = location.hash.slice(1);
      if (VIEWS.includes(view) && view !== state.view) activateView(view);
    });

    for (const id of ['filter-page', 'filter-device', 'filter-metric', 'filter-from', 'filter-to']) {
      $(id).addEventListener('change', (event) => {
        state.filters[id.replace('filter-', '')] = event.target.value;
        state.historyPage = 1;
        onFiltersChanged();
      });
    }

    $('filter-reset').addEventListener('click', () => {
      state.filters = { ...DEFAULT_FILTERS };
      state.historyPage = 1;
      populateFilters();
      onFiltersChanged();
    });

    $('source-toggle').addEventListener('click', () => {
      const query = serializeFilters(state.filters, { demo: !state.demo });
      location.href = `${location.pathname}${query}#${state.view}`;
    });

    $('print-button').addEventListener('click', () => window.print());

    const input = $('fallback-file');
    input.addEventListener('change', () => input.files[0] && loadFile(input.files[0]));

    const drop = $('fallback-drop');
    ['dragenter', 'dragover'].forEach((type) =>
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('is-dragging');
      })
    );
    ['dragleave', 'drop'].forEach((type) =>
      drop.addEventListener(type, () => drop.classList.remove('is-dragging'))
    );
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('#history-pagination button[data-page]');
      if (!button) return;
      state.historyPage = Number(button.dataset.page);
      renderHistoryTable();
      const title = $('history-table-title');
      if (title) title.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="open-demo"]')) {
        location.href = `${location.pathname}${serializeFilters(state.filters, { demo: true })}#${state.view}`;
      }
    });
  }

  function onFiltersChanged() {
    if (!state.offline) {
      const query = serializeFilters(state.filters, { demo: state.demo });
      history.replaceState(null, '', `${location.pathname}${query}#${state.view}`);
    }
    renderHeader();
    renderView(state.view);
  }

  function activateView(view) {
    state.view = view;
    for (const tab of document.querySelectorAll('[data-view]')) {
      const active = tab.dataset.view === view;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const name of VIEWS) {
      $(`view-${name}`).hidden = name !== view;
    }
    if (location.hash.slice(1) !== view) {
      history.replaceState(null, '', `${location.pathname}${location.search}#${view}`);
    }
    renderView(view);
  }

  function renderView(view) {
    if (!state.records.length && view !== 'umbrales') {
      renderEmptyState(view);
      return;
    }
    ({ resumen: renderSummary, comparativa: renderComparison, historial: renderHistory, umbrales: renderThresholds })[view]();
  }

  /* ---------- Filtros y encabezado ---------- */

  function populateFilters() {
    const pages = listPages(state.records, state.config);
    $('filter-page').innerHTML =
      '<option value="all">Todas las páginas</option>' +
      pages.map((page) => `<option value="${escapeHtml(page.id)}">${escapeHtml(page.name)}</option>`).join('');

    const deviceIds = [...new Set([...(state.config.devices || []).map((d) => d.id), ...state.records.map((r) => r.deviceProfile)])];
    $('filter-device').innerHTML =
      '<option value="all">Móvil y escritorio</option>' +
      deviceIds.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(deviceName(id))}</option>`).join('');

    $('filter-metric').innerHTML = METRICS.map(
      (metric) => `<option value="${metric.key}">${escapeHtml(metric.short === metric.name ? metric.name : `${metric.short} — ${metric.name}`)}</option>`
    ).join('');

    if (state.records.length) {
      const first = toLocalDateString(state.records[0].time);
      const last = toLocalDateString(state.records[state.records.length - 1].time);
      for (const id of ['filter-from', 'filter-to']) {
        $(id).min = first;
        $(id).max = last;
      }
    }

    $('filter-page').value = pages.some((p) => p.id === state.filters.page) ? state.filters.page : 'all';
    $('filter-device').value = deviceIds.includes(state.filters.device) ? state.filters.device : 'all';
    $('filter-metric').value = state.filters.metric;
    $('filter-from').value = state.filters.from;
    $('filter-to').value = state.filters.to;
    state.filters.page = $('filter-page').value;
    state.filters.device = $('filter-device').value;
  }

  function renderHeader() {
    const runs = groupRuns(state.records);
    const last = state.records[state.records.length - 1];

    $('meta-updated').textContent = last ? formatDate(last.time) : '—';
    $('meta-runs').textContent = String(runs.length);
    $('meta-records').textContent = String(state.records.length);

    if (!state.offline) {
      $('source-label').textContent = state.demo ? 'Datos de demostración' : 'Datos reales';
    }
    $('source-toggle').textContent = state.demo ? 'Ver datos reales' : 'Ver demo';
    $('source-toggle').hidden = state.offline;
    $('demo-banner').hidden = !state.demo;

    const rejectedNotice = $('rejected-notice');
    rejectedNotice.hidden = state.rejected.length === 0;
    rejectedNotice.textContent = `${state.rejected.length} registro(s) del JSON se omitieron por no cumplir el contrato mínimo (ver consola).`;
  }

  function renderEmptyState(view) {
    const target = { resumen: 'summary-content', comparativa: 'comparison-content', historial: 'history-content' }[view];
    $(target).innerHTML = `<div class="empty">
      <p class="empty__title">Aún no hay mediciones.</p>
      <p>Ejecuta <code>npm run test:metrics</code> o el scheduler para generar datos.</p>
      ${state.demo || state.offline ? '' : '<button type="button" class="btn btn--primary" data-action="open-demo" id="empty-open-demo">Ver datos de demostración</button>'}
    </div>`;
  }

  /* ---------- Vista: Resumen ---------- */

  function renderSummary() {
    const records = scopedRecords();
    const latest = latestByPageAndDevice(records);
    const pages = pagesInScope();
    const devices = devicesInScope();

    const latestRecords = [...latest.values()].map((entry) => entry.latest).filter(Boolean);
    const counts = summarizeLevels(latestRecords);
    const failing = [...latest.values()].filter((entry) => entry.lastError);

    const counters = `
      <div class="counters" role="list">
        ${['good', 'needsImprovement', 'poor'].map((level) => `
          <div class="counter counter--${LEVEL_META[level].css}" role="listitem">
            <span class="counter__icon" aria-hidden="true">${LEVEL_META[level].icon}</span>
            <span class="counter__value">${counts[level]}</span>
            <span class="counter__label">${escapeHtml(state.config.labels[level])}</span>
          </div>`).join('')}
        <div class="counter counter--error" role="listitem">
          <span class="counter__icon" aria-hidden="true">✕</span>
          <span class="counter__value">${failing.length}</span>
          <span class="counter__label">Con error</span>
        </div>
      </div>
      <p class="hint">Conteo de métricas en la última medición de cada página y dispositivo${state.filters.to ? ` hasta el ${escapeHtml(formatDate(`${state.filters.to}T12:00:00`, { time: false }))}` : ''}.</p>`;

    const alerts = failing.length
      ? `<div class="alert alert--error" role="alert">
          <strong>La última medición falló en ${failing.length} caso(s):</strong>
          <ul>${failing.map(({ lastError }) => `<li>${escapeHtml(lastError.pageName)} · ${escapeHtml(deviceName(lastError.deviceProfile))} — ${escapeHtml(formatDate(lastError.time))}: ${escapeHtml(lastError.error || 'Error desconocido')}</li>`).join('')}</ul>
          <p class="hint">Las tarjetas muestran la última medición exitosa.</p>
        </div>`
      : '';

    const cards = pages
      .map((page) => {
        const columns = devices
          .map((deviceId) => {
            const entry = latest.get(`${page.id}|${deviceId}`);
            if (!entry || !entry.latest) {
              return `<div class="device-col device-col--empty">
                <h4 class="device-col__title">${escapeHtml(deviceName(deviceId))}</h4>
                <p class="hint">${entry && entry.lastError ? 'Solo hay mediciones con error.' : 'Sin mediciones en el rango.'}</p>
              </div>`;
            }
            const record = entry.latest;
            const previous = entry.previous;
            const perfLevel = record.levels.performance;
            const metricRows = METRICS.filter((m) => m.key !== 'performance')
              .map((metric) => {
                const t = trend(record[metric.key], previous && previous[metric.key], {
                  direction: getDirection(metric.key, state.config.thresholds),
                  unit: metric.unit,
                });
                return `<li class="metric-row" aria-label="${escapeHtml(metricAria(record, metric.key))}">
                  <span class="metric-row__name" title="${escapeHtml(metric.name)}">${metric.short}</span>
                  <span class="metric-row__value">${formatMetric(metric.key, record[metric.key])}${trendChip(t)}</span>
                  ${badge(record.levels[metric.key], { compact: true })}
                  ${thresholdBar(metric.key, record[metric.key])}
                </li>`;
              })
              .join('');
            const perfTrend = trend(record.performance, previous && previous.performance, { direction: 'higher-is-better', unit: 'score' });

            return `<div class="device-col">
              <h4 class="device-col__title">${escapeHtml(deviceName(deviceId))} <span class="device-col__sub">${escapeHtml(record.deviceLabel || deviceLabel(deviceId))}</span></h4>
              <div class="score">
                <div class="ring ring--${LEVEL_META[perfLevel]?.css || 'none'}" style="--value:${isNumber(record.performance) ? record.performance : 0}" role="img" aria-label="${escapeHtml(metricAria(record, 'performance'))}">
                  <span class="ring__value">${formatScore(record.performance)}</span>
                </div>
                <div class="score__meta">
                  <span class="score__label">Performance ${trendChip(perfTrend)}</span>
                  ${badge(perfLevel)}
                  <span class="hint">${escapeHtml(formatDate(record.time))}</span>
                </div>
              </div>
              <ul class="metric-list">${metricRows}</ul>
            </div>`;
          })
          .join('');

        return `<article class="card page-card" id="summary-${escapeHtml(page.id)}">
          <header class="card__header">
            <div>
              <h3 class="card__title">${escapeHtml(page.name)}</h3>
              ${page.url ? `<a class="card__link" href="${escapeHtml(page.url)}" target="_blank" rel="noopener">${escapeHtml(page.url.replace(/^https?:\/\//, ''))}</a>` : ''}
            </div>
            ${page.owner ? `<span class="chip">${escapeHtml(page.owner)}</span>` : ''}
          </header>
          <div class="device-grid">${columns}</div>
        </article>`;
      })
      .join('');

    $('summary-content').innerHTML = `${alerts}${counters}<div class="cards">${cards}</div>`;
  }

  /* ---------- Vista: Comparativa ---------- */

  function renderComparison() {
    const records = filterRecords(state.records, { ...state.filters, device: 'all' });
    const latest = latestByPageAndDevice(records);
    const pages = pagesInScope();
    const metricKey = state.filters.metric;
    const metric = getMetric(metricKey);

    const comparisons = pages.map((page) => {
      const mobile = latest.get(`${page.id}|mobile`)?.latest || null;
      const desktop = latest.get(`${page.id}|desktop`)?.latest || null;
      return { page, mobile, desktop, rows: compareDevices(mobile, desktop, state.config.thresholds) };
    });

    const insights = METRICS.filter((m) => m.unit === 'ms')
      .map((m) => {
        const ratios = comparisons.map((c) => c.rows.find((r) => r.metric === m.key).ratio).filter(isNumber);
        if (!ratios.length) return '';
        const average = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
        return `<li><strong>${m.short}</strong>: móvil tarda en promedio <strong>×${average.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</strong> lo de escritorio.</li>`;
      })
      .join('');

    const tables = comparisons
      .map(({ page, mobile, desktop, rows }) => {
        const body = rows
          .map((row) => {
            const m = getMetric(row.metric);
            const winner = row.better === 'mobile' ? 'Móvil' : row.better === 'desktop' ? 'Escritorio' : row.better === 'equal' ? 'Igual' : '—';
            const ratio = isNumber(row.ratio) && m.unit === 'ms' ? ` <span class="hint">(×${row.ratio.toLocaleString(LOCALE, { maximumFractionDigits: 1 })})</span>` : '';
            return `<tr>
              <th scope="row" title="${escapeHtml(m.name)}">${m.short}</th>
              <td>${mobile ? `<span class="cell-value">${formatMetric(m.key, row.mobile)}</span> ${badge(mobile.levels[m.key], { compact: true })}` : '—'}</td>
              <td>${desktop ? `<span class="cell-value">${formatMetric(m.key, row.desktop)}</span> ${badge(desktop.levels[m.key], { compact: true })}` : '—'}</td>
              <td class="cell-diff">${formatDiff(m.key, row.diff)}${ratio}</td>
              <td>${winner}</td>
            </tr>`;
          })
          .join('');
        return `<article class="card" id="comparison-${escapeHtml(page.id)}">
          <header class="card__header"><h3 class="card__title">${escapeHtml(page.name)}</h3>
            <span class="hint">${mobile ? `Móvil: ${escapeHtml(formatDate(mobile.time))}` : 'Móvil: sin datos'} · ${desktop ? `Escritorio: ${escapeHtml(formatDate(desktop.time))}` : 'Escritorio: sin datos'}</span>
          </header>
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">Métrica</th><th scope="col">Móvil</th><th scope="col">Escritorio</th><th scope="col">Diferencia (móvil − escritorio)</th><th scope="col">Mejor</th></tr></thead>
            <tbody>${body}</tbody>
          </table></div>
        </article>`;
      })
      .join('');

    $('comparison-content').innerHTML = `
      ${state.filters.device !== 'all' ? '<p class="alert alert--info">La comparativa muestra siempre ambos dispositivos; el filtro de dispositivo no aplica en esta vista.</p>' : ''}
      <article class="card chart-card">
        <header class="card__header">
          <h3 class="card__title">${escapeHtml(metric.name)} — última medición</h3>
          <span class="hint">${metric.unit === 'ms' ? 'Segundos (menos es mejor)' : 'Puntaje 0-100 (más es mejor)'}. Fondo: zonas Bueno / Por mejorar / Deficiente.</span>
        </header>
        <div class="chart-box"><canvas id="comparison-chart" role="img" aria-label="Gráfica de barras ${escapeHtml(metric.name)} móvil vs. escritorio"></canvas></div>
      </article>
      ${insights ? `<ul class="insights">${insights}</ul>` : ''}
      <div class="cards">${tables}</div>`;

    renderComparisonChart(comparisons, metricKey);
  }

  /* ---------- Vista: Historial ---------- */

  function renderHistory() {
    const records = scopedRecords();
    const runs = groupRuns(records);
    const metric = getMetric(state.filters.metric);

    const latest = latestByPageAndDevice(records);
    const trendChips = [...latest.entries()]
      .filter(([, entry]) => entry.latest)
      .map(([, { latest: record, previous }]) => {
        const t = trend(record[metric.key], previous && previous[metric.key], {
          direction: getDirection(metric.key, state.config.thresholds),
          unit: metric.unit,
        });
        return `<li class="trend-item">
          <span>${escapeHtml(record.pageName)} · ${escapeHtml(deviceName(record.deviceProfile))}</span>
          <strong>${formatMetric(metric.key, record[metric.key])}</strong>
          ${t ? `${trendChip(t)} <span class="hint">${TREND_META[t].label}</span>` : '<span class="hint">Sin medición previa</span>'}
        </li>`;
      })
      .join('');

    const fewRuns = runs.length < 2;

    $('history-content').innerHTML = `
      ${fewRuns ? `<div class="alert alert--info">Hay ${runs.length} corrida(s) en el rango: se necesitan al menos 2 para ver tendencias.
        ${state.demo || state.offline ? '' : ' <button type="button" class="btn btn--ghost" data-action="open-demo" id="history-open-demo">Ver demo con historial</button>'}</div>` : ''}
      <article class="card chart-card">
        <header class="card__header">
          <h3 class="card__title">${escapeHtml(metric.name)} en el tiempo</h3>
          <span class="hint">Línea continua: móvil · discontinua: escritorio. Forma del punto: ● Bueno ▲ Por mejorar ■ Deficiente. Los huecos son mediciones con error.</span>
        </header>
        <div class="chart-box chart-box--tall"><canvas id="history-chart" role="img" aria-label="Gráfica de líneas del historial de ${escapeHtml(metric.name)}"></canvas></div>
      </article>
      <article class="card">
        <header class="card__header"><h3 class="card__title">Tendencia vs. medición anterior</h3>
          <span class="hint">Se ignoran variaciones menores a ±5 % (tiempos) o ±2 pts (Performance).</span></header>
        <ul class="trend-list">${trendChips || '<li class="hint">Sin datos.</li>'}</ul>
      </article>
      <article class="card">
        <header class="card__header"><h3 class="card__title" id="history-table-title">Mediciones</h3>
          <span class="hint">${records.length} registro(s) · ${runs.length} corrida(s)</span></header>
        <div class="table-wrap"><table class="table table--history">
          <thead><tr>
            <th scope="col">Fecha</th><th scope="col">Página</th><th scope="col">Dispositivo</th>
            ${METRICS.map((m) => `<th scope="col" title="${escapeHtml(m.name)}">${m.short}</th>`).join('')}
            <th scope="col">Detalle</th>
          </tr></thead>
          <tbody id="history-tbody"></tbody>
        </table></div>
        <nav class="pagination" id="history-pagination" aria-label="Paginación del historial"></nav>
      </article>`;

    renderHistoryChart(records, metric.key);
    renderHistoryTable();
  }

  function renderHistoryTable() {
    const records = scopedRecords();
    const previousMap = linkPrevious(records);
    const rows = [...records].reverse();
    const totalPages = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE));
    state.historyPage = Math.min(Math.max(1, state.historyPage), totalPages);
    const start = (state.historyPage - 1) * HISTORY_PAGE_SIZE;
    const pageRows = rows.slice(start, start + HISTORY_PAGE_SIZE);

    $('history-tbody').innerHTML = pageRows
      .map((record) => {
        const previous = previousMap.get(record.recordId);
        const cells = METRICS.map((metric) => {
          if (record.isError) return `<td>${badge('error', { compact: true })}</td>`;
          const t = trend(record[metric.key], previous && previous[metric.key], {
            direction: getDirection(metric.key, state.config.thresholds),
            unit: metric.unit,
          });
          return `<td aria-label="${escapeHtml(metricAria(record, metric.key))}"><span class="cell-value">${formatMetric(metric.key, record[metric.key])}</span>${trendChip(t)} ${badge(record.levels[metric.key], { compact: true })}</td>`;
        }).join('');

        return `<tr class="${record.isError ? 'is-error' : ''}">
          <td class="nowrap">${escapeHtml(formatDate(record.time))}</td>
          <td>${escapeHtml(record.pageName)}</td>
          <td>${escapeHtml(deviceName(record.deviceProfile))}</td>
          ${cells}
          <td><details class="details">
            <summary>Ver</summary>
            <dl>
              <dt>runId</dt><dd><code>${escapeHtml(record.runId)}</code></dd>
              <dt>URL final</dt><dd>${escapeHtml(record.finalUrl || record.url || '—')}</dd>
              <dt>Dispositivo</dt><dd>${escapeHtml(record.deviceLabel || deviceLabel(record.deviceProfile))}</dd>
              <dt>Lighthouse</dt><dd>${escapeHtml(record.lighthouseVersion || '—')}</dd>
              ${record.error ? `<dt>Error</dt><dd class="text-poor">${escapeHtml(record.error)}</dd>` : ''}
            </dl>
          </details></td>
        </tr>`;
      })
      .join('') || `<tr><td colspan="${METRICS.length + 4}" class="hint">Sin mediciones en el rango seleccionado.</td></tr>`;

    const buttons = [];
    if (totalPages > 1) {
      buttons.push(`<button type="button" class="btn btn--ghost" data-page="${state.historyPage - 1}" id="history-prev" ${state.historyPage === 1 ? 'disabled' : ''}>‹ Anterior</button>`);
      buttons.push(`<span class="pagination__info">Página ${state.historyPage} de ${totalPages}</span>`);
      buttons.push(`<button type="button" class="btn btn--ghost" data-page="${state.historyPage + 1}" id="history-next" ${state.historyPage === totalPages ? 'disabled' : ''}>Siguiente ›</button>`);
    }
    $('history-pagination').innerHTML = buttons.join('');
  }

  /* ---------- Vista: Umbrales ---------- */

  function renderThresholds() {
    const { thresholds, labels } = state.config;
    const describe = (key, range, direction) => {
      const metric = getMetric(key);
      const fmt = (v) => (metric.unit === 'score' ? String(v) : formatSeconds(v));
      if (range.max === null) return `≥ ${fmt(range.min)}`;
      if (direction === 'lower-is-better' && range.min === 0) return `< ${fmt(range.max)}`;
      if (direction === 'higher-is-better' && range.max === 100) return `≥ ${fmt(range.min)}`;
      if (direction === 'higher-is-better' && range.min === 0) return `< ${fmt(range.max)}`;
      return `${fmt(range.min)} – ${fmt(range.max)}`;
    };

    const rows = METRICS.filter((m) => thresholds[m.key])
      .map((m) => {
        const t = thresholds[m.key];
        return `<tr>
          <th scope="row">${escapeHtml(m.name)} <span class="hint">(${m.short})</span></th>
          ${LEVELS.map((level) => `<td>${badge(level, { compact: true })} ${escapeHtml(describe(m.key, t[level], t.direction))}</td>`).join('')}
          <td>${t.direction === 'lower-is-better' ? 'Menos es mejor' : 'Más es mejor'}</td>
        </tr>`;
      })
      .join('');

    $('thresholds-content').innerHTML = `
      <article class="card">
        <header class="card__header"><h3 class="card__title">Umbrales de clasificación</h3>
          <span class="hint">Fuente: <code>config/thresholds.js</code>. Rangos [mín, máx).</span></header>
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">Métrica</th>${LEVELS.map((l) => `<th scope="col">${escapeHtml(labels[l])}</th>`).join('')}<th scope="col">Dirección</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </article>
      <article class="card">
        <header class="card__header"><h3 class="card__title">Cómo leer las señales</h3></header>
        <ul class="legend">
          ${LEVELS.map((level) => `<li>${badge(level)} <span>${escapeHtml({ good: 'Cumple la recomendación de Lighthouse.', needsImprovement: 'Aceptable, con margen de mejora.', poor: 'Afecta la experiencia; requiere atención.' }[level])}</span></li>`).join('')}
          <li>${badge('error')} <span>La auditoría falló; no hay valor para esa medición.</span></li>
          <li>${trendChip('better')} ${trendChip('worse')} ${trendChip('same')} <span>Tendencia frente a la medición anterior de la misma página y dispositivo.</span></li>
        </ul>
        <p class="hint">Cada señal combina color, forma y texto para que se entienda sin depender del color. Los tiempos se muestran en segundos; las mediciones son locales y pueden variar entre equipos y redes.</p>
      </article>`;
  }

  /* ---------- Gráficas (Chart.js) ---------- */

  const PAGE_COLORS = ['#818cf8', '#f472b6', '#2dd4bf', '#facc15', '#fb923c', '#a3e635'];
  const DEVICE_COLORS = { mobile: '#a78bfa', desktop: '#38bdf8' };

  /** Plugin propio: pinta las zonas de umbral detrás de los datos. */
  const thresholdBandsPlugin = {
    id: 'thresholdBands',
    beforeDatasetsDraw(chart, _args, options) {
      const bands = options && options.bands;
      const y = chart.scales.y;
      if (!bands || !bands.length || !y) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
      ctx.clip();
      for (const band of bands) {
        if (band.from >= y.max || band.to <= y.min) continue;
        const top = y.getPixelForValue(Math.min(band.to, y.max));
        const bottom = y.getPixelForValue(Math.max(band.from, y.min));
        ctx.fillStyle = levelColor(band.level);
        ctx.globalAlpha = 0.09;
        ctx.fillRect(chartArea.left, top, chartArea.width, bottom - top);
      }
      ctx.restore();
    },
  };

  function chartAvailable(canvasId) {
    if (typeof window.Chart === 'function') return true;
    const canvas = $(canvasId);
    if (canvas) {
      canvas.parentElement.innerHTML = '<p class="empty">No se pudo cargar Chart.js; las tablas siguen disponibles.</p>';
    }
    return false;
  }

  function setupChartDefaults() {
    if (typeof window.Chart !== 'function') return;
    const Chart = window.Chart;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = cssVar('--text-muted', '#94a3b8');
    Chart.defaults.borderColor = cssVar('--border', 'rgba(148,163,184,.15)');
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Chart.defaults.animation = false;
    }
  }

  function replaceChart(name, canvasId, config) {
    if (state.charts[name]) {
      state.charts[name].destroy();
      delete state.charts[name];
    }
    if (!chartAvailable(canvasId)) return;
    const canvas = $(canvasId);
    if (!canvas) return;
    state.charts[name] = new window.Chart(canvas, config);
  }

  function yAxisFor(metricKey, maxValue) {
    const metric = getMetric(metricKey);
    if (metric.unit === 'score') {
      return { min: 0, max: 100, title: { display: true, text: 'Puntaje' } };
    }
    const poor = state.config.thresholds[metricKey]?.poor?.min;
    const reference = isNumber(poor) ? (poor / 1000) * 1.15 : 0;
    return {
      min: 0,
      suggestedMax: Math.max(reference, (maxValue || 0) * 1.1),
      title: { display: true, text: 'Segundos' },
      ticks: { callback: (value) => `${Number(value).toLocaleString(LOCALE)} s` },
    };
  }

  function tooltipValue(metricKey, displayValue) {
    if (displayValue === null || displayValue === undefined) return '—';
    return getMetric(metricKey).unit === 'score' ? formatScore(displayValue) : formatSeconds(displayValue * 1000);
  }

  function renderComparisonChart(comparisons, metricKey) {
    const values = { mobile: [], desktop: [] };
    const levels = { mobile: [], desktop: [] };
    for (const { mobile, desktop } of comparisons) {
      values.mobile.push(mobile ? toDisplayValue(metricKey, mobile[metricKey]) : null);
      values.desktop.push(desktop ? toDisplayValue(metricKey, desktop[metricKey]) : null);
      levels.mobile.push(mobile ? mobile.levels[metricKey] : null);
      levels.desktop.push(desktop ? desktop.levels[metricKey] : null);
    }
    const maxValue = Math.max(0, ...values.mobile.filter(isNumber), ...values.desktop.filter(isNumber));

    const dataset = (device) => ({
      label: deviceName(device),
      data: values[device],
      backgroundColor: `${DEVICE_COLORS[device]}cc`,
      borderColor: values[device].map((_, i) => levelColor(levels[device][i])),
      borderWidth: { top: 4, left: 0, right: 0, bottom: 0 },
      borderRadius: 6,
      borderSkipped: false,
      maxBarThickness: 56,
    });

    replaceChart('comparison', 'comparison-chart', {
      type: 'bar',
      data: { labels: comparisons.map((c) => c.page.name), datasets: [dataset('mobile'), dataset('desktop')] },
      plugins: [thresholdBandsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: yAxisFor(metricKey, maxValue), x: { grid: { display: false } } },
        plugins: {
          thresholdBands: { bands: thresholdBands(metricKey, state.config.thresholds) },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const device = ctx.datasetIndex === 0 ? 'mobile' : 'desktop';
                const level = levels[device][ctx.dataIndex];
                return ` ${ctx.dataset.label}: ${tooltipValue(metricKey, ctx.raw)} · ${levelLabel(level, state.config.labels)}`;
              },
            },
          },
        },
      },
    });
  }

  function renderHistoryChart(records, metricKey) {
    const series = new Map();
    for (const record of records) {
      const key = seriesKey(record);
      if (!series.has(key)) series.set(key, []);
      series.get(key).push(record);
    }

    const pageOrder = listPages(state.records, state.config).map((p) => p.id);
    let maxValue = 0;

    const datasets = [...series.entries()].map(([, items]) => {
      const first = items[0];
      const color = PAGE_COLORS[pageOrder.indexOf(first.pageId) % PAGE_COLORS.length] || PAGE_COLORS[0];
      const points = items.map((record) => {
        const y = toDisplayValue(metricKey, record[metricKey]);
        if (isNumber(y)) maxValue = Math.max(maxValue, y);
        return { x: record.time, y, record };
      });
      const level = (ctx) => ctx.raw && ctx.raw.record ? ctx.raw.record.levels[metricKey] : null;
      return {
        label: `${first.pageName} · ${deviceName(first.deviceProfile)}`,
        data: points,
        borderColor: color,
        backgroundColor: color,
        borderDash: first.deviceProfile === 'desktop' ? [6, 4] : [],
        borderWidth: 2,
        tension: 0.3,
        spanGaps: false,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointStyle: (ctx) => (LEVEL_META[level(ctx)] || LEVEL_META.none).pointStyle,
        pointBackgroundColor: (ctx) => levelColor(level(ctx)),
        pointBorderColor: color,
        pointBorderWidth: 1.5,
      };
    });

    replaceChart('history', 'history-chart', {
      type: 'line',
      data: { datasets },
      plugins: [thresholdBandsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: {
            type: 'linear',
            ticks: { maxTicksLimit: 8, callback: (value) => formatDate(value, { time: false }) },
            grid: { display: false },
          },
          y: yAxisFor(metricKey, maxValue),
        },
        plugins: {
          thresholdBands: { bands: thresholdBands(metricKey, state.config.thresholds) },
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              title: (items) => (items[0] ? formatDate(items[0].raw.x) : ''),
              label: (ctx) => {
                const record = ctx.raw.record;
                const label = record.isError ? 'Error' : levelLabel(record.levels[metricKey], state.config.labels);
                return ` ${ctx.dataset.label}: ${tooltipValue(metricKey, ctx.raw.y)} · ${label}`;
              },
              afterLabel: (ctx) => ` runId: ${ctx.raw.record.runId}`,
            },
          },
        },
      },
    });
  }

  /* ======================================================================
   * API pública
   * ==================================================================== */

  return {
    bootstrap,
    // Lógica pura (pruebas unitarias)
    METRICS,
    DEFAULT_CONFIG,
    DEFAULT_FILTERS,
    escapeHtml,
    formatSeconds,
    formatScore,
    formatMetric,
    formatDiff,
    formatDate,
    toDisplayValue,
    toLocalDateString,
    classifyValue,
    levelOf,
    thresholdBands,
    normalizeRecords,
    groupRuns,
    latestByPageAndDevice,
    linkPrevious,
    compareDevices,
    trend,
    summarizeLevels,
    filterRecords,
    parseFilters,
    serializeFilters,
    listPages,
  };
});
