const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCronExpression,
  validateJob,
  shouldRunOn,
  isOnceExpired,
  getZonedParts,
  getWeekday,
  startScheduler,
  stopScheduler,
} = require('../scheduler/runner');

/** Job base válido; cada prueba sobrescribe lo que necesita. */
function job(overrides = {}) {
  return {
    id: 'test-job',
    enabled: true,
    startDate: '2026-11-01',
    time: '06:00',
    timezone: 'America/Bogota',
    frequency: 'daily',
    deviceProfile: 'mobile',
    pages: ['portal-pagos'],
    ...overrides,
  };
}

test('construye la expresión cron según la frecuencia', () => {
  assert.equal(buildCronExpression(job({ frequency: 'daily' })), '0 6 * * *');
  // 2026-11-01 es domingo (0).
  assert.equal(buildCronExpression(job({ frequency: 'weekly' })), '0 6 * * 0');
  assert.equal(
    buildCronExpression(job({ frequency: 'once', startDate: '2026-12-24', time: '18:30' })),
    '30 18 24 12 *'
  );
});

test('calcula el día de la semana de una fecha de calendario', () => {
  assert.equal(getWeekday('2026-11-01'), 0);
  assert.equal(getWeekday('2026-11-04'), 3);
});

test('convierte instantes UTC a hora local de America/Bogota (UTC-5)', () => {
  const parts = getZonedParts(new Date('2026-11-01T11:00:00Z'), 'America/Bogota');
  assert.deepEqual(parts, { date: '2026-11-01', time: '06:00', dateTime: '2026-11-01T06:00' });

  // 02:00 UTC del día 2 sigue siendo el día 1 en Bogotá.
  assert.equal(getZonedParts(new Date('2026-11-02T02:00:00Z'), 'America/Bogota').date, '2026-11-01');
});

test('valida un job correcto sin errores', () => {
  assert.deepEqual(validateJob(job()), []);
});

test('reporta errores de configuración', () => {
  const errors = validateJob(
    job({
      frequency: 'monthly',
      startDate: '2026-02-30',
      time: '25:00',
      timezone: 'Mars/Olympus',
      deviceProfile: 'tablet',
      pages: ['no-existe'],
    })
  );

  assert.equal(errors.length, 6);
});

test('respeta startDate en la zona horaria del job', () => {
  const daily = job({ frequency: 'daily' });
  // 2026-10-31 06:00 en Bogotá: antes del inicio.
  assert.equal(shouldRunOn(daily, new Date('2026-10-31T11:00:00Z')), false);
  // 2026-11-01 06:00 en Bogotá: primer día válido.
  assert.equal(shouldRunOn(daily, new Date('2026-11-01T11:00:00Z')), true);
  assert.equal(shouldRunOn(daily, new Date('2026-11-15T11:00:00Z')), true);
});

test('once solo se ejecuta en el año de startDate', () => {
  const once = job({ frequency: 'once' });
  assert.equal(shouldRunOn(once, new Date('2026-11-01T11:00:00Z')), true);
  assert.equal(shouldRunOn(once, new Date('2027-11-01T11:00:00Z')), false);
});

test('detecta jobs once vencidos', () => {
  const once = job({ frequency: 'once' });
  assert.equal(isOnceExpired(once, new Date('2026-11-01T10:59:00Z')), false);
  assert.equal(isOnceExpired(once, new Date('2026-11-01T11:01:00Z')), true);
});

test('startScheduler registra solo jobs habilitados y válidos', async (t) => {
  t.after(() => stopScheduler());

  const tasks = startScheduler(
    [
      job({ id: 'activo' }),
      job({ id: 'apagado', enabled: false }),
      job({ id: 'invalido', time: 'mañana' }),
      job({ id: 'vencido', frequency: 'once', startDate: '2026-01-01' }),
    ],
    { execute: async () => {}, now: new Date('2026-10-29T12:00:00Z') }
  );

  assert.deepEqual([...tasks.keys()], ['activo']);
});
