import { nativeSpanish } from "./nativeMessages";

export const spanish: Record<string, string> = {
  ...nativeSpanish,
  Overview: "Vista general",
  "AI Agent Studio": "Estudio del agente IA",
  "Live Execution": "Ejecución en vivo",
  "Visual Observations": "Observaciones visuales",
  "Task Manager": "Gestor de tareas",
  "Hardware & IT Inventory": "Hardware e inventario TI",
  "Connected Apps": "Aplicaciones conectadas",
  "Recovery Center": "Centro de recuperación",
  "Verification Lab": "Laboratorio de verificación",
  "Analytics & Benchmarks": "Analítica y evaluaciones",
  "AI Models": "Modelos de IA",
  "Activity Logs": "Registro de actividad",
  Settings: "Configuración",
  "Observe your connected computer, review a plan, execute approved actions, inspect evidence and recover safely.":
    "Observa tu equipo conectado, revisa un plan, ejecuta acciones aprobadas, consulta la evidencia y recupera tareas de forma segura.",
  "Evidence source": "Origen de la evidencia",
  "Paired local agent": "Agente local vinculado",
  "Local mission lifecycle": "Ciclo de trabajo en tu equipo",
  "All records below belong to your paired computer. Application launches and file checks are reported separately.":
    "Los registros siguientes corresponden a tu equipo vinculado. Las aperturas de aplicaciones y las comprobaciones de archivos se muestran por separado.",
  "Connected computers": "Equipos conectados",
  "Local observation sources": "Fuentes de observación local",
  "The local agent reports its connected device, authorized folder and detected application catalog. Desktop screenshots and visual interpretation are not yet implemented for this agent.":
    "El agente local informa del equipo conectado, la carpeta autorizada y el catálogo de aplicaciones detectadas. Las capturas del escritorio y su interpretación visual aún no están implementadas para este agente.",
  "No desktop screenshot has been captured. Application icons are not screen observations.":
    "No se ha capturado el escritorio. Los iconos de aplicaciones no son observaciones de pantalla.",
  "Detected application catalog": "Catálogo de aplicaciones detectadas",
  "compatible desktop applications": "aplicaciones de escritorio compatibles",
  "This is agent-reported context, not a visual screenshot or model inference.":
    "Estos datos los informa el agente; no proceden de una captura visual ni de una inferencia del modelo.",
  Platform: "Plataforma",
  "Last heartbeat": "Última señal de conexión",
  "CPU, RAM and disk specifications are not reported by this agent yet. No demo inventory is shown.":
    "Este agente aún no informa de CPU, RAM ni disco. No se muestra inventario de demostración.",
  "Tasks requiring attention": "Tareas que requieren atención",
  "Interrupted actions are never replayed automatically. Inspect the recorded steps and existing files before preparing a new reviewed draft.":
    "Las acciones interrumpidas nunca se repiten automáticamente. Revisa los pasos registrados y los archivos existentes antes de preparar un borrador nuevo.",
  "Prepare a new draft from this task? Previous files and windows remain. Review all actions before approving.":
    "¿Preparar un borrador nuevo a partir de esta tarea? Se conservarán los archivos y ventanas anteriores. Revisa todas las acciones antes de aprobar.",
  "No error receipt available.": "No hay un informe de error disponible.",
  "recorded action receipts": "comprobantes de acciones registrados",
  "Prepare a new reviewed draft": "Preparar un borrador nuevo para revisión",
  "No failed, interrupted or canceled tasks in the loaded history.":
    "No hay tareas fallidas, interrumpidas ni canceladas en el historial cargado.",
  "Recorded verification evidence": "Evidencia de verificación registrada",
  "File readback checks the saved contents. An application launch receipt only records a launch request. Independent desktop visual verification is not yet available.":
    "La lectura del archivo comprueba el contenido guardado. El comprobante de apertura solo registra una solicitud de lanzamiento. La verificación visual independiente del escritorio aún no está disponible.",
  "No action evidence available yet.":
    "Todavía no hay evidencia de acciones disponible.",
  "Measured local task history": "Métricas del historial de tareas locales",
  "Loaded tasks": "Tareas cargadas",
  "File readbacks": "Lecturas de archivos verificadas",
  "Application launch requests": "Solicitudes de apertura de aplicaciones",
  "Metrics use the latest 100 local task records. Completed tasks are not automatically independent verification successes. No live-model benchmark is claimed.":
    "Las métricas usan los últimos 100 registros de tareas locales. Una tarea completada no implica una verificación independiente exitosa. No se presentan evaluaciones de llamadas reales a modelos.",
  "Local task activity": "Actividad de tareas locales",
  "Creation and latest update times come from the task ledger. Individual action timestamps are not available.":
    "Las fechas de creación y última actualización proceden del registro de tareas. No hay marcas de tiempo individuales por acción.",
  Created: "Creada",
  "Latest update": "Última actualización",
  "Current local plans are explicitly authored. Live-model calls remain disabled; model planning and desktop visual reasoning have not been connected to this agent yet.":
    "Los planes locales actuales están predefinidos explícitamente. Las llamadas reales a modelos siguen deshabilitadas; la planificación con modelos y el razonamiento visual del escritorio aún no se han conectado a este agente.",
  Status: "Estado",
  Evidence: "Evidencia",
  "Applications on this computer": "Aplicaciones de este equipo",
  "Choose which detected desktop applications INTI may open. Each launch still requires an exact plan approval. This does not grant control inside the application.":
    "Elige qué aplicaciones de escritorio detectadas puede abrir INTI. Cada apertura requiere aprobar el plan exacto. Esto no concede control dentro de la aplicación.",
  "Application computer": "Equipo de las aplicaciones",
  "Search applications": "Buscar aplicaciones",
  "Last scan": "Última detección",
  "Connect the updated Windows agent to load a fresh application catalog.":
    "Conecta el agente de Windows actualizado para cargar un catálogo reciente de aplicaciones.",
  "Authorized application": "Aplicación autorizada",
  "Not authorized": "Sin autorización",
  "Remove permission and cancel pending launches?":
    "¿Quitar el permiso y cancelar las aperturas pendientes?",
  "Allow INTI to prepare launches for this application?":
    "¿Permitir que INTI prepare aperturas para esta aplicación?",
  "Remove permission": "Quitar permiso",
  "Authorize application": "Autorizar aplicación",
  "Prepare application launch": "Preparar apertura",
  "No compatible applications found. Update the agent or adjust your search.":
    "No se encontraron aplicaciones compatibles. Actualiza el agente o ajusta la búsqueda.",
  "Only detected local .exe applications without shortcut arguments are supported. Store apps, console tools and shortcuts requiring arguments are excluded.":
    "Se admiten aplicaciones .exe locales detectadas cuyos accesos directos no requieren argumentos. Se excluyen las aplicaciones de la Tienda, las herramientas de consola y los accesos con argumentos.",
  APPLICATION: "APLICACIÓN",
  "Executable identity": "Identidad del ejecutable",
  "Exact application and manifest digest":
    "Aplicación exacta y huella del plan",
  "This exact application will be requested without command-line arguments. Actions inside it are not authorized by this plan.":
    "Se solicitará abrir esta aplicación exacta sin argumentos de consola. Este plan no autoriza acciones dentro de ella.",
  "Request the approved application to open":
    "Solicitar abrir la aplicación aprobada",
  "Application is not authorized or its catalog is stale":
    "La aplicación no está autorizada o su catálogo está desactualizado",
  "Application changed or disappeared; refresh and authorize it again":
    "La aplicación cambió o desapareció; actualiza y vuelve a autorizarla",
  "Application identity changed; review the current catalog":
    "La identidad de la aplicación cambió; revisa el catálogo actual",
  "Reconnect the agent to authorize an application":
    "Vuelve a conectar el agente para autorizar una aplicación",
  "Application or paired device is unavailable":
    "La aplicación o el equipo vinculado no están disponibles",
  "A valid local operator capability is required":
    "Se requiere una credencial válida del operador local",
  "Requested operator service is disabled or not configured":
    "El servicio de operador está deshabilitado o no está configurado",
  "INTI AI — local computer task\n\nThis file was created by the paired Windows agent after approval.\nThe agent verifies the saved content, requests Notepad and opens the approved browser page.\n":
    "INTI AI — tarea en el equipo local\n\nEste archivo fue creado por el agente de Windows vinculado después de su aprobación.\nEl agente verifica el contenido guardado y solicita abrir el Bloc de notas y la página aprobada.\n",
  "Cannot reach the backend. Check that INTI AI is running.":
    "No se puede conectar con el backend. Comprueba que INTI AI esté en ejecución.",
  "An unexpected error occurred.": "Ocurrió un error inesperado.",
  "Operator capability required": "Se requiere una credencial de operador",
  "Invalid operator capability": "Credencial de operador no válida",
  "The local agent is offline; reconnect it before planning":
    "El agente local está desconectado; vuelve a conectarlo antes de preparar el plan",
  "Review the current manifest and reconnect the device before approval":
    "Revisa el plan actual y vuelve a conectar el equipo antes de aprobar",
  "INTI AI / LOCAL COMPUTER": "INTI AI / EQUIPO LOCAL",
  "Computer Task History": "Historial de tareas del equipo",
  "Connected Computer & Permissions": "Equipo conectado y permisos",
  "Your computer. Your approved actions.": "Tu equipo. Tus acciones aprobadas.",
  "A paired Windows agent creates a note, requests Notepad and opens an approved page. Every action belongs to the plan you review.":
    "Un agente de Windows vinculado crea una nota, solicita abrir el Bloc de notas y una página aprobada. Cada acción pertenece al plan que revisas.",
  "APPROVAL REQUIRED": "REQUIERE APROBACIÓN",
  "Operator access loaded · Manage connection":
    "Acceso de operador activo · Administrar conexión",
  "Connect your operator capability": "Conecta tu credencial de operador",
  " Current computer data and approvals are unavailable.":
    " Los datos actuales del equipo y las aprobaciones no están disponibles.",
  "Paired computers online": "Equipos vinculados en línea",
  "Queued / running tasks": "Tareas en cola / en ejecución",
  "Planning source": "Origen del plan",
  "Authored sample · 0 model calls":
    "Muestra predefinida · 0 llamadas al modelo",
  "Prepare a visible Windows task": "Prepara una tarea visible en Windows",
  "REAL LOCAL ACTIONS": "ACCIONES LOCALES REALES",
  Computer: "Equipo",
  "Target computer": "Equipo de destino",
  "Pair a Windows agent first": "Primero vincula un agente de Windows",
  "New text filename": "Nombre del nuevo archivo de texto",
  "File contents": "Contenido del archivo",
  "Page to open in your default browser":
    "Página que se abrirá en tu navegador predeterminado",
  "Browser page URL": "URL de la página del navegador",
  "A new task folder is created inside the agent's authorized folder. Existing files are not overwritten. This release uses a typed sample plan; arbitrary desktop tasks and model planning are not enabled.":
    "Se crea una carpeta de tarea dentro de la carpeta autorizada del agente. No se sobrescriben archivos existentes. Esta versión usa un plan predefinido; las tareas de escritorio arbitrarias y la planificación con modelos aún no están habilitadas.",
  "Prepare plan": "Preparar plan",
  "Selected computer task": "Tarea del equipo seleccionada",
  "Reviewed plan & live action receipts":
    "Plan revisado y comprobantes de acciones en vivo",
  Task: "Tarea",
  "NEW FILE": "ARCHIVO NUEVO",
  "BROWSER TARGET": "DESTINO DEL NAVEGADOR",
  "Agent read the saved file and matched its contents.":
    "El agente leyó el archivo guardado y comprobó que su contenido coincide.",
  "Windows accepted an application launch request. Visual completion is not independently verified.":
    "Windows aceptó una solicitud de apertura de la aplicación. El resultado visual no se verifica de forma independiente.",
  "Waiting for approved execution.": "Esperando la ejecución aprobada.",
  "Exact file contents and manifest digest":
    "Contenido exacto del archivo y huella del plan",
  "Review & execute": "Revisar y ejecutar",
  "Cancel remaining actions? Files and windows already created are retained.":
    "¿Cancelar las acciones restantes? Se conservarán los archivos y las ventanas ya creados.",
  "Cancel remaining actions": "Cancelar acciones restantes",
  "Export receipt": "Exportar comprobante",
  "Recent computer tasks": "Tareas recientes del equipo",
  Refresh: "Actualizar",
  "No computer tasks available. Pair an agent and prepare a plan.":
    "No hay tareas disponibles. Vincula un agente y prepara un plan.",
  "Connect to inspect protected computer tasks.":
    "Conéctate para consultar las tareas protegidas del equipo.",
  "Latest 100 task records. Receipts describe local agent actions; they do not certify arbitrary application outcomes.":
    "Últimos 100 registros de tareas. Los comprobantes describen acciones del agente local; no certifican los resultados de otras aplicaciones.",
  "Paired Windows agents": "Agentes de Windows vinculados",
  "Connect your Windows agent": "Conecta tu agente de Windows",
  "Install and run the agent on the computer you authorize. It connects outward to INTI; it does not expose a remote-control port.":
    "Instala y ejecuta el agente en el equipo que autorices. Se conecta a INTI mediante conexiones salientes; no abre un puerto de control remoto.",
  "Download Windows agent": "Descargar agente de Windows",
  "Extract the ZIP and run": "Extrae el ZIP y ejecuta",
  "with Python 3.12+ installed.": "con Python 3.12 o superior instalado.",
  "Enter this server's backend URL and a one-time pairing code.":
    "Introduce la URL del backend de este servidor y un código de vinculación de un solo uso.",
  "Keep the agent running. Review the authorized folder before approving any task.":
    "Mantén el agente en ejecución. Revisa la carpeta autorizada antes de aprobar una tarea.",
  "Generate pairing code": "Generar código de vinculación",
  "ONE USE · expires": "UN SOLO USO · vence",
  "Enter this code only in your local agent. It grants access to the device you pair.":
    "Introduce este código únicamente en tu agente local. Otorga acceso al equipo que vincules.",
  "Authorized folder": "Carpeta autorizada",
  "Revoke this agent and cancel its pending actions?":
    "¿Revocar este agente y cancelar sus acciones pendientes?",
  "Revoke access": "Revocar acceso",
  "No paired Windows agent available.":
    "No hay un agente de Windows vinculado disponible.",
  "Granted capabilities": "Permisos concedidos",
  "Create a new .txt file in the authorized folder":
    "Crear un archivo .txt nuevo en la carpeta autorizada",
  "Request Notepad for that exact file":
    "Solicitar el Bloc de notas para ese archivo exacto",
  "Request an approved http(s) browser URL":
    "Solicitar una URL http(s) aprobada en el navegador",
  "Shell commands, deleting files, installing applications, screenshots and unrestricted mouse/keyboard control are outside this release.":
    "Esta versión no incluye comandos de consola, eliminación de archivos, instalación de aplicaciones, capturas de pantalla ni control libre del ratón o teclado.",
  "Cancellation stops remaining actions; it does not close existing windows or undo file creation.":
    "La cancelación detiene las acciones restantes; no cierra ventanas existentes ni deshace la creación de archivos.",
  "Approve these exact actions on your PC":
    "Aprueba estas acciones exactas en tu PC",
  "Close approval": "Cerrar aprobación",
  "A file will be created inside": "Se creará un archivo dentro de",
  ", opened through Notepad, and this URL requested in your default browser:":
    ", se solicitará abrirlo en el Bloc de notas y esta URL en tu navegador predeterminado:",
  "Review digest:": "Huella del plan:",
  "The task, device or read state changed. Close and review the current plan.":
    "Cambió la tarea, el equipo o el estado de consulta. Cierra y revisa el plan actual.",
  Back: "Volver",
  "Approve & run on this computer": "Aprobar y ejecutar en este equipo",
  "Skip to main content": "Saltar al contenido principal",
  "INTI AI Overview": "Inicio de INTI AI",
  "AUTONOMOUS INTELLIGENCE": "INTELIGENCIA AUTÓNOMA",
  "Main navigation": "Navegación principal",
  Main: "Principal",
  System: "Sistema",
  Intelligence: "Inteligencia",
  Active: "Activo",
  Bounded: "Limitado",
  "Latest independent verdict": "Último resultado independiente",
  Verified: "Verificado",
  "PAIRED WINDOWS AGENT": "AGENTE WINDOWS VINCULADO",
  "LOCAL CHROMIUM SANDBOX": "ENTORNO LOCAL DE CHROMIUM",
  "Manage operator connection": "Administrar conexión del operador",
  "Local operator": "Operador local",
  "Capability connected": "Credencial conectada",
  "Not connected": "Sin conexión",
  "Expand navigation": "Expandir navegación",
  "Collapse navigation": "Contraer navegación",
  "Command Platform": "Plataforma de control",
  "Computer Control": "Control del equipo",
  "Computer Tasks": "Tareas del equipo",
  "Computers & Permissions": "Equipos y permisos",
  "Meta model availability": "Disponibilidad del modelo de Meta",
  Connected: "Conectado",
  Unverified: "Sin verificar",
  "Not configured": "Sin configurar",
  "New Task": "Nueva tarea",
  Notifications: "Notificaciones",
  "Session notifications": "Notificaciones de la sesión",
  "No notifications for this session.": "No hay notificaciones en esta sesión.",
  Dismiss: "Descartar",
  "Open the guided demo": "Abrir la muestra guiada",
  "Dismiss notification": "Descartar notificación",
  "Loading workspace…": "Cargando sección…",
  "Loading workspace configuration…": "Cargando configuración…",
  "Workspace configuration unavailable. Reload after checking the backend.":
    "La configuración no está disponible. Comprueba el backend y vuelve a cargar.",
  "Page not found": "Página no encontrada",
  "Return to Mission Control": "Volver al centro de control",
  "/ See. Reason. Act. Verify.": "/ Observa. Razona. Actúa. Verifica.",
  "Operator connected for this session. Approvals remain explicit.":
    "Operador conectado en esta sesión. Cada aprobación sigue siendo explícita.",
  "Operator capability": "Credencial de operador",
  "Connected · held in memory": "Conectado · guardado en memoria",
  "Enter local operator token": "Introduce la credencial del operador local",
  Connect: "Conectar",
  "Disconnected. The local capability was cleared.":
    "Desconectado. Se borró la credencial local.",
  Disconnect: "Desconectar",
  "Shared across workspaces; cleared on reload.":
    "Compartida entre secciones; se borra al recargar.",
  "Search workspaces": "Buscar secciones",
  "Find a workspace": "Buscar una sección",
  "Close workspace search": "Cerrar búsqueda de secciones",
  "Workspace name": "Nombre de la sección",
  "Planning, recovery, tasks…": "Planificación, recuperación, tareas…",
  "No workspace matches “": "Ninguna sección coincide con “",
  "Navigate with Tab · Open with Enter · Close with Escape":
    "Navega con Tab · Abre con Intro · Cierra con Escape",
  "This workspace could not render. Reload to reconnect with saved records.":
    "No se pudo mostrar esta sección. Recarga para conectar con los registros guardados.",
  online: "en línea",
  offline: "sin conexión",
  ONLINE: "EN LÍNEA",
  OFFLINE: "SIN CONEXIÓN",
  READY: "LISTO",
  DEGRADED: "DEGRADADO",
  CHECKING: "COMPROBANDO",
  UNAVAILABLE: "NO DISPONIBLE",
  DRAFT: "BORRADOR",
  QUEUED: "EN COLA",
  RUNNING: "EN EJECUCIÓN",
  COMPLETED: "COMPLETADA",
  FAILED: "FALLIDA",
  CANCELLED: "CANCELADA",
  INTERRUPTED: "INTERRUMPIDA",
  PENDING: "PENDIENTE",
  VERIFIED_READBACK: "LECTURA VERIFICADA",
  LAUNCH_REQUESTED: "APERTURA SOLICITADA",
  "Create a new text file": "Crear un archivo de texto nuevo",
  "Request Notepad to open that file":
    "Solicitar abrir ese archivo en el Bloc de notas",
  "Request the default browser to open the approved URL":
    "Solicitar abrir la URL aprobada en el navegador predeterminado",
};

export type Language = "es" | "en";
export function translate(language: Language, message: string): string {
  if (language !== "es") return message;
  const request = /^Request failed \((\d+)\)\. Please try again\.$/.exec(
    message,
  );
  if (request)
    return `La solicitud falló (${request[1]}). Vuelve a intentarlo.`;
  return spanish[message] ?? message;
}
