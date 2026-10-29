# Automatización de métricas web — Portal de Pagos UAM

Proyecto académico para medir y reportar métricas de rendimiento web  
(FCP, LCP, Speed Index y Performance) de páginas institucionales de la Universidad  
Autónoma de Manizales, usando **Cypress** y **Lighthouse** con ejecución programada.

> Estado: recolección local de métricas implementada. El scheduler y el módulo
> de reporte están pendientes (ver comentarios `// TODO`).

## Integrantes y URLs asignadas


| Integrante          | Página                       | URL                                                                                                                                                          | Usuario de github |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Juan Diego Pinilla  | Portal de Pagos UAM (Inicio) | [https://intrauam.autonoma.edu.co/ponline/](https://intrauam.autonoma.edu.co/ponline/)                                                                       | JDPinillaa       |
| Ever Santiago Uribe | Pago en Línea                | [https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/pagoPublico](https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/pagoPublico)                       | everSantiagoU       |
| Camilo Henao        | Pago por comprobante         | [https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/adjuntoPago?tipoPago=M](https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/adjuntoPago?tipoPago=M) | milomnz       |


## Requisitos

- Node.js >= 22.19
- npm
- Google Chrome (requerido por Lighthouse)
- Git

## Instalación

```bash
git clone https://github.com/JDPinillaa/automatizacion-metricas-web.git
cd automatizacion-metricas-web
npm install
```

## Ejecución


| Comando                | Descripción                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `npm run cypress:open` | Abre Cypress en modo interactivo.                             |
| `npm run test:cypress` | Ejecuta la suite E2E en modo headless.                        |
| `npm run test:metrics` | Ejecuta solo la suite de métricas con Lighthouse.             |
| `npm run test:unit`    | Ejecuta las pruebas unitarias de normalización y umbrales.    |
| `npm run scheduler`    | Inicia el runner de jobs programados (`scheduler/runner.js`). |


Notas:

- Los jobs de `config/schedule.js` están deshabilitados (`enabled: false`) por defecto.
- La tercera URL incluye el query string `?tipoPago=M`, que debe conservarse.

## Métricas con Lighthouse local

La suite evalúa cada página configurada en los perfiles `mobile` y `desktop`:

```bash
npm run test:metrics
```

También se pueden filtrar páginas, dispositivos y el identificador de la corrida:

```bash
npx cypress run --spec cypress/e2e/metrics.cy.js \
  --expose 'pages=portal-pagos;pago-publico,devices=mobile,runId=2026-11-01T11:00:00Z'
```

En `pages`, separa varias páginas con punto y coma. Cypress usa la coma para separar las opciones de `--expose`.

Características de la medición:

- Lighthouse se ejecuta localmente en Chrome headless.
- Emulación móvil: 412x823 (Moto G Power), con throttling simulado.
- Emulación de escritorio: 1350x940.
- Los resultados se guardan en `cypress/fixtures/lighthouse-metrics.json`.
- Cada medición incluye clasificación “Bueno / Por mejorar / Deficiente”.
- Al ser una medición local, los valores pueden variar entre equipos y redes.
- Se puede indicar una instalación de Chrome con `CHROME_PATH` si no se detecta automáticamente.
- Un reintento con el mismo `runId`, página y dispositivo reemplaza el registro previo (`recordId`), sin duplicar historial.

### Esquema del registro

Cada fila de `cypress/fixtures/lighthouse-metrics.json` cumple este contrato:

| Campo                     | Tipo            | Descripción                                                        |
| ------------------------- | --------------- | ------------------------------------------------------------------ |
| `recordId`                | string          | Clave única: `runId:source:pageId:deviceProfile`.                  |
| `runId`                   | string          | Identificador de la corrida.                                       |
| `source`                  | string          | Origen de la medición (`lighthouse-local`).                        |
| `pageId`                  | string          | Id de la página en `config/pages.js`.                              |
| `deviceProfile`           | string          | `mobile` o `desktop`.                                              |
| `deviceLabel`             | string          | Nombre legible del dispositivo.                                    |
| `screenEmulation`         | object          | Emulación aplicada: `mobile`, `width`, `height`, `deviceScaleFactor`, `disabled`. |
| `formFactor`              | string          | `mobile` o `desktop`.                                              |
| `url`                     | string          | URL auditada (conserva query string).                              |
| `finalUrl`                | string          | URL final tras redirecciones.                                      |
| `timestamp`               | string          | Fecha ISO 8601 (`fetchTime` de Lighthouse).                        |
| `firstContentfulPaint`    | number \| null  | FCP en milisegundos.                                               |
| `largestContentfulPaint`  | number \| null  | LCP en milisegundos.                                               |
| `speedIndex`              | number \| null  | Speed Index en milisegundos.                                       |
| `performance`             | number \| null  | Puntaje de Performance (0-100).                                    |
| `lighthouseVersion`       | string \| null  | Versión de Lighthouse usada.                                       |
| `status`                  | string          | `success` o `error`.                                               |
| `error`                   | string \| null  | Mensaje de error cuando `status` es `error`.                       |
| `*Status`                 | string \| null  | Clasificación: `Bueno`, `Por mejorar`, `Deficiente`.               |

### Umbrales de clasificación

Se definen en `config/thresholds.js` con rangos `[min, max)`.

| Métrica                    | Bueno          | Por mejorar     | Deficiente |
| -------------------------- | -------------- | --------------- | ---------- |
| `firstContentfulPaint`     | < 1800 ms      | 1800-2999 ms    | >= 3000 ms |
| `largestContentfulPaint`   | < 2500 ms      | 2500-3999 ms    | >= 4000 ms |
| `speedIndex`               | < 3400 ms      | 3400-5799 ms    | >= 5800 ms |
| `performance`              | >= 90          | 50-89           | < 50       |

## Estructura del proyecto

```text
config/        Configuración de páginas, dispositivos, jobs y umbrales
cypress/       Suite E2E, fixtures y soporte
lib/           Motor Lighthouse, normalización, clasificación y persistencia
scheduler/     Runner de ejecución programada (node-cron)
tests/         Pruebas unitarias con node:test
```