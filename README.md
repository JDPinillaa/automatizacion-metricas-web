# Automatización de métricas web — Portal de Pagos UAM

Proyecto académico para medir y reportar métricas de rendimiento web  
(FCP, LCP, Speed Index y Performance) de páginas institucionales de la Universidad  
Autónoma de Manizales, usando **Cypress** y **Lighthouse** con ejecución programada.

> Estado: estructura base. La lógica de auditoría, persistencia y el módulo de
> reporte están pendientes (ver comentarios `// TODO`).

## Integrantes y URLs asignadas


| Integrante          | Página                       | URL                                                                                                                                                          | Usuario de github |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Juan Diego Pinilla  | Portal de Pagos UAM (Inicio) | [https://intrauam.autonoma.edu.co/ponline/](https://intrauam.autonoma.edu.co/ponline/)                                                                       | JDPinillaa       |
| Ever Santiago Uribe | Pago en Línea                | [https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/pagoPublico](https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/pagoPublico)                       | everSantiagoU       |
| Camilo Henao        | Pago por comprobante         | [https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/adjuntoPago?tipoPago=M](https://intrauam.autonoma.edu.co/ponline/pagosEnLinea/adjuntoPago?tipoPago=M) | milomnz       |


## Requisitos

- Node.js &gt;= 22.19
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
| `npm run scheduler`    | Inicia el runner de jobs programados (`scheduler/runner.js`). |


Notas:

- Los jobs de `config/schedule.js` están deshabilitados (`enabled: false`) por defecto.
- La tercera URL incluye el query string `?tipoPago=M`, que debe conservarse.

## Estructura del proyecto

```text
config/        Configuración de páginas, dispositivos, jobs y umbrales
cypress/       Suite E2E, fixtures y soporte
scheduler/     Runner de ejecución programada (node-cron)
```