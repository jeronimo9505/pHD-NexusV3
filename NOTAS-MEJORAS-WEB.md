# Mejoras web y recuperación

Inicio: 26 de octubre de 2026.

## Punto de recuperación

- Rama de trabajo: `codex/web-performance`.
- Etiqueta previa a los cambios: `audit-baseline-2026-10-26`.
- Código web publicado al comenzar: `8d93bb5a4e78e4e6603dd3267bc0441a9f07b405`.
- Deployment original: `dpl_88mtGQir6LVrteyuXyfmpfpePRok`, proyecto Vercel `phd-nexusv3`.
- Supabase: `V11PHD` / `rufjebyqbdpdgnofuzaq`.

La etiqueta incluye la auditoría y permite comparar todo el trabajo con `git diff audit-baseline-2026-10-26`.

## Cambios de esta entrega

- Sesión validada reutilizada por petición; no hay caché global de usuarios.
- Perfil consultado una sola vez para nombre y permisos.
- Menos consultas bloqueantes en la estructura común de todos los módulos.
- Solo membresías activas conceden entrada y aparecen en el selector de grupos.
- Dashboard entregado por widgets independientes mediante Suspense.
- Calendario conserva tareas con y sin fecha con una sola consulta.
- Consultas independientes de Tasks y Drive Reports en paralelo.
- Configuración compartida de grupo deduplicada por petición.
- Carga por demanda de formularios, editores, gráficas y herramientas científicas.
- Google se inicializa desde los módulos que lo necesitan, sin precargar todos sus servicios al entrar a cualquier pantalla.
- Región propuesta para el siguiente deployment: Dublín (`dub1`), cerca de Supabase Irlanda.
- Revisión de código con configuración oficial Next.js para TS/TSX y comando de tipos independiente.

## Cómo retroceder

1. Antes de cualquier reversión, guardar trabajo posterior y revisar `git status`.
2. Para inspeccionar el estado original sin borrar trabajo: `git switch -c recovery/web-baseline audit-baseline-2026-10-26`.
3. Para deshacer esta entrega web ya compartida, usar `git revert web-performance-2026-10-26` en la rama de publicación y desplegar ese nuevo commit. Esa etiqueta identifica el commit de mejoras web. No usar reset destructivo ni force push.
4. En Vercel también se puede restaurar el deployment original indicado arriba. Esto revierte la web, no la base de datos.
5. La configuración regional viaja con `vercel.json`: al revertir ese cambio se recupera la configuración previa.
6. Git y Vercel no revierten SQL. Cualquier cambio de base debe tener su archivo de reversión independiente y registrarse abajo.

No restaurar permisos inseguros solo para resolver un problema de interfaz: mantener los bloqueos de seguridad y corregir la incompatibilidad.

## Estado de validación

- Compilación de producción correcta con Next.js 16.4.3; TypeScript correcto.
- ESLint operativo: cero errores bloqueantes y 81 advertencias. Las reglas nuevas del compilador React quedan como advertencias para migrar las vistas existentes progresivamente; las reglas de orden de hooks siguen bloqueando.
- Pruebas del cargador Google: llamadas simultáneas deduplicadas, recuperación tras fallo y ejecución en servidor correctas.
- Comprobación de bundles por módulo: Plotly completo fuera de los archivos iniciales de los componentes principales; la lista semanal se conserva como componente de servidor.
- Supabase: aplicado `web_performance_security`, con seis índices y protecciones para perfiles, reportes, solicitudes y membresías activas en Samples, Characterizations, Drive Reports y Raman Workspaces.
- Pruebas SQL con rol authenticated correctas: elevación de rol bloqueada, edición de perfil propio permitida, reportes ajenos protegidos, marcas propias permitidas, marcas ajenas bloqueadas, solicitudes pendientes sin acceso a las tablas protegidas y gestión administrativa conservada. Todos los cambios de datos de las pruebas se revirtieron.
- Cambios SQL: `db/changes/web_performance_security.sql`; pruebas: `db/tests/web_performance_security.sql`; reversión: `db/rollback/web_performance_security.sql`. La reversión SQL no se ejecuta automáticamente al revertir Git o Vercel.
- Se actualizaron dependencias compatibles mediante el lockfile, incluido Next.js. Quedan avisos en jsPDF/Plotly y dependencias de Tailwind que requieren una actualización mayor o revisión específica. No se ejecutó una actualización forzada.
- La comprobación visual autenticada no se completó: la automatización del navegador local se detuvo al no poder verificar la URL con certeza. No se atribuyen porcentajes de mejora ni tiempos completos de navegación sin esa medición.

## Publicación

Autorizada por el usuario el 26 de octubre de 2026. Primera entrega integrada en main: `2de7f6c`. Deployment de producción verificado: `dpl_FpFwJczXU4HQAKcQBTCxz5qQ3wxC`, READY, región Dublín; el inicio de sesión responde 200 en la web principal.

## Segunda entrega: estructura de carga

- Rama de trabajo: `codex/web-loading-flow`; base recuperable: etiqueta `web-performance-2026-10-26`.
- Drive pasa a una ruta de lectura con caché limitada a la instancia, deduplicación, paginación, árbol reutilizable y descarte de respuestas antiguas. El refresco invalida los datos reutilizados.
- Drive y Calendar inicializan solo los servicios Google que necesitan; las inicializaciones concurrentes se coordinan.
- Logbook recibe hasta 50 entradas iniciales y estados de tareas desde el servidor, con comprobación de membresía activa. Mantiene paginación y tiempo real. Los resultados vacíos o fallidos terminan el estado de carga.
- Tasks ya no modifica estados automáticamente al abrirse. Se mantienen las acciones explícitas de mover tareas, renombrar y eliminar columnas.
- Calendar distingue rangos pendientes y recibidos; admite reintentos y descarta respuestas de navegaciones anteriores.
- Pruebas reproducibles: `npm run test:loading`. Evaluación detallada y decisiones sobre MCP: `EVALUACION-ARQUITECTURA-WEB.md`.
- Esta entrega no cambia el esquema ni los permisos de Supabase y no activa MCP ni nuevos permisos Google.
- Etiqueta del commit de esta entrega: `web-loading-flow-2026-10-26`. Para revertir únicamente esta segunda entrega, usar `git revert web-loading-flow-2026-10-26` y publicar el nuevo commit. Si se desea revertir también la primera, hacerlo después con su etiqueta; Git avisará si hay conflictos.

## Trabajo posterior separado de esta entrega

### Samples: carga progresiva por bitácora (26 de octubre)

- Base de reversión: `web-loading-flow-2026-10-26` (`0dec12a`). Rama: `codex/samples-progressive-loading`.
- Se conserva la selección actual: parámetro `logbook` válido o primera bitácora por fecha de creación. No existe una columna de bitácora predefinida y esta entrega no añade una preferencia distinta.
- Solo se consultan muestras, campos y nomenclaturas de la bitácora seleccionada. Una consulta de muestras sin selección devuelve error en lugar de cargar el grupo completo.
- Encabezado y selector se entregan antes de la tabla mediante Suspense; el módulo tiene una vista de carga propia y el cambio de bitácora muestra respuesta inmediata.
- Primera lectura: muestras y tipos de técnicas; se omiten los datos completos de mediciones. Caracterizaciones y Raman los solicitan al abrirse mediante una lectura directa de Supabase filtrada por grupo y bitácora, bajo las políticas existentes.
- Los resultados de mediciones se reutilizan en la misma tabla y se invalidan cuando cambia la instantánea de muestras del servidor. Las respuestas antiguas se descartan; los errores ofrecen reintento y no parecen listas vacías.
- Se conserva la genealogía y la búsqueda de la tabla, las técnicas, la búsqueda de mediciones por contenido, Raman y las lecturas completas del detalle.
- Comparación SQL de proyecciones equivalentes en la libreta de 91 muestras: muestras + mediciones completas 213.956 bytes; muestras + referencias de técnica 77.093 bytes. Las referencias incluyen identificadores para conservar el enlace directo desde las etiquetas al detalle. Excluye relaciones de perfil/padre, protocolo, compresión, HTML y JavaScript; no es una medición de tiempo de navegador.
- Validación reproducible: `npm run test:samples`; cubre selección obligatoria, proyección ligera, lectura diferida, reutilización, invalidación, respuestas antiguas, vacío y reintentos. No cambia datos ni esquema en Supabase.
- Etiqueta de esta entrega: `samples-progressive-loading-2026-10-26`. Reversión: `git revert samples-progressive-loading-2026-10-26`, publicar el nuevo commit; no requiere reversión SQL.
- Próximos pasos a largo plazo: medir sesión real por etapa, separar resumen/detalle de mediciones si crecen, paginar por familias conservando genealogía y búsqueda global, y actualizar solo la muestra afectada tras una edición. La tabla actual de 91 filas no justifica una migración completa ni virtualización sin medición.

Paginación conservando genealogía y búsqueda global, reducción del paquete interno de Plotly, pruebas de PDF tras actualización mayor, medición autenticada de LCP/INP y empaquetado definitivo de escritorio. Las listas actuales conservan su contenido y filtros; esta entrega reduce el trabajo de entrada y difiere herramientas pesadas sin recortar resultados.

### Samples: ediciones puntuales e índice reutilizable

- Rama: `codex/samples-targeted-updates`; base recuperable `samples-progressive-loading-2026-10-26` (`96c0c55`).
- Cambios de estado, formulario de edición, descripción y notas de composición usan una petición PATCH y aplican únicamente la fila confirmada. El servidor conserva las políticas RLS y atribución de auditoría; filtra la lectura y escritura por identificador y grupo.
- El endpoint exige sesión, valida los campos editables, rechaza origen ajeno e invalida futuras lecturas sin reconstruir inmediatamente la página activa. No se permite editar propietario, grupo ni permisos mediante el cuerpo recibido.
- Las referencias de técnicas y datos unidos del listado se conservan al aplicar una fila. La ficha abierta recibe los cambios y una nueva instantánea del servidor sustituye los parches locales. Editar metadatos no invalida la caché de mediciones ya leídas. Si el navegador vuelve a montar una página cacheada de esa libreta, consume una marca de invalidación y refresca una vez; no se guarda una caché global de registros de usuarios.
- Se evitan envíos repetidos mientras se guarda un formulario o un estado. Los errores conservan el contenido anterior y permiten reintentar. Crear/eliminar muestras y modificar caracterizaciones mantienen su flujo de revalidación anterior.
- El árbol ordenado y los textos buscables se calculan cuando cambian las muestras, en vez de reconstruirse por cada búsqueda, filtro o plegado. La búsqueda sigue cubriendo toda la bitácora cargada. El recorrido iterativo soporta genealogías profundas y no se bloquea por relaciones cíclicas corruptas.
- `npm run test:samples` incluye pruebas del índice, niveles, orden, familias plegadas, búsqueda por atributos/técnicas, genealogía profunda, permisos del endpoint, validación, auditoría, fallos y actualización del listado/ficha. Son pruebas controladas; no modifican registros de producción.
- Benchmark Node con índice ya construido: 121 filas, aproximadamente 0,01–0,20 ms por selección; 10.000 filas, aproximadamente 1,9–28 ms según coincidencias. Construir el índice tiene un coste inicial: se observaron 1,65 ms para 121 filas y 57,8 ms para 10.000 en una ejecución. El comando muestra ese coste por separado. Excluye DOM, red y medición de página. `node scripts/benchmark-sample-filter.mjs` permite repetirlo.
- Etiqueta final: `samples-targeted-updates-2026-10-26`. Para revertir todos los commits de esta entrega: `git revert --no-commit samples-progressive-loading-2026-10-26..samples-targeted-updates-2026-10-26`, revisar, crear el commit y publicar. No hay cambios SQL que revertir.
- La paginación de lecturas por familias y los resúmenes separados de mediciones requieren otro diseño de consultas para conservar búsqueda global y genealogía. No se sustituye ese trabajo por cortar filas en el navegador; la libreta actual de 91 muestras se conserva completa.

### Carga desktop, Admin y visitas

- Revisión detallada, interpretación de los registros y comparación compilada: `AUDITORIA-DESKTOP-CARGA.md`.
- Visitas deduplicadas por usuario/grupo y programadas tras la primera presentación; los errores permiten reintentar y se evita consultar de nuevo la identidad para insertar.
- Admin recibe su primera instantánea en la página de servidor; un refresco explícito usa una acción con lecturas paralelas y una sola comprobación de administrador. Se mantiene la autorización en las acciones individuales.
- Redirección al grupo predeterminado sin esperar el directorio completo, conservando la comprobación de membresía activa. Las lecturas del directorio y las membresías también se paralelizan.
- Comando opcional `npm run tauri:perf`: frontend Next compilado con Webpack y servido en localhost:3000, manteniendo el origen de OAuth. Antes hay que terminar la sesión de desarrollo que ocupa ese puerto. El comando normal de desarrollo permanece disponible.
- El diagnóstico local de Web Vitals se activa únicamente al compilar con el comando de comparación y escribe en la consola del WebView. No se midió aún una navegación autenticada en este modo y no se ha generado un instalador desktop.
- Pruebas: `npm run test:desktop`, junto a las suites existentes de Samples y carga. Sin cambios SQL ni permisos nuevos.
- Base de recuperación: `samples-targeted-updates-2026-10-26` (`919e437`); etiqueta final `desktop-loading-2026-10-26`. Reversión de toda esta entrega: `git revert --no-commit samples-targeted-updates-2026-10-26..desktop-loading-2026-10-26`, revisar, crear el commit y publicar.

### Integraciones Google

- Alcance, correcciones, límites y fuentes oficiales: `AUDITORIA-GOOGLE-INTEGRACIONES.md`.
- OAuth con cancelación, timeout, expiración estricta y limpieza de respuestas antiguas; Calendar comprueba permisos y no repite escrituras automáticamente ante errores.
- Knowledge recorre páginas y falla de forma explícita ante un escaneo incompleto; Picker propaga errores y recibe el identificador numérico del proyecto.
- Descargas sin tokens en las URL y cargas compartidas mediante multipart binario. El detalle de Drive descarta historiales de archivos anteriores.
- Nexus AI y Logbook respetan el modelo Gemini configurado. No se ejecutaron generaciones ni se migró el SDK en esta entrega.
- Pruebas: `npm run test:google`; no modifican archivos, calendarios o datos reales. Se conserva el cambio local generado de `next-env.d.ts` sin incluirlo en Git.
- Base: `desktop-loading-2026-10-26`; etiqueta final `google-integrations-2026-10-26`. Reversión: `git revert --no-commit desktop-loading-2026-10-26..google-integrations-2026-10-26`, revisar, crear el commit y publicar; sin reversión SQL.

### Samples: creación y borrado seguros

- Detalles y validación: `CORRECCIONES-SAMPLES-GUARDADO-BORRADO.md`.
- Creación con UUID de borrador estable, código asignado en una transacción y fila aplicada directamente al confirmar. El formulario conserva errores y bloquea doble envío/cierre durante la espera.
- Confirmación de borrado dentro de la app; operación múltiple transaccional y validación de filas eliminadas. Las derivadas requieren selección explícita; no se borran familias por sorpresa.
- Selección global corregida con filtros, campos numéricos 0 preservados y respuestas anteriores que no resucitan filas eliminadas.
- Migración Supabase aplicada: `sample_mutation_safety`. Funciones SECURITY INVOKER y política de historial limitada al actor y membresía activa. SQL: `db/changes/sample_mutation_safety.sql`; pruebas con ROLLBACK: `db/tests/sample_mutation_safety.sql`; reversión: `db/rollback/sample_mutation_safety.sql`.
- Base Git `google-integrations-2026-10-26`; etiqueta final `sample-mutation-safety-2026-10-26`. Revertir primero la aplicación y después, si procede, SQL. La reversión no elimina muestras creadas.
