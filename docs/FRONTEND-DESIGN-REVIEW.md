> Runtime update: the complete original navigation is preserved. In local-computer mode, primary workflow sections read the paired agent task ledger and evidence. Computer Control, Computer Tasks and Computers & Permissions are additional routes under /computer, not replacements. Original sandbox designs remain available in the optional inventory runtime.

# Aplicación de los diseños de Stitch al frontend

Fecha: 2026-10-30. Prioridad confirmada por el usuario: **web de escritorio**.

El alcance final de esta entrega se centra en **Overview**, el logo, **AI Agent Studio**
y **Visual Observations**, **Live Execution**, **Task Manager**, **Recovery Center**
y **Hardware & IT Inventory**, **Verification Lab**, **AI Models**, **Settings**
y **Analytics & Benchmarks** y **Activity Logs**. Todas las pantallas con maqueta
de Stitch han sido revisadas y adaptadas. La guia visual compartida es la base
de los tokens del frontend; no representa una pantalla adicional.

## Referencias revisadas

La fuente es la carpeta local `stitch_inti_ai_autonomous_platform/`, especialmente:

- `autonomous_visual_intelligence/DESIGN.md`.
- HTML y PNG de `overview_dashboard`, `ai_agent_task_studio` y `task_manager`.
- HTML y PNG de `live_execution_command_center`, `recovery_center`,
  `verification_lab`, `visual_observations` y `hardware_it_asset_inventory`.

Las maquetas son referencias visuales. Sus porcentajes, nombres de modelos,
usuarios y estados de ejemplo no constituyen datos del producto.

## Decisiones visuales

El documento mezcla una paleta narrativa con otra semántica en su cabecera YAML.
Los HTML exportados utilizan la segunda. Para acercar el resultado a las pantallas
entregadas se adoptó esa paleta semántica, con el cian del contenedor para la
selección del menú:

| Uso | Color aplicado |
|---|---|
| Fondo | `#0C1321` |
| Barra lateral | `#151B2A` |
| Cabecera de marca y pie del menú | `#070E1C` |
| Superficie de tarjetas | `#19202E` |
| Superficie elevada | `#232A39` |
| Capas y ventanas | `#2E3544` |
| Cian de texto y señales | `#4CD7F6` |
| Selección del menú | `#06B6D4` |
| Dorado | `#FFB95F` |
| Éxito | `#4AE176` |
| Error | `#FFB4AB` |
| Texto principal / secundario | `#DCE2F6` / `#BCC9CD` |

Geist, Inter y JetBrains Mono se sirven localmente mediante Fontsource. Se
conservan sus licencias en las dependencias. No se necesitan peticiones a Google
Fonts en el navegador. Las esquinas son compactas y las cifras tabulares.

## Qué se aplicó y por qué

| Elemento de la maqueta | Decisión e implementación |
|---|---|
| Menú `w-72` y barra superior `h-16` | Aplicados: 288 px y 64 px en escritorio. Cabecera de marca separada y pie de operador. |
| Main → Connected Apps → Intelligence → System | Aplicado en el mismo orden y con los nombres de la referencia. |
| Overview, AI Agent Studio y Task Manager | Rutas existentes adaptadas y nuevo gestor conectado a `/missions`. |
| AI Models | Vista de configuración y disponibilidad real del modelo; no es un selector de modelos inexistente. |
| Activity Logs | Ventana real de eventos persistidos de planificación, ejecución, recuperación y verificación. Su alcance limitado queda visible. |
| Settings | Diagnóstico y configuración local de solo lectura. No hay interruptores que aparenten guardar cambios. |
| Buscador y atajo | Buscador funcional de espacios con Ctrl/Cmd+K, foco dentro de un diálogo nativo y cierre con Escape. No promete buscar topologías inexistentes. |
| New Task | Abre el formulario real y enfoca el objetivo. Crear, aprobar y ejecutar siguen siendo decisiones separadas. |
| Campana y perfil | Avisos reales de la sesión y acceso a la conexión del operador. No se inventa una cuenta de usuario. |
| Tarjetas de métricas | Recuentos y veredictos existentes, con estados sin datos explícitos. No se copiaron cifras ilustrativas. |
| Tabla e inspector de tareas | Identidad, objetivo, fuente, preparación y fecha; inspector con ejecución y verificación reales. Paginación de 20, filtros solo sobre la página cargada. |
| Observaciones recientes | Galería con capturas auténticas, resolución, fecha y enlaces al registro. |
| Plan, ejecución, recuperación y verificación | Mantienen sus inspectores y controles reales con superficies, tipografía y encabezados coherentes. |
| Connected Apps / Inventory | Abre `/inventory` dentro de la plataforma y lee los registros reales. El enlace de edición conserva el sandbox y su DOM original para las acciones autorizadas. |

## Elementos que no corresponde presentar como funciones reales

| Elemento ilustrativo | Motivo |
|---|---|
| 98–99 % de éxito, recuperación o disponibilidad | No existe una medición que sustente esas cifras. |
| Vídeo continuo a 60 FPS y latencia constante de 14 ms | La aplicación trabaja con observaciones y eventos reales, no con ese servicio de vídeo. |
| SAM 3.1, segmentación y modelos Muse de la maqueta | No son capacidades verificadas de esta instalación. Se muestra el estado que devuelve el backend. |
| Dictado por voz, guardar rutinas y programar tareas | No tienen servicio o persistencia implementados. |
| Takeover, exportar parches y Commit Rule | No existen contratos de autorización y ejecución para estas acciones. Se mantienen pausa/cancelación y aprobaciones reales. |
| Certificaciones, protocolo patentado y clústeres empresariales | No hay evidencia de esas afirmaciones. |
| Fotos remotas de usuarios y capturas genéricas de ERP | Sustituidas por identidad de operador local y evidencia auténtica. |
| Menús repetidos de la maqueta de observaciones | Son duplicaciones del export, no navegación adicional necesaria. |
| ERP alternativos, crear activos y auditorías certificadas | No tienen contrato de backend. La vista nativa de Hardware consulta los registros actuales; la edición y automatización conservan el sandbox existente. |

## Archivos principales

- `apps/frontend/src/styles/index.css`: paleta, fuentes y tokens compartidos.
- `apps/frontend/src/styles/workspace.css`: shell y composición del escritorio.
- `apps/frontend/src/app/navigation.ts` y `app/App.tsx`: menú, rutas y cabecera.
- `components/WorkspaceSearch.tsx`: búsqueda y atajos.
- `pages/TaskManager.tsx` y `pages/ActivityPage.tsx`: vistas nuevas con datos reales.
- `pages/MissionControl.tsx`, `Dashboard.tsx` y páginas operativas: integración visual.
- `tests/workspace.test.tsx`: autorización, filtros, paginación, errores y navegación.
- `scripts/check_overview_design.py`: revisión de navegador sin mutaciones de datos.

## Verificación y acceso

El frontend principal se sirve en <http://localhost:5173>. La carpeta de diseños
original permanece local y no se publicó en GitHub. Los cambios del frontend
tampoco se publican como parte de esta petición.

Las capturas finales se guardan en `docs/screenshots/overview/` y
`docs/screenshots/studio/`, `docs/screenshots/observations/`, `docs/screenshots/execution/`
y `docs/screenshots/tasks/`, `docs/screenshots/recovery/` y `docs/screenshots/inventory/`.
`docs/screenshots/stitch/` contiene capturas preliminares.
La revisión automatizada se registra en `docs/evidence/overview-design-ui.json`
y `docs/evidence/studio-design-ui.json`, `docs/evidence/observations-design-ui.json`
y `docs/evidence/execution-design-ui.json`, `docs/evidence/tasks-design-ui.json`
y `docs/evidence/recovery-design-ui.json` y `docs/evidence/inventory-design-ui.json`.
Los scripts usan registros
existentes, comprueba resoluciones de escritorio de 1366, 1600 y 1920 px y rechaza
mutaciones HTTP durante la inspección. Su ejecución no crea misiones, no resetea
el inventario ni llama al modelo.

## Overview: composicion final

La portada `/` reproduce la composicion de `overview_dashboard`: bienvenida con
dos acciones, cuatro tarjetas, pipeline de cuatro etapas, captura central, tabla
de ejecuciones y columna de runtime, recuperacion y accesos directos. El formulario
se abre desde Create New Task en `/missions/new`; no ocupa la portada.

Los totales de tareas proceden del historial persistido. Las ejecuciones completadas
y los tiempos describen solo las seis ejecuciones recientes cargadas por la API.
La tasa de recuperacion sigue sin medir. La captura procede de la observacion
protegida del navegador y lleva fecha; no se simula un video a 60 FPS. Solo el
informe independiente revalidado permite mostrar Verified para la ultima ejecucion.

El usuario solicito un logo nuevo tras comprobar que el original remoto necesitaba
inicio de sesion de Google. El PNG transparente se genero con imagegen y se sirve
localmente en menu, bienvenida y favicon. [Logo y prompt](branding/LOGO.md).

Validacion final: 45 pruebas de frontend aprobadas, typecheck y lint correctos,
compilacion de Docker correcta. Navegador real a 1366, 1600 y 1920 px sin
desbordamiento ni errores; dialogo de operador, enlaces y foco comprobados.
No se dispararon mutaciones HTTP ni llamadas al modelo.

- [Captura de Overview a 1600 px](screenshots/overview/overview-1600.png).
- [Evidencia de navegador](evidence/overview-design-ui.json).
- Comprobacion reproducible: `python scripts/check_overview_design.py`.

## AI Agent Studio: composicion final

La ruta `/planning` adapta `ai_agent_task_studio/code.html` y `screen.png`:
editor de objetivos a la izquierda, arbol de acciones e inspector, y columna
derecha con motor, alcance, salvaguardas y estado. Conserva los colores,
tipografia, navbar de escritorio y jerarquia de tarjetas de la referencia.

El ultimo plan guardado se abre para inspeccion. Recent Syntheses permite cargar
otros planes; Reset limpia el borrador y la seleccion. Los pasos desplegables
muestran condiciones, parametros, riesgo y procedencia reales. La evidencia
protegida requiere conectar el operador y se descarga con autorizacion; el token
no forma parte de la URL de la imagen. Las coordenadas se identifican como
estimaciones registradas, sin afirmar precision de localizacion medida.

Generate Plan e Interpret scene requieren tanto un modelo configurado como la
capacidad del servidor para llamadas reales. Esa capacidad sigue desactivada.
La receta authored se etiqueta como un recorrido separado sin inferencia. No se
presentan limites de reintentos, tiempos, SAM, dictado, rutinas ni permisos que
no tengan respaldo en el backend. Las aprobaciones y ejecucion siguen sus flujos
existentes.

Validacion: 48 pruebas de frontend aprobadas, TypeScript y lint correctos.
La prueba de refresco comprueba que una actualizacion del plan guardado no borre
el objetivo que se esta redactando. Chromium comprueba tres anchos de escritorio,
captura autenticada, pasos, historial, Reset y bloqueo de llamadas al modelo.

- [Captura de Studio a 1600 px](screenshots/studio/studio-1600.png).
- [Evidencia de navegador](evidence/studio-design-ui.json).
- Comprobacion reproducible: `python scripts/check_studio_design.py`.

### Correccion de arranque React

El usuario reporto `Invalid hook call` al iniciar ApplicationShell. El arbol
de dependencias local y el de Docker tienen una sola copia de React y React DOM,
ambos 19.3.1. La traza contiene un chunk de React con hash de una cache anterior
y un renderer con otro hash. El servicio Docker ejecutaba Vite en modo desarrollo
aunque ya compilaba `dist` al construir la imagen.

Docker ahora sirve `dist` mediante `npm run preview`, con el mismo puerto y proxy
de API/WebSocket. Es una previsualizacion local, no un despliegue de produccion.
El modo de desarrollo conserva `npm run dev`, con React deduplicado y sus entradas
de runtime incluidas en la optimizacion inicial. La comprobacion de Studio exige
un bootstrap compilado, ausencia de modulos `.vite` y dos recargas sin errores.

Referencia: [Vite: cache y prebundling](https://vite.dev/guide/dep-pre-bundling)
y [proxy de preview](https://vite.dev/config/preview-options#preview-proxy).

## Visual Observations: composicion final

Las rutas `/observations` y `/observations/:id` usan la composicion de
`visual_observations/code.html` y `screen.png`: cabecera con captura seleccionada,
barra de busqueda y filtros, visor a la izquierda, paneles de telemetria, elementos
y procedencia a la derecha, y galeria inferior de capturas reales. No se repiten
los menus duplicados del export de Stitch.

Split View y Grid permiten revisar los registros cargados. La busqueda incluye
titulo, URL, ID, dimensiones y etiquetas/coordenadas de los planes asociados.
Los filtros distinguen registros del navegador y frames de planes. La galeria
pagina sobre un conjunto acotado: las ultimas 20 capturas publicas y referencias
de los ultimos 10 planes como maximo. No representa todo el historial.

El operador conectado puede incluir capturas protegidas referenciadas por esos
planes. Sus imagenes usan descarga autenticada y URLs temporales sin credenciales.
El visor permite ampliar, exportar el PNG, alternar Raw Frame y los recuadros
registrados, y seleccionar un elemento para resaltar su recuadro y ficha.
Se omiten recuadros fuera del viewport o asociados a otra captura o resolucion.
Los elementos DOM se identifican como `dom_assisted`; no se presentan como
inferencia de modelo ni precision de deteccion medida.

La resolucion y fecha proceden del registro. Se identifica la captura como imagen
estatica; FPS, latencia y mascaras de segmentacion siguen sin datos. El panel de
percepcion muestra exclusivamente una interpretacion guardada o la escena del
plan asociado. La interpretacion nueva con Meta requiere modelo configurado y
capacidad de llamadas habilitada, que permanece desactivada.

Capture observation conserva la captura autorizada del sandbox, solo tras una
accion explicita. La revision del diseno no crea capturas ni llama al modelo.

Validacion: 56 pruebas de frontend aprobadas, TypeScript y lint correctos. Ocho
pruebas nuevas cubren geometria, seleccion, filtros, permisos, errores, captura
explicita y bloqueo de llamadas reales. Chromium comprueba tres resoluciones,
PNG exportado, vistas, recuadros autenticados, enlace al plan y recarga.
La suite completa usa dos workers en este equipo para evitar la saturacion
observada con la concurrencia predeterminada.

- [Visual Observations a 1600 px](screenshots/observations/observations-1600.png).
- [Evidencia de navegador](evidence/observations-design-ui.json).
- Comprobacion reproducible: `python scripts/check_observations_design.py`.

## Live Execution: composicion final

La ruta `/execution` sigue `live_execution_command_center/code.html` y `screen.png`:
cabecera de runtime, tres columnas con secuencia de acciones/eventos, navegador
central y paneles de estado, objetivo, traza, limites y verificacion independiente.
La seleccion de ejecuciones guardadas esta en una barra compacta; tras conectar,
el ultimo registro se abre para inspeccion sin iniciar una ejecucion.

El visor conserva la captura autentica y protegida con fecha y dimensiones.
Permite ampliar con salida mediante Escape, descargar el PNG con Frame Snap y
abrir la observacion original. Una ejecucion terminal muestra SAVED FRAME, no
LIVE FEED. Los recuadros solo se habilitan si la resolucion registrada corresponde
al frame previo de esa accion y sus coordenadas son validas para el viewport.
No se aplica una coordenada antigua a una captura posterior.

La secuencia refleja las acciones del manifest y el ultimo resultado por accion.
La traza muestra explicacion guardada, resolucion, parametros, comprobaciones y
evidencia; no presenta pensamiento interno de modelo inventado. Los eventos
persistidos se pueden filtrar y desplegar. WebSocket y polling mantienen cursores
separados; cambiar de ejecucion o desconectar limpia la vista e ignora respuestas
tardias. Un socket adelantado no omite eventos anteriores del historial REST.

Elapsed y Mean action time proceden exclusivamente de los tiempos registrados.
Los limites proceden del manifest. No se inventan FPS, confianza de grounding,
reintentos de recuperacion ni telemetria CDP. Takeover y Record Loop no se muestran
porque no tienen contrato de backend; se mantienen pausa, reanudacion y
cancelacion con los estados permitidos.

Las aprobaciones del plan y de acciones HIGH siguen separadas. El dialogo
conserva el digest y las acciones revisadas y bloquea la confirmacion si cambia
el manifest o la ejecucion seleccionada. Cancelar requiere confirmacion y no
promete revertir cambios ya persistidos. La preparacion de una receta o plan
existente queda en un panel desplegable y requiere una accion explicita.

El resultado independiente se obtiene del informe revalidado; COMPLETED no se
convierte por si solo en VERIFIED_SUCCESS. Un fallo al refrescar el informe
oculta cualquier distintivo de exito conservado en cache y muestra NOT VERIFIED.
Las rutas al plan, observacion,
Recovery Center y Verification Center conservan el contexto disponible.

Validacion: 63 pruebas de frontend aprobadas en diez archivos con dos workers;
TypeScript y lint correctos. Las pruebas nuevas cubren aislamiento de eventos,
cursores independientes, tiempos y resultados duplicados, comandos terminales,
aprobacion HIGH, cambio de manifest durante la confirmacion y fallo del verificador
con un exito antiguo en cache. Chromium revisa
tres resoluciones, evidencia real, descarga PNG, seleccion e inspeccion de pasos,
cambio de registro, enlaces de evidencia y recarga sin errores de React.

- [Live Execution a 1600 px](screenshots/execution/execution-1600.png).
- [Evidencia de navegador](evidence/execution-design-ui.json).
- Comprobacion reproducible: `python scripts/check_execution_design.py`.

## Task Manager: composicion final

La ruta `/tasks` sigue `task_manager/code.html` y `screen.png`: cabecera con tres
metricas, filtros de ciclo de vida, tabla central y un inspector lateral con
objetivo, captura, pasos, tiempos, fuente y enlaces de evidencia. El color y el
layout de escritorio mantienen la referencia; no se reproducen los registros
ficticios de SAP, Stripe, Jira o Salesforce, ni se inventan slots paralelos,
tasas de exito, FPS, confianza visual o tareas recuperadas.

Stored Tasks muestra el total persistido. Las otras metricas y filtros usan
exclusivamente la pagina de hasta 20 misiones cargada; la tabla informa cuantos
detalles estan disponibles. Running significa estado de ejecucion RUNNING;
Completed significa ejecucion COMPLETED. Recovered identifica tareas con una
sesion RECOVERED registrada, sin convertirla en un objetivo verificado. La
preparacion de la mision, el estado de ejecucion y el veredicto independiente
permanecen separados.

La busqueda, el filtro de preparacion y la ventana de creacion de 24 horas o
siete dias operan sobre esa pagina, no sobre todo el historial. La paginacion
usa el offset del servidor. Cada detalle se solicita con la capacidad del
operador, incluye el informe revalidado del backend y se descarta de la vista
si falla su refresco o no coincide con la mision solicitada. No se conserva un
distintivo de exito de una tarea anterior o de una respuesta fallida.

El inspector muestra el ultimo frame de ejecucion o la observacion inicial
guardada, con descarga autenticada y URL temporal. Los pasos se calculan usando
el ultimo resultado por accion del manifest. La duracion describe solo la
ejecucion; los tokens describen solo el uso registrado del plan y permanecen
sin datos cuando no fueron medidos. El panel inferior refleja las sesiones de
recuperacion reales, incluyendo su ausencia explicita.

La exportacion de la tabla contiene solo las filas visibles, con alcance y
offset identificados. JSON Trace exporta el detalle de la tarea seleccionada;
ninguna exportacion incluye la capacidad del operador. Los enlaces abren la
observacion original, la ejecucion, el informe o Mission Control. New Task abre
el compositor existente sin crear ni ejecutar una tarea automaticamente.

Validacion: 69 pruebas de frontend aprobadas en once archivos con dos workers;
TypeScript y lint correctos. Las pruebas nuevas cubren filtros de fecha y estado,
duraciones invalidas, estados independientes, cambio de seleccion y retirada de
un exito en cache cuando falla el detalle. Chromium comprueba 1366, 1600 y
1920 px, datos reales, exportaciones JSON, filtros, enlaces, foco del compositor
y recarga sin errores de React. La inspeccion no crea tareas ni llama a Meta.

- [Task Manager a 1600 px](screenshots/tasks/tasks-1600.png).
- [Evidencia de navegador](evidence/tasks-design-ui.json).
- Comprobacion reproducible: `python scripts/check_task_manager_design.py`.

## Recovery Center: composicion final

La ruta `/recovery` sigue `recovery_center/code.html` y `screen.png`: cabecera,
cuatro metricas, comparador de tres columnas (baseline, pipeline, captura fresca),
registro de eventos y panel de auditoria. Diagnosticos, plan de reparacion,
aprobaciones y presupuesto conservan los contratos existentes del backend.

El historial real inspeccionado contiene cero recuperaciones. La interfaz muestra
ese estado completo sin crear casos de demostracion, capturas o diagnósticos
ficticios. La tasa de recuperacion y el tiempo medio permanecen sin datos cuando
no hay muestras. Con registros, la tasa usa RECOVERED / (RECOVERED + FAILED) de
la pagina cargada; canceladas y escaladas no se suman como fallos resueltos.
El tiempo medio usa solo sesiones cerradas con duraciones finitas no negativas.
Solo el total de sesiones guardadas es global; las otras metricas son de pagina.

El pipeline refleja fallo, diagnostico, propuesta, aprobacion e intentos guardados.
Los hechos observados se separan de las hipotesis, incertidumbres y regiones
propuestas. Las capturas usan autenticacion, URLs temporales revocadas al cambiar
de caso y referencias de observacion inspeccionables. No se inventan confianza,
mascaras SAM, hashes DOM ni latencia de inferencia. Una captura fresca no se
etiqueta como prueba de reparacion aplicada por si sola.

Las aprobaciones de plan y acciones HIGH conservan el digest y snapshot revisado;
un cambio de caso, manifest o estado permitido bloquea su confirmacion. Cancelar
requiere confirmacion y aclara que los cambios persistidos permanecen guardados.
Reintentar exige ESCALATED, retry_allowed y confirmacion de uso del presupuesto
restante. No se inician acciones por abrir o inspeccionar la pagina.

Los eventos se montan por caso y capacidad del operador para evitar mezclar
historiales. Un error al refrescar el caso retira su evidencia y controles activos.
Recovered sigue describiendo comprobaciones de la accion interrumpida; el enlace
a Verification Lab permite revisar el resultado independiente de la tarea.
Export record descarga el registro JSON, no un parche ejecutable ni una regla.
Replay Simulation, Commit Rule y afirmaciones de protocolo patentado se omiten
porque no tienen respaldo en los contratos del producto.

Validacion: 78 pruebas de frontend aprobadas en once archivos con dos workers;
TypeScript y lint correctos. Nueve pruebas nuevas cubren estados vacios, casos
terminales, presupuestos, muestras invalidas, aprobaciones HIGH, cambios de
manifest y confirmaciones de cancelar/reintentar. Los casos con registros usan
fixtures identificados como pruebas; no se verifico una recuperacion activa real.
Chromium comprueba el historial real vacio en tres resoluciones, controles
deshabilitados, refresco, navegacion y recarga sin errores de React.

- [Recovery Center a 1600 px](screenshots/recovery/recovery-1600.png).
- [Evidencia de navegador y limitaciones](evidence/recovery-design-ui.json).
- Comprobacion reproducible: `python scripts/check_recovery_design.py`.

## Hardware & IT Inventory: composicion final

La ruta nativa `/inventory` sigue `hardware_it_asset_inventory/code.html` y
`screen.png`: cabecera, tres tarjetas, busqueda y filtros, tabla de activos y
un inspector lateral. Connected Apps y la busqueda de workspaces apuntan ahora
a esta vista; Open editable sandbox conserva acceso a la aplicacion objetivo.

La vista lee exactamente los registros reales de `/api/inventory` del sandbox:
ID, nombre, ubicacion, estado y version. Los contadores muestran activos, ubicaciones
distintas y filas con estado Operational. Los filtros de texto, ubicacion y estado
se aplican al snapshot completo recibido, con paginacion local de cinco filas.
Los JSON descargados identifican el registro seleccionado o el conjunto filtrado.

La conexion `/inventory-data` solo acepta la ruta exacta con GET/HEAD, sin
parametros ni sufijos. El servidor frontend consulta un destino configurado y
fijo, no una URL enviada por el navegador; rechaza otros metodos antes de hacer
una peticion al sandbox, no sigue redirects y valida los registros antes de
entregarlos. `INVENTORY_PROXY_TARGET` usa `http://demo:8001` en Docker y
`http://127.0.0.1:8001` por defecto en desarrollo nativo. Se aplica tanto al
servidor de desarrollo como a la previsualizacion compilada.

La aplicacion de inventario original no cambia: se conservan los controles
Search equipment, Open PC-104, su formulario y la persistencia existente.
La nueva vista no agrega permisos de escritura ni modifica la allowlist del agente.
No hay endpoint para crear activos o consultar historial de ediciones; no se
inventan custodios, especificaciones, certificaciones ISO, sellos criptograficos
ni eventos de mutacion autonomos. La version persistida es una revision de fila,
no una prueba de auditoria independiente. Last fetched identifica la lectura
del cliente y no una fecha de edicion del activo.

Un error de lectura retira detalles y acciones de exportacion basados en cache,
sin presentar valores antiguos como actuales. El refresco automatico de diez
segundos y el boton manual solo vuelven a leer datos. Para editar se usa el
sandbox existente o un flujo de tarea con las aprobaciones correspondientes.

Validacion: 87 pruebas de frontend aprobadas en trece archivos con dos workers;
TypeScript y lint correctos. Nueve pruebas nuevas cubren contrato de datos,
bloqueo de rutas/metodos de escritura, errores, filtros, seleccion y paginacion.
Chromium comprueba tres resoluciones, exportaciones, navegacion nativa, recarga
y los controles originales del sandbox sin guardar cambios. Los hashes de los
registros antes y despues coinciden, incluyendo sus versiones.

- [Hardware Inventory a 1600 px](screenshots/inventory/inventory-1600.png).
- [Evidencia de navegador e inventario sin cambios](evidence/inventory-design-ui.json).
- Comprobacion reproducible: `python scripts/check_inventory_design.py`.

## Verification Lab: composicion final

La ruta `/verification` adopta las tres tarjetas, el flujo horizontal de cuatro
etapas, la comparacion esperado/observado y el ledger de `verification_lab`.
Se conservan la paleta compartida y las dimensiones del shell de escritorio.
El inspector de criterios tiene scroll propio para mantener visible la evidencia;
la procedencia, hashes, requisitos, eventos y limitaciones se pueden desplegar.

Las tarjetas describen exclusivamente el caso seleccionado: criterios y resultados
registrados, cantidad de artefactos y comprobaciones de integridad del informe.
No se presentan los porcentajes ficticios de precision visual, pHash, OCR,
nonces criptograficos, latencia fija ni validaciones masivas del mockup.
La captura proviene de un artefacto protegido real y los JSON de estado se
consultan con la capacidad del operador. Los object URLs se revocan al cambiar.

El veredicto actual proviene de `effective_verdict` del informe revalidado, con
IDs de verificacion, ejecucion, version y digest de criterios coincidentes.
Un error de recarga retira el exito previo, la comparacion y la descarga del
informe; un error del caso retira sus controles y evidencia. Un error de artefacto
oculta su contenido anterior. Los resultados del ledger se identifican como
historicos y no afirman integridad actual. COMPLETED y PASS por criterio no
equivalen por si solos a VERIFIED_SUCCESS.

Los enlaces con execution/verification sobreviven a la conexion del operador.
Los eventos y artefactos se montan por caso y capacidad. Desconectar o recargar
retira el acceso de memoria. La creacion manual sigue siendo explicita;
cancelacion y nueva recoleccion requieren confirmacion. Inspeccionar, refrescar,
revalidar y descargar no crea sesiones ni modifica el inventario.

Chromium comprueba los cinco registros reales disponibles, una captura protegida,
JSON de estado, exportacion, seleccion del historial, revalidacion y recarga en
tres resoluciones. No se crean verificaciones ni se realizan llamadas Meta;
los registros de inventario antes y despues coinciden. Los errores y controles
de mutacion se cubren exclusivamente con fixtures identificados de pruebas.

- [Verification Lab a 1600 px](screenshots/verification/verification-1600.png).
- [Evidencia de navegador](evidence/verification-design-ui.json).
- Comprobacion reproducible: `python scripts/check_verification_design.py`.

Validacion final de frontend: 95 pruebas aprobadas en trece archivos con dos
workers; TypeScript y lint correctos. Ocho pruebas nuevas cubren fallos de recarga
de informe/caso/artefacto, enlace profundo, asociacion de criterios,
confirmaciones y desconexion. Los siete contratos anteriores de verificacion
siguen pasando.

La referencia `verification_lab` se elimina despues de implementar y comprobar
esta vista, siguiendo la limpieza incremental solicitada por el usuario. Su
procedencia queda registrada mediante SHA-256: HTML
`2fc25a34e98e155855d4a29165986c6c3de855c4dcd9f2998f7a1a9e9553471e`, PNG
`681c03b1396ea3eb3ba24dc09cdb1878a79eda06bf9af74c6561fe703963761c`.
Se conservan `activity_logs`, `ai_models`, `analytics_benchmarks`, `settings` y la
guia compartida; su contenido no se considera implementado en esta entrega.

## AI Models: composicion final

La ruta `/models` ahora tiene una pagina dedicada, siguiendo `ai_models/code.html`
y `screen.png`: cuatro tarjetas de metricas, adaptador principal y grounding a la
izquierda, servicios en dos columnas y panel lateral con entorno, permisos y una
observacion guardada. Se conserva la paleta compartida y el shell de escritorio.
El encabezado de la maqueta que decia Recovery Center se corrige a AI Models.
Settings permanece en `/system`, con su implementacion existente.

El adaptador muestra el identificador y proveedor obtenidos de `/models/status`.
Configurado, disponibilidad del ultimo analisis y permiso de llamadas son estados
distintos. Disponibilidad null permanece no establecida; true/false describe el
ultimo analisis, no una conexion actual. Para mostrar que las solicitudes estan
permitidas hacen falta configuracion y switch de llamadas habilitado. Refrescar
el estado no realiza una inferencia ni una prueba de facturacion del proveedor.

Las cuatro metricas conservan su posicion visual, con valores no medidos:
throughput, latencia, VRAM y precision. No se inventan GPU H100, memoria de host,
FPS, confianza, SLA ni ventanas de contexto. SAM, Llama de respaldo y el motor
Act-V4 de la maqueta se sustituyen por componentes realmente implementados:
validacion de grounding, Playwright/Chromium y verificacion independiente.
Estos componentes se identifican como servicios, no como modelos adicionales.
No se presentan sliders de routing ni registros de modelos sin soporte.

La guia desplegable explica la configuracion local con nombres de variables,
sin mostrar ni aceptar credenciales. El panel de permisos refleja exactamente
los switches del servidor; sus estados no equivalen a disponibilidad de cada
dependencia. GPU y memoria no expuestas permanecen indisponibles. La imagen es
la ultima observacion publica real, con viewport y fecha registrados; se etiqueta
como captura guardada y no demuestra que el modelo actual la haya analizado.
No se generan capturas ni se accede a evidencias protegidas de otras tareas.

Cada fuente que falla retira sus datos previos, incluidos estados de modelo,
permisos, entorno y observacion. El fallo de imagen retira el img roto y muestra
su estado indisponible. Benchmarks, Settings, Observations, Live Execution y
Verification se abren mediante enlaces a las vistas reales existentes.

Validacion: 105 pruebas de frontend aprobadas en catorce archivos, TypeScript y
lint correctos. Diez pruebas nuevas cubren disponibilidad triestado, permisos,
configuracion, fuentes vacias, fallos de imagen/recarga y separacion entre
dependencia y switch de ejecucion. Chromium comprueba tres tamanos de escritorio,
la captura publica, la guia, refresco, navegacion y recarga sin errores de React.
No se realizan llamadas Meta, cambios de configuracion ni escrituras de
inventario; sus registros antes y despues coinciden.

- [AI Models a 1600 px](screenshots/models/models-1600.png).
- [Evidencia de navegador](evidence/models-design-ui.json).
- Comprobacion reproducible: `python scripts/check_models_design.py`.

Tras comprobar la vista compilada se elimina solamente la referencia `ai_models`.
SHA-256 del HTML: `3a27a4b662bbdc335fc77fedefceed22f102ed93cceea5c09deaec1e99e891ee`.
SHA-256 del PNG: `f4c8da0922ab87f5fef7bc7532bde83cb5ae60606efd07975ab13b6663fee635`.
Permanecen los disenos pendientes `activity_logs`, `analytics_benchmarks` y
`settings`, ademas de la guia compartida y README.

## Settings: composicion final

La ruta `/system` adopta el diseno `settings/code.html` y `screen.png`: cabecera
de configuracion, navegacion por cinco modulos, perfil y calibracion en la columna
izquierda, vision y aplicaciones a la derecha, y sandbox de ancho completo.
Los filtros muestran All Modules, General & Access, Vision & AI Models,
Connected Apps o Sandbox & Services. El shell y AI Models conservan sus rutas.
`SystemPage` conserva su export y delega en la nueva pagina `SettingsPage`.

Los datos de modelo, permisos y dependencias proceden de los endpoints publicos
existentes. Configurado, disponibilidad del ultimo analisis y readiness del
navegador son conceptos distintos. Los switches habilitados son politicas del
servidor; un servicio de recuperacion habilitado no afirma que el modelo pueda
diagnosticar sin configuracion y permiso de llamadas. El panel de inventario lee
el catalogo existente y muestra su conectividad, cantidad real de registros y
hora de lectura en el cliente. Check connection vuelve a leerlo sin escribir.

El panel del operador carga la capacidad en el contexto compartido de memoria,
limpia el campo de contrasena y permite desconectarla. La capacidad se valida en
peticiones protegidas del servidor; cargarla no autentica una identidad personal.
No se inventan nombre, email, clave PGP ni custodia del usuario de la maqueta.
Navegar entre rutas conserva el acceso temporal; recargar lo elimina.
No se utiliza localStorage ni sessionStorage para guardar la capacidad.

Export diagnostics descarga un JSON con campos publicos seleccionados de modelo,
sistema, switches, cantidad de activos y horas de lectura. No incluye capacidad,
borrador, credenciales, filas de inventario ni campos adicionales de respuestas.
Si alguna fuente falla, retira sus valores previos y deshabilita la exportacion
completa. Los demas paneles conservan sus propias lecturas validas.

Save/Discard, sliders de umbrales, modelo secundario seleccionable, webhooks,
ERP, rotacion de claves, GPU H100, telemetria ficticia, perfil firmado y apagado
global se omiten porque no tienen operaciones de soporte en el sistema actual.
El modelo se configura en el entorno local y se documentan los switches reales;
no se agrega un endpoint de escritura ni se cambia el .env. Los controles de
sesion enlazan a Live Execution, donde pausa y cancelacion tienen alcance sobre
la ejecucion seleccionada. La calibracion permanece no medida.

Validacion: 116 pruebas aprobadas en quince archivos. Once pruebas nuevas cubren
disponibilidad triestado, filtros, acceso compartido/transitorio, exportacion
sin credenciales, errores de recarga y catalogo vacio o inaccesible. Chromium
comprueba tres resoluciones, JSON real, filtros, acceso entre rutas y recarga,
conexiones y enlaces. No hay escrituras HTTP ni llamadas Meta; configuracion y
registros/versiones del inventario se conservan.

- [Settings a 1600 px](screenshots/settings/settings-1600.png).
- [Evidencia de navegador](evidence/settings-design-ui.json).
- Comprobacion reproducible: `python scripts/check_settings_design.py`.

La referencia `settings` se elimina solo despues de comprobar la vista compilada.
SHA-256 HTML: `67147d62b6452046cc8a569eacbd13a65f9f67431e9153c7438f831099a0b813`.
SHA-256 PNG: `448b9ce67c4444bdd157d73a2e52f3d91f0daf2a8ed50915095b38585939e3bf`.
Se conservan los disenos pendientes `activity_logs` y `analytics_benchmarks`, la
guia compartida y README.

## Analytics & Benchmarks: composicion final

La ruta `/benchmarks` adopta `analytics_benchmarks/code.html` y `screen.png`:
cabecera con controles de fuente, cuatro metricas, grafico con panel lateral,
tarjetas de resultados, tabla filtrable y pie de procedencia. `BenchmarkPage`
conserva su export y delega en `AnalyticsPage`. Se mantienen la paleta, fuentes
y shell de escritorio; el encabezado incorrecto Recovery Center del HTML se
sustituye por el nombre de la pantalla.

Solo se leen los informes allowlisted existentes: cinco escenarios reales de
verificacion Chromium/SQLite y doce fixtures sinteticos de politica. El selector
separa ambas metodologias. Para verificacion se muestran exito de tarea con su
denominador, media registrada del verificador, acuerdo de veredicto y deteccion
de falsos positivos. Para politica se muestran acuerdo esperado, media de
validacion, validez de esquema y tasa de acciones no soportadas. No se suman
ni comparan medias de fuentes distintas. Un fixture valido no significa que
una tarea haya sido ejecutada.

El grafico usa barras discretas con las latencias de escenarios en orden de
fuente, eje desde cero y unidad ms; no es una tendencia temporal ni un desglose
de fases. Seleccionar una muestra con raton o teclado muestra su nombre, tiempo
y resultado registrado. Las muestras ausentes, negativas o no finitas se excluyen;
los ceros medidos se conservan. Ratios con denominador cero o datos invalidos
quedan indisponibles. Las tarjetas de resultados cuentan los escenarios de la
fuente seleccionada. La busqueda y el filtro de resultados afectan solo a la
tabla; los denominadores originales del informe permanecen visibles.

El panel lateral identifica las dos fuentes y sus cantidades, sin clasificacion
de modelos ni precios. Los resultados de pruebas con IDs aislados se inspeccionan
como JSON archivado; no se enlazan como ejecuciones del workspace actual.
Export report JSON descarga el informe seleccionado con sus metadatos. Copy
source hash copia el SHA-256 del archivo fuente que identifica el backend; no
se presenta como certificacion ni como hash del paquete JSON exportado.

El mockup incluia SAM, miles de operaciones, comparacion Muse/Claude/GPT,
aplicaciones ERP y latencias de etapas sin medicion real. Estos elementos no se
presentan como capacidades implementadas. Los controles de ventana temporal y
Run Benchmark Suite se sustituyen por seleccion de fuente y refresco de lectura;
no existe una operacion de ejecucion de benchmarks en la interfaz. Recuperacion,
calidad comparativa de modelos, tiempo de ejecucion y acciones inseguras globales
permanecen sin medir. COMPLETED y acuerdo del evaluador no se convierten en
exito de objetivo ni fiabilidad estadistica del modelo.

Un fallo de recarga retira metricas almacenadas en cache, grafico, tabla,
procedencia y acciones de exportacion/copia. Una fuente elegida explicitamente
que desaparece no se reemplaza silenciosamente por otra metodologia. Informes
faltantes, filas ausentes y filtros sin coincidencias tienen estados visibles.

Validacion: 127 pruebas aprobadas en diecisiete archivos; TypeScript y lint
correctos. Once pruebas nuevas cubren ratios/tiempos invalidos, metodologias,
filtros, seleccion, fallos de fuentes, exportacion y copia. Chromium comprueba
ambas fuentes reales, los denominadores y medias originales, teclado, JSON,
exportaciones y recarga en tres resoluciones. No se inician benchmarks ni
llamadas Meta ni escrituras HTTP; informes, switches y registros de inventario
permanecen iguales antes y despues.

- [Analytics a 1600 px](screenshots/analytics/analytics-1600.png).
- [Fixtures de politica](screenshots/analytics/analytics-policy-1920.png).
- [Evidencia de navegador](evidence/analytics-design-ui.json).
- Comprobacion reproducible: `python scripts/check_analytics_design.py`.

Se elimina solamente `analytics_benchmarks` tras comprobar la vista compilada.
SHA-256 HTML: `6e7df3b475818ed789dfb8c9b0ea52a42a4e6dc4dd0ecd9efd4310356889b122`.
SHA-256 PNG: `277be85b99ea9c2fdd58cfbc65410dc4ce999bac0dccce6cc6e9c682c79af4ed`.
Permanecen `activity_logs`, la guia compartida `autonomous_visual_intelligence`
y README.

## Activity Logs: composicion final

La ruta `/activity` adopta `activity_logs/code.html` y `screen.png`: cabecera,
cinco contadores, filtros, lista paginada e inspector lateral con estado del feed.
Se conservan el shell, las fuentes y la paleta de escritorio. La tabla preliminar
se sustituye por entradas seleccionables con fecha completa, origen, tipo e ID.
Compact view reduce la altura sin retirar metadatos del inspector.

El endpoint protegido existente devuelve una ventana de hasta veinte entradas
recientes de planning, execution, recovery y verification. Los contadores
describen esa ventana, no totales globales ni de 24 horas. Se deduplica por origen
e ID; un mismo ID puede aparecer en varios streams porque algunos eventos son
reenviados. No se transforma un tipo completed o un origen verification en
prueba de objetivo verificado, ni se infiere severidad a partir del nombre.

Busqueda por tipo/origen/ID, filtro de origen y tipo, y limites de 24 horas o
siete dias operan exclusivamente sobre la ventana cargada. La fecha usa el reloj
del cliente para esos filtros; no se afirma haber consultado todo el historial
del periodo. La paginacion de seis entradas es local. Seleccionar otra pagina,
filtrar o vaciar la lista retira la seleccion anterior del inspector.

El inspector muestra exactamente ID, timestamp, tipo y origen. La ventana no
incluye payload completo, captura, enlace a sesion padre, severidad ni firma.
Por ello no se asocian imagenes de otras tareas, no se fabrican certificados,
hashes, autores, precisiones SAM ni salud de Kafka. Los enlaces Browse abren el
workspace del origen, sin afirmar vinculacion a una sesion concreta.

Export JSON incluye el alcance de ventana filtrada, numero cargado/exportado,
hora de lectura y cuatro campos permitidos por entrada. No serializa el overview
completo, capacidades del operador, borradores, consultas de texto ni datos de
misiones/aprobaciones ajenas. CSV exporta las mismas entradas, con quoting y
neutralizacion de formulas de hoja de calculo. La exportacion incluye todas las
coincidencias cargadas, no solamente las seis visibles en la pagina. Copy JSON
copia solo los metadatos de la seleccion actual; su confirmacion se retira al
cambiar de seleccion.

La capacidad permanece compartida en memoria, se valida con el servidor y se
retira al desconectar o recargar. Cambiar capacidad remonta los filtros y estado
de seleccion. Un error de lectura retira cache, inspector y exportaciones.
El polling de esta vista usa una query independiente del shell: Pause auto-refresh
congela sus lecturas automaticas aunque el shell siga consultando su overview.
El refresco manual sigue disponible; no se pausa la ejecucion ni el servidor.

Validacion: 138 pruebas aprobadas en diecinueve archivos; TypeScript y lint
correctos. Once pruebas nuevas cubren identidad por origen, filtro temporal,
CSV seguro, permisos, paginacion, seleccion, exportaciones, fallo de lectura,
compactacion, pausa y desconexion. La prueba previa del workspace conserva su
cobertura adaptada a la lista. Chromium comprueba las veinte entradas reales,
cinco contadores, teclado, filtros, ambas exportaciones, portapapeles, pausa de
mas de un intervalo y refresco manual en tres resoluciones. No se realizan
escrituras HTTP ni llamadas Meta; inventario y switches no cambian.

- [Activity Logs a 1600 px](screenshots/activity/activity-1600.png).
- [Evidencia de navegador](evidence/activity-design-ui.json).
- Comprobacion reproducible: `python scripts/check_activity_design.py`.

Se elimina unicamente `activity_logs` tras comprobar la vista compilada.
SHA-256 HTML: `79d5b979c2d18dd1301273881efb034c1a544f1d415de697bce06d2fea860a2a`.
SHA-256 PNG: `d9c3180eac4dd2696a3aa54d4e271e7a17ef6c4cc3088c54ae0840ecd9276f2a`.
Estado final de las referencias: no quedan maquetas de pantalla pendientes. Al
cierre de la comprobacion el directorio de referencias estaba vacio; los tokens,
decisiones visuales y capturas implementadas quedan en el frontend y esta
documentacion. La limpieza de esta entrega elimino solamente `activity_logs`.
