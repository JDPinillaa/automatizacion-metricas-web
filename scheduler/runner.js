const path = require('node:path');
const { spawn } = require('node:child_process');
const cron = require('node-cron');
const jobs = require('../config/schedule');
const pages = require('../config/pages');
const devices = require('../config/devices');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CYPRESS_BIN = path.join(PROJECT_ROOT, 'node_modules', 'cypress', 'bin', 'cypress');
const METRICS_SPEC = 'cypress/e2e/metrics.cy.js';
const FREQUENCIES = ['once', 'daily', 'weekly'];
const DEFAULT_TIMEZONE = 'America/Bogota';

/** Tareas de node-cron registradas por startScheduler(). @type {Map<string, import('node-cron').ScheduledTask>} */
const activeTasks = new Map();

/** Proceso de Cypress en curso (si existe), para poder detenerlo al cerrar. */
let currentChild = null;

/**
 * Cola global: garantiza que solo se ejecute un job a la vez. Dos corridas de
 * Lighthouse en paralelo distorsionan las métricas y compiten por el JSON.
 */
let queue = Promise.resolve();

/**
 * Escribe una línea de log con marca de tiempo ISO.
 *
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 */
function log(level, message) {
  const line = `[${new Date().toISOString()}] [scheduler] ${message}`;
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

/**
 * Indica si una zona horaria IANA es válida para Intl.
 *
 * @param {string} timezone
 * @returns {boolean}
 */
function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Descompone una fecha en sus partes locales para una zona horaria.
 *
 * @param {Date} date
 * @param {string} timezone
 * @returns {{ date: string, time: string, dateTime: string }} p. ej. { date: '2026-11-01', time: '06:00', dateTime: '2026-11-01T06:00' }
 */
function getZonedParts(date, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value])
  );

  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const localTime = `${parts.hour}:${parts.minute}`;
  return { date: localDate, time: localTime, dateTime: `${localDate}T${localTime}` };
}

/**
 * Valida una fecha de calendario YYYY-MM-DD (incluye días inexistentes como 2026-02-30).
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Valida una hora HH:mm en formato 24 h.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Devuelve el día de la semana (0 = domingo) de una fecha YYYY-MM-DD.
 * Es independiente de la zona horaria porque es una fecha de calendario.
 *
 * @param {string} isoDate
 * @returns {number}
 */
function getWeekday(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Construye la expresión cron (5 campos) de un job.
 *
 * - once:   minuto hora día mes *   (el año se controla en shouldRunOn)
 * - daily:  minuto hora *   *   *
 * - weekly: minuto hora *   *   díaSemana (el de startDate)
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @returns {string}
 */
function buildCronExpression(job) {
  const [hour, minute] = job.time.split(':').map(Number);
  const [, month, day] = job.startDate.split('-').map(Number);

  switch (job.frequency) {
    case 'once':
      return `${minute} ${hour} ${day} ${month} *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${getWeekday(job.startDate)}`;
    default:
      throw new Error(`Frecuencia no soportada: ${job.frequency}`);
  }
}

/**
 * Valida un job y devuelve la lista de errores encontrados.
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @returns {string[]}
 */
function validateJob(job) {
  const errors = [];

  if (!job || typeof job !== 'object') {
    return ['El job debe ser un objeto.'];
  }
  if (typeof job.id !== 'string' || !job.id.trim()) {
    errors.push('`id` es obligatorio.');
  }
  if (!FREQUENCIES.includes(job.frequency)) {
    errors.push(`\`frequency\` debe ser uno de: ${FREQUENCIES.join(', ')}.`);
  }
  if (!isValidDate(job.startDate)) {
    errors.push('`startDate` debe tener formato YYYY-MM-DD y ser una fecha válida.');
  }
  if (!isValidTime(job.time)) {
    errors.push('`time` debe tener formato HH:mm (24 h).');
  }
  if (!isValidTimezone(job.timezone || DEFAULT_TIMEZONE)) {
    errors.push(`\`timezone\` no es una zona IANA válida: ${job.timezone}.`);
  }
  if (!devices[job.deviceProfile]) {
    errors.push(`\`deviceProfile\` no existe en config/devices.js: ${job.deviceProfile}.`);
  }
  if (!Array.isArray(job.pages) || job.pages.length === 0) {
    errors.push('`pages` debe ser una lista no vacía de ids.');
  } else {
    const unknown = job.pages.filter((id) => !pages.some((page) => page.id === id));
    if (unknown.length > 0) {
      errors.push(`\`pages\` contiene ids no configurados: ${unknown.join(', ')}.`);
    }
  }

  if (errors.length === 0 && !cron.validate(buildCronExpression(job))) {
    errors.push(`Expresión cron inválida: ${buildCronExpression(job)}.`);
  }

  return errors;
}

/**
 * Decide si un disparo de cron debe ejecutar el job, según startDate
 * (y el año exacto en el caso de `once`).
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @param {Date} date Momento del disparo.
 * @returns {boolean}
 */
function shouldRunOn(job, date) {
  const local = getZonedParts(date, job.timezone || DEFAULT_TIMEZONE);
  if (job.frequency === 'once') {
    return local.date === job.startDate;
  }
  return local.date >= job.startDate;
}

/**
 * Indica si un job `once` ya pasó (su fecha y hora local son anteriores a `now`).
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @param {Date} [now]
 * @returns {boolean}
 */
function isOnceExpired(job, now = new Date()) {
  const local = getZonedParts(now, job.timezone || DEFAULT_TIMEZONE);
  return job.frequency === 'once' && local.dateTime > `${job.startDate}T${job.time}`;
}

/**
 * Calcula la próxima ejecución efectiva (respetando startDate) de una tarea.
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @param {import('node-cron').ScheduledTask} task
 * @returns {Date|null}
 */
function getNextEffectiveRun(job, task) {
  const candidates = task.getNextRuns(job.frequency === 'daily' ? 800 : 120);
  return candidates.find((date) => shouldRunOn(job, date)) || null;
}

/**
 * Formatea una fecha en la zona horaria del job (para logs).
 *
 * @param {Date|null} date
 * @param {string} timezone
 * @returns {string}
 */
function formatInZone(date, timezone) {
  if (!date) {
    return 'sin próximas ejecuciones';
  }
  const { date: d, time } = getZonedParts(date, timezone);
  return `${d} ${time} (${timezone})`;
}

/**
 * Lanza `cypress run` sobre la suite de métricas con las páginas y el
 * dispositivo del job. La propia suite persiste los resultados en
 * cypress/fixtures/lighthouse-metrics.json (task `saveMetrics`).
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @param {{ runId?: string }} [options]
 * @returns {Promise<number>} Código de salida de Cypress.
 */
function spawnCypress(job, { runId } = {}) {
  const effectiveRunId = runId || `${job.id}@${new Date().toISOString()}`;
  // En --expose, Cypress separa opciones con comas; las páginas van con `;`.
  const expose = [
    `pages=${job.pages.join(';')}`,
    `devices=${job.deviceProfile}`,
    `runId=${effectiveRunId}`,
  ].join(',');

  const args = [CYPRESS_BIN, 'run', '--spec', METRICS_SPEC, '--expose', expose];

  log('info', `Job "${job.id}" iniciado (runId=${effectiveRunId}).`);

  return new Promise((resolve) => {
    // Se invoca el bin de Cypress con el mismo Node, sin shell: evita
    // problemas de comillas con `;` y funciona igual en Windows y Linux.
    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    currentChild = child;

    child.on('error', (error) => {
      currentChild = null;
      log('error', `No se pudo iniciar Cypress para "${job.id}": ${error.message}`);
      resolve(1);
    });

    child.on('exit', (code, signal) => {
      currentChild = null;
      const exitCode = code ?? 1;
      if (exitCode === 0) {
        log('info', `Job "${job.id}" finalizado correctamente.`);
      } else {
        log(
          'warn',
          `Job "${job.id}" finalizó con código ${exitCode}${signal ? ` (señal ${signal})` : ''}. ` +
            'Los registros con status "error" quedan guardados en el historial.'
        );
      }
      resolve(exitCode);
    });
  });
}

/**
 * Ejecuta un job programado. Las ejecuciones se encolan para que nunca
 * corran dos jobs simultáneamente.
 *
 * @param {import('../config/schedule').ScheduleJob} job
 * @param {{ runId?: string }} [options]
 * @returns {Promise<number>} Código de salida de Cypress.
 */
function runJob(job, options = {}) {
  const errors = validateJob(job);
  if (errors.length > 0) {
    return Promise.reject(new Error(`Job "${job && job.id}" inválido: ${errors.join(' ')}`));
  }

  const run = queue.then(() => spawnCypress(job, options));
  // La cola nunca debe quedar rechazada, aunque falle un job.
  queue = run.catch(() => {});
  return run;
}

/**
 * Registra en node-cron los jobs habilitados de config/schedule.js.
 *
 * @param {import('../config/schedule').ScheduleJob[]} [jobList]
 * @param {{ execute?: (job: import('../config/schedule').ScheduleJob) => Promise<unknown>, now?: Date }} [options]
 *   `execute` permite inyectar otra acción (útil en pruebas).
 * @returns {Map<string, import('node-cron').ScheduledTask>} Tareas registradas.
 */
function startScheduler(jobList = jobs, { execute = runJob, now = new Date() } = {}) {
  const ids = new Set();

  for (const rawJob of jobList) {
    const job = { timezone: DEFAULT_TIMEZONE, ...rawJob };

    if (!job.enabled) {
      log('info', `Job "${job.id}" deshabilitado; se omite.`);
      continue;
    }

    const errors = validateJob(job);
    if (ids.has(job.id)) {
      errors.push('`id` duplicado.');
    }
    if (errors.length > 0) {
      log('error', `Job "${job.id}" inválido, no se registra: ${errors.join(' ')}`);
      continue;
    }
    ids.add(job.id);

    if (isOnceExpired(job, now)) {
      log(
        'warn',
        `Job "${job.id}" (once) programado para ${job.startDate} ${job.time} ya pasó; se omite.`
      );
      continue;
    }

    const expression = buildCronExpression(job);
    const task = cron.schedule(
      expression,
      async ({ date }) => {
        const firedAt = date || new Date();
        if (!shouldRunOn(job, firedAt)) {
          return;
        }

        try {
          await execute(job);
        } catch (error) {
          log('error', `Error ejecutando "${job.id}": ${error.message}`);
        } finally {
          if (job.frequency === 'once') {
            activeTasks.delete(job.id);
            await task.destroy();
            log('info', `Job "${job.id}" (once) completado; tarea eliminada.`);
          }
        }
      },
      { name: job.id, timezone: job.timezone, noOverlap: true }
    );

    activeTasks.set(job.id, task);
    log(
      'info',
      `Job "${job.id}" registrado: ${job.frequency}, cron "${expression}", ` +
        `${job.deviceProfile} → [${job.pages.join(', ')}]. ` +
        `Próxima ejecución: ${formatInZone(getNextEffectiveRun(job, task), job.timezone)}.`
    );
  }

  if (activeTasks.size === 0) {
    log(
      'warn',
      'No hay jobs activos. Habilita alguno con `enabled: true` en config/schedule.js.'
    );
  }

  return activeTasks;
}

/**
 * Detiene las tareas programadas activas y, si hay una corrida de Cypress
 * en curso, la termina.
 *
 * @returns {Promise<void>}
 */
async function stopScheduler() {
  for (const [id, task] of activeTasks) {
    await task.destroy();
    activeTasks.delete(id);
  }

  if (currentChild && !currentChild.killed) {
    log('warn', 'Deteniendo la corrida de Cypress en curso.');
    currentChild.kill();
  }
}

/**
 * Imprime la próxima ejecución efectiva de cada job habilitado sin registrarlo.
 *
 * @param {import('../config/schedule').ScheduleJob[]} [jobList]
 */
function listJobs(jobList = jobs) {
  for (const rawJob of jobList) {
    const job = { timezone: DEFAULT_TIMEZONE, ...rawJob };
    const errors = validateJob(job);
    const state = job.enabled ? 'habilitado' : 'deshabilitado';

    if (errors.length > 0) {
      log('error', `${job.id} [${state}] inválido: ${errors.join(' ')}`);
      continue;
    }
    if (isOnceExpired(job)) {
      log('info', `${job.id} [${state}] once ${job.startDate} ${job.time}: ya pasó.`);
      continue;
    }

    const task = cron.createTask(buildCronExpression(job), () => {}, { timezone: job.timezone });
    log(
      'info',
      `${job.id} [${state}] ${job.frequency} "${task.getPattern()}" → ` +
        `${formatInZone(getNextEffectiveRun(job, task), job.timezone)}`
    );
    task.destroy();
  }
}

module.exports = {
  runJob,
  startScheduler,
  stopScheduler,
  listJobs,
  // Utilidades exportadas para pruebas unitarias.
  buildCronExpression,
  validateJob,
  shouldRunOn,
  isOnceExpired,
  getZonedParts,
  getWeekday,
};

if (require.main === module) {
  const [command, argument] = process.argv.slice(2);

  if (command === '--list') {
    listJobs();
  } else if (command === '--run') {
    // Ejecución inmediata de un job (ignora `enabled`, fecha y hora).
    const job = jobs.find((item) => item.id === argument);
    if (!job) {
      log('error', `No existe el job "${argument}". Ids: ${jobs.map((j) => j.id).join(', ')}`);
      process.exit(1);
    }
    runJob({ timezone: DEFAULT_TIMEZONE, ...job })
      .then((code) => process.exit(code))
      .catch((error) => {
        log('error', error.message);
        process.exit(1);
      });
  } else {
    log('info', `Iniciando scheduler (pid ${process.pid}).`);
    startScheduler();

    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      log('info', `Señal ${signal} recibida; deteniendo scheduler.`);
      await stopScheduler();
      process.exit(0);
    };

    ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach((signal) => {
      process.on(signal, () => shutdown(signal));
    });

    process.on('unhandledRejection', (reason) => {
      log('error', `Promesa rechazada sin manejar: ${reason && reason.stack ? reason.stack : reason}`);
    });
  }
}
