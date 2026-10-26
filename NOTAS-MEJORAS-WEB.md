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

Paginación conservando genealogía y búsqueda global, reducción del paquete interno de Plotly, pruebas de PDF tras actualización mayor, medición autenticada de LCP/INP y empaquetado definitivo de escritorio. Las listas actuales conservan su contenido y filtros; esta entrega reduce el trabajo de entrada y difiere herramientas pesadas sin recortar resultados.
