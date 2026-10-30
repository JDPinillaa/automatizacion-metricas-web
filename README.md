# Automatización de métricas web — Portal de Pagos UAM

Proyecto académico para medir y reportar métricas de rendimiento web  
(FCP, LCP, Speed Index y Performance) de páginas institucionales de la Universidad  
Autónoma de Manizales, usando **Cypress** y **Lighthouse** con ejecución programada.

> Estado: recolección local de métricas, scheduler e informe web (`report/`) implementados.

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
| `npm run test:unit`    | Ejecuta las pruebas unitarias (normalización, umbrales, scheduler, reporte). |
| `npm run scheduler`    | Inicia el runner de jobs programados (`scheduler/runner.js`). |
| `npm run scheduler:list` | Valida los jobs y muestra su próxima ejecución, sin ejecutarlos. |
| `npm run scheduler:run -- <jobId>` | Ejecuta un job inmediatamente y termina. |
| `npm run report`       | Inicia el servidor del informe web en `http://localhost:4173`. |


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

## Ejecución programada (scheduler)

`scheduler/runner.js` lee `config/schedule.js`, registra en `node-cron` los jobs con
`enabled: true` y, en cada disparo, lanza `cypress run` sobre la suite de métricas con
las páginas y el dispositivo del job. Los resultados se guardan en el mismo historial
(`cypress/fixtures/lighthouse-metrics.json`) con `runId = <jobId>@<fecha ISO>`.

### Configuración de un job

```js
{
  id: 'mobile-daily',
  enabled: true,               // false = no se registra
  startDate: '2026-11-01',     // YYYY-MM-DD, interpretada en `timezone`
  time: '06:00',               // HH:mm, 24 h, hora local de `timezone`
  timezone: 'America/Bogota',  // IANA; por defecto America/Bogota
  frequency: 'daily',          // 'once' | 'daily' | 'weekly'
  deviceProfile: 'mobile',     // clave de config/devices.js
  pages: ['portal-pagos'],     // ids de config/pages.js
}
```

| Frecuencia | Comportamiento                                                                 |
| ---------- | ------------------------------------------------------------------------------ |
| `once`     | Una sola vez en `startDate` a `time`. Si al iniciar ya pasó, se omite con aviso. |
| `daily`    | Todos los días a `time`, desde `startDate` (inclusive).                        |
| `weekly`   | Cada semana, el mismo día de la semana que `startDate`, a `time`.              |

Reglas del runner:

- Valida cada job (fecha, hora, zona, dispositivo, páginas, `id` duplicado); un job inválido
  se reporta en el log y no se registra, sin detener los demás.
- Los jobs se ejecutan **de a uno**: si dos coinciden, el segundo espera al primero
  (Lighthouse en paralelo distorsiona las métricas).
- Si Cypress falla, se registra en el log y el scheduler sigue activo.
- `Ctrl+C` / `SIGTERM` detiene las tareas y la corrida de Cypress en curso.

Flujo recomendado:

```bash
npm run scheduler:list                 # 1. revisar configuración y próximas ejecuciones
npm run scheduler:run -- mobile-daily  # 2. probar un job de inmediato
npm run scheduler                      # 3. dejarlo en ejecución
```

> En PowerShell, si `npm` falla por la política de ejecución de scripts, usa `npm.cmd`.

### Mantener el scheduler activo

`node-cron` corre **dentro del proceso de Node**: si la terminal se cierra, el equipo se
apaga o entra en suspensión, no hay ejecuciones, y las perdidas **no se recuperan** al
volver. Por eso el proceso debe quedar supervisado. Elige una opción:

#### Opción A — pm2 (Windows, Linux, macOS)

```bash
npm install -g pm2
pm2 start scheduler/runner.js --name metricas-uam --time
pm2 logs metricas-uam      # ver logs en vivo
pm2 status                 # estado
pm2 restart metricas-uam   # aplicar cambios de config/schedule.js
pm2 stop metricas-uam      # detener
pm2 save                   # recordar procesos para restaurarlos
```

Arranque automático: en Linux/macOS ejecuta `pm2 startup` y sigue la instrucción que imprime.
En Windows, `pm2 startup` no está soportado; usa el paquete `pm2-installer` o combina
`pm2 resurrect` con la opción B.

#### Opción B — Programador de tareas de Windows

Inicia el scheduler al encender el equipo y lo reinicia si se cae:

```powershell
$dir = "C:\ruta\a\automatizacion-metricas-web"
New-Item -ItemType Directory -Force "$dir\logs" | Out-Null

$action  = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c node scheduler\runner.js >> logs\scheduler.log 2>&1" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -WakeToRun

Register-ScheduledTask -TaskName "MetricasUAM-Scheduler" -Action $action -Trigger $trigger -Settings $settings
```

- `AtLogOn` permite que Chrome/Cypress usen la sesión del usuario. `Start-ScheduledTask` /
  `Stop-ScheduledTask -TaskName MetricasUAM-Scheduler` lo controlan manualmente.
- Los logs quedan en `logs/scheduler.log` (ignorado por git).
- En *Configuración > Sistema > Energía*, evita que el equipo se suspenda en los horarios
  de los jobs.

#### Opción C — systemd (servidor Linux)

```ini
# /etc/systemd/system/metricas-uam.service
[Unit]
Description=Scheduler de métricas web UAM
After=network-online.target

[Service]
WorkingDirectory=/opt/automatizacion-metricas-web
ExecStart=/usr/bin/node scheduler/runner.js
Restart=always
RestartSec=30
User=metricas
Environment=TZ=America/Bogota

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now metricas-uam
journalctl -u metricas-uam -f
```

En el servidor se requiere Chrome y las dependencias de sistema de Cypress
(ver la documentación de Cypress para Linux).

#### Recomendaciones

- Tras editar `config/schedule.js`, **reinicia** el proceso; la configuración se lee al iniciar.
- La zona horaria del job no depende de la del sistema: `America/Bogota` se aplica siempre.
- Verifica periódicamente el log y el historial JSON para detectar corridas con `status: "error"`.

## Análisis y recomendaciones de rendimiento

A partir de las mediciones recolectadas en `cypress/fixtures/lighthouse-metrics.json` sobre el entorno de producción institucional (perfiles `mobile` y `desktop`), se presenta el diagnóstico comparativo y la hoja de ruta de optimización.

### 1. Resumen de resultados por página

| Página | Dispositivo | FCP | LCP | Speed Index | Performance | Diagnóstico |
| ------ | ----------- | --- | --- | ----------- | ----------- | ----------- |
| **Portal de Pagos (Inicio)** | Escritorio | **0,91 s** (Bueno) | **1,08 s** (Bueno) | **1,20 s** (Bueno) | **97** (Bueno) | **Mejor rendimiento general** |
| | Móvil | 2,52 s (Por mejorar) | 3,99 s (Por mejorar) | 2,81 s (Bueno) | 84 (Por mejorar) | Aceptable, penalizado por red móvil |
| **Pago Público en Línea** | Escritorio | **0,87 s** (Bueno) | **1,17 s** (Bueno) | **1,04 s** (Bueno) | **96** (Bueno) | Renderizado inicial rápido |
| | Móvil | 2,52 s (Por mejorar) | 4,67 s (Deficiente) | 3,61 s (Por mejorar) | 79 (Por mejorar) | LCP crítico en dispositivos móviles |
| **Adjunto de Pago (tipo M)** | Escritorio | 1,13 s (Bueno) | 1,30 s (Bueno) | 1,13 s (Bueno) | 85 (Por mejorar) | Estable en desktop |
| | Móvil | **5,00 s** (Deficiente) | **5,59 s** (Deficiente) | **5,00 s** (Deficiente) | **67** (Por mejorar) | **Página más crítica del portal** |

---

### 2. Comparativa: Móvil vs. Escritorio

1. **Brecha de velocidad (3.5x a 4.5x más lento en móvil):**
   - En **escritorio**, todas las páginas alcanzan puntajes de Performance entre **85 y 97**, con FCP inferior a 1,15 s y LCP bajo 1,30 s (zona **Bueno**).
   - En **móvil**, ninguna página logra clasificar en la zona **Bueno** de Performance (rango de **67 a 84**). El tiempo de espera antes de ver el primer elemento gráfico (FCP) sube de menos de 1 segundo a **2,5 – 5,0 segundos**.
2. **Causa técnica del desfase:**
   - La emulación móvil aplica estrangulamiento de CPU (4x slowdown) y red simulada (`mobileSlow4G`). La caída abrupta en métricas indica que las páginas tienen una alta **dependencia de ejecución de JavaScript en el cliente** y hojas de estilo que bloquean el renderizado inicial (*render-blocking resources*), afectando desproporcionadamente a usuarios en teléfonos de gama media o con redes móviles inestables.

---

### 3. Diagnóstico: Mejor y Peor Página

- **🏆 Mejor página: Portal de Pagos UAM (Inicio)**
  - Es la página más ligera y optimizada del conjunto. En escritorio roza la perfección (97/100) y en móvil mantiene un Speed Index saludable de 2,81 s. Su estructura inicial permite un pintado progresivo sin bloqueos severos.
- **⚠️ Peor página: Adjunto de Pago (`?tipoPago=M`)**
  - Es el cuello de botella más grave del portal. En móvil, el usuario experimenta una **pantalla en blanco durante 5,0 segundos (FCP)** y debe aguardar **5,59 segundos para ver el contenido principal (LCP)**. Esto incrementa significativamente la tasa de rebote y la frustración en trámites de pago con soporte de comprobante.

---

### 4. Recomendaciones técnicas y mejoras sugeridas

#### A. Reducción de recursos que bloquean el renderizado (Impacto directo en FCP)
- **Extraer el Critical CSS:** Separar e incrustar en línea (`<style>` en el `<head>`) solo el CSS indispensable para el primer pliegue de la pantalla; cargar el resto de estilos de forma asíncrona (`rel="preload"` o `media="print"` con cambio a `all`).
- **Atributos `defer` o `async` en scripts:** Revisar que las librerías de interfaz, utilidades y analítica que no sean indispensables para pintar el encabezado y formulario principal no bloqueen el hilo principal de renderizado.

#### B. Optimización del Largest Contentful Paint (Impacto directo en LCP)
- **Precarga del recurso LCP:** Identificar si el bloque principal es un logotipo, banner o tipografía institucional y declararlo con `<link rel="preload" as="image" href="...">` o `<link rel="preload" as="font" ... crossorigin>`.
- **Compresión moderna de imágenes:** Convertir recursos gráficos existentes (PNG, JPG) al formato **WebP** o **AVIF**, utilizando elementos `<picture>` con tamaños adaptados a pantallas móviles para no transferir imágenes de escritorio en resoluciones de 412 px.

#### C. Acciones específicas para la página "Adjunto de Pago"
- **Carga diferida del módulo de carga de archivos (*File Uploader*):** Los componentes complejos para arrastrar y soltar archivos o validar adjuntos deben inicializarse después de que el formulario base ya sea visible para el usuario.
- **División de código (*Code Splitting*):** Empaquetar y enviar el código de procesamiento de archivos solo cuando se acceda a esta ruta, evitando cargar dependencias no utilizadas en las otras páginas de pago.

#### D. Monitoreo continuo
- Habilitar en `config/schedule.js` la ejecución programada diaria (`mobile-daily`) y semanal (`desktop-weekly`) para verificar si futuros despliegues en el portal institucional mejoran o degradan estas métricas frente al historial registrado en `report/`.

## Estructura del proyecto

```text
config/        Configuración de páginas, dispositivos, jobs y umbrales
cypress/       Suite E2E, fixtures y soporte
lib/           Motor Lighthouse, normalización, clasificación y persistencia
scheduler/     Runner de ejecución programada (node-cron)
tests/         Pruebas unitarias con node:test
```