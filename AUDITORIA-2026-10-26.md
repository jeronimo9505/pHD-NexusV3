# Auditoría de PhD Nexus V3
Fecha: 26 de octubre de 2026. Revisión del código, compilación de producción, Supabase conectado y despliegue Vercel.

## Dictamen
Hay causas concretas para la lentitud: separación geográfica entre servidor y base, autenticación y consultas en cascada, respuestas con más datos de los necesarios, importaciones amplias del módulo científico y procesamiento de matrices completas. La base actual es pequeña; aumentar recursos no debería ser la primera medida.

Hay además problemas de autorización que conviene resolver antes de publicar más funcionalidades. El más grave permite que un usuario cambie su propio rol de sistema a administrador según las políticas, permisos de columna y triggers inspeccionados. No se explotó ni se modificaron registros para comprobarlo.

Esta es una auditoría con recomendaciones: no se aplicaron cambios funcionales, migraciones ni despliegues.

## Alcance y evidencia
- Commit local y producción: `8d93bb5a4e78e4e6603dd3267bc0441a9f07b405`.
- Web: [phd-nexusv3.vercel.app](https://phd-nexusv3.vercel.app), proyecto `phd-nexusv3`, equipo `rodrigo's projects`. El acceso llamado por el usuario jero-vercel permite inspeccionarlo.
- Supabase: `V11PHD`, referencia `rufjebyqbdpdgnofuzaq`, región `eu-west-1`, estado ACTIVE_HEALTHY. Es el proyecto que coincide con NEXT_PUBLIC_SUPABASE_URL local; no aparece un proyecto llamado literalmente phf-nexus.
- Se inspeccionaron arquitectura Next.js/React/Tauri, entrada y sesiones, consultas de módulos, renderizado de muestras, cargas científicas, motor FastAPI/HDF5, políticas y permisos de base, índices, avisos y registros.
- Todas las 40 tablas públicas enumeradas tienen RLS activado. Eso no garantiza que sus políticas sean correctas.
- Se revisaron metadatos y agregados de actividad; no se descargaron archivos científicos ni se ejecutaron cargas pesadas contra producción.
- No se midió una sesión autenticada completa en navegador ni una instalación desktop de producción. LCP, INP, memoria máxima y arranque nativo siguen pendientes de medición.
- Los tiempos de Supabase son `response.origin_time`, no tiempos completos de navegador ni ejecución SQL aislada. La muestra es reducida y la ventana consultada es la de las últimas 24 horas disponible durante la revisión.

## Verificaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| TypeScript, sin emitir archivos | Correcto |
| Compilación de producción Next.js | Correcta al permitir acceso de red a Google Fonts |
| Primera compilación con red restringida | Falló al descargar Inter; no es prueba de fallo del código |
| npm run lint | Falla: ejecuta next lint, que no funciona en esta instalación Next 16 |
| ESLint invocado directamente | Falla: falta eslint-plugin-react-refresh |
| Configuración ESLint | Heredada de Vite; solo cubre JS/JSX, no TS/TSX |
| Salida estática desktop out/ | No existe después de next build |
| Vercel producción | READY, compilación registrada de aproximadamente 2 minutos |
| GET de /login publicado | HTTP 200, Brotli; respuesta dinámica privada |
| Errores Vercel consultados | Sin resultados en la ventana solicitada; no demuestra ausencia histórica de errores |
| Registros Vercel 24 h | Retención insuficiente en Hobby; consulta corregida a 30 minutos sin registros disponibles |
| Percentiles de observabilidad Vercel | Consulta rechazada con 400; no se obtuvieron percentiles fiables |

La compilación imprime mensajes DYNAMIC_SERVER_USAGE al intentar prerenderizar rutas que usan cookies, pero termina correctamente y las clasifica como dinámicas. No se clasifican como un fallo de producción.

## Prioridades

| ID | Prioridad | Problema | Acción |
|---|---|---|---|
| S1 | Crítica | Actualización del propio system_role | Restringir columnas y operación administrativa |
| S2 | Alta | Miembros pendientes pueden satisfacer controles de pertenencia | Exigir status active en autorización |
| S3 | Alta | Política de vistos permite editar contenido de reportes | Separar vistas por usuario o limitar operación |
| S4 | Alta | Motor local acepta rutas arbitrarias y escucha en todas las interfaces | Loopback, autenticación local y confinamiento de rutas |
| P1 | Alta | Vercel EE. UU. y Supabase Irlanda | Acercar funciones a la base y medir antes/después |
| P2 | Alta | Cascadas de sesión y consultas antes del contenido | Deduplicar y reducir bloqueos |
| P3 | Alta | Muestras/reportes sin paginación y con detalles completos | Consultas ligeras y detalle bajo demanda |
| P4 | Alta en ciencia | Importaciones estáticas de todas las herramientas | Carga por modo y Plotly reducido |
| D1 | Alta | Configuración desktop incompatible con salida actual | Definir arquitectura y empaquetado reales |
| P5 | Media | RLS e índices mejorables | Optimizar con planes y pruebas de permisos |
| P6 | Alta en mapas grandes | Matrices completas, JSON y escaneo del vault | Lectura por bloques, límites y catálogo |
| Q1 | Media | Validación de código inoperante | Reparar ESLint y añadir verificaciones de flujos |

## Seguridad: hallazgos confirmados por inspección

### S1. El propio perfil puede conceder administrador
Evidencia de la base en vivo:
- Política `Users can update own profile`: UPDATE con `auth.uid() = id`.
- `authenticated` tiene UPDATE sobre `profiles.system_role`.
- El único trigger de profiles inspeccionado actualiza updated_at; no protege el rol.
- El servidor confía en system_role en `src/lib/auth/roles.ts` y políticas administrativas consultan ese campo.

Impacto: un cliente que use directamente la API podría elevar sus privilegios cambiando su propia fila. La validación del formulario web no protege la API directa.

Cambio: retirar el permiso UPDATE general de perfiles y conceder solo columnas editables; mover rol/estado administrativo a una operación protegida con comprobación de administrador. Comprobar que un usuario ordinario no pueda cambiar rol, identidad ni estado, y que el administrador conserve su flujo. No basta con añadir una segunda política permisiva: las existentes se combinan con OR.

### S2. Pertenencia pendiente tratada como acceso
`fetchGroupRole` en `src/lib/auth/roles.ts` filtra grupo y usuario, sin status active. Las políticas de samples y varias de sample_characterizations también comprueban pertenencia sin estado activo.

La política INSERT de group_members permite solicitar ingreso si user_id es el propio y status es pending, sin limitar role. En combinación, una solicitud pendiente puede satisfacer controles de acceso antes de aprobarse.

Cambio: exigir membresía activa tanto en servidor como RLS; fijar el rol inicial de solicitudes; impedir elegir roles de gestión al solicitar acceso. Verificar solicitud pendiente, aprobación, suspensión y baja con dos usuarios de grupos distintos.

### S3. “Users can update seen_by” autoriza más que vistos
La política UPDATE de drive_reports permite a un miembro actualizar filas del grupo. Hay permiso UPDATE sobre title y no una restricción de columnas que limite esta política a seen_by.

Impacto: el nombre de la política no impide modificar contenido o metadatos ajenos. Además, la política DELETE existente permite borrar reportes a cualquier miembro, lo que debe contrastarse con el modelo de negocio esperado.

Cambio: normalizar lecturas en una tabla usuario/reporte con unicidad y RLS propia, o usar una operación que solo modifique la marca del usuario. Mantener edición y borrado de contenido bajo reglas explícitas.

### S4. Motor local expuesto y acceso a archivos
Evidencia:
- `python-engine/start.py` arranca uvicorn con host 0.0.0.0 y --reload.
- `python-engine/main.py:34` acepta cualquier origen.
- `get_vault_file`, línea 497, usa vault_root y path del cliente sin verificar contención.
- Otros endpoints aceptan rutas para ingestión, escritura, borrado y renombrado.

Impacto: el proceso puede quedar accesible por red según firewall; rutas arbitrarias pueden salir del vault. CORS por sí solo no es autenticación.

Cambio: escuchar en 127.0.0.1, generar credencial efímera desde Tauri, permitir orígenes concretos, fijar vault permitido en el servidor, resolver rutas y rechazar escapes incluyendo enlaces simbólicos. Usar selección nativa para autorizar importaciones. Retirar reload del arranque de producción.

### S5. Privacidad y avisos adicionales
- profiles permite SELECT público con condición true y anon tiene SELECT sobre email. Eliminar exposición pública de correos y separar campos públicos.
- group_members permite SELECT a cualquier authenticated con condición true. Restringir al ámbito que necesite cada usuario.
- Tres tablas tienen RLS sin políticas: report_comments, report_knowledge_links, report_task_links. Esto restringe acceso normal; no es una fuga. Si se usan, sus funciones pueden aparecer vacías o fallar.
- Cuatro funciones tienen search_path mutable.
- handle_new_user aparece como SECURITY DEFINER ejecutable por anon y authenticated. Revisar el tipo y propósito antes de concluir explotación; no se ejecutó esta función.
- OTP de correo con vencimiento superior a una hora; protección de contraseñas filtradas deshabilitada.

Referencias de remediación:
[Permisos RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[funciones expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Rendimiento web

### P1. Servidor y base en continentes distintos
Vercel reporta regions=[iad1] para el deployment activo. Supabase está en eu-west-1. El servidor hace consultas remotas para sesión, layout y contenido; la distancia añade latencia a cada etapa.

Cambio prioritario: probar ejecución de funciones en una región europea próxima a Irlanda, preferentemente Dublín cuando esté disponible para la configuración elegida. Medir TTFB y duración de consultas antes/después. Es una causa probable sustentada por configuración; no se midió la mejora ni se atribuye todo el retraso a esta distancia.

[Guía de regiones de Vercel](https://vercel.com/docs/functions/configuring-functions/region).

### P2. Ruta crítica de autenticación y datos
Archivos:
- `src/proxy.ts` y `src/lib/supabase/middleware.ts`: getUser antes de continuar la petición.
- `src/app/page.tsx`: vuelve a autenticar, consulta grupos y redirige.
- `src/app/(platform)/[groupId]/layout.tsx`: sesión y cinco consultas para rol, rol del sistema, grupos, nombre y configuración.
- Dashboard: espera rol y luego siete consultas en paralelo, todas antes de devolver el contenido.
- Drive Reports llama getUser directamente y ejecuta reportes y configuración en serie.

Hay mejoras existentes que conviene conservar: createClient/getUser con React.cache y rol de grupo deduplicado por petición. Esta caché no elimina el trabajo de otra petición del proxy ni de las redirecciones.

Cambios:
1. Usar el helper getUser coherentemente dentro de una petición.
2. Unir full_name y system_role en una sola consulta; reutilizar nombre/configuración del grupo cuando corresponda.
3. Paralelizar consultas independientes y renderizar widgets bajo límites de Suspense.
4. Mantener autorización en cada operación; no sustituirla por datos de sesión sin verificar.
5. Evitar redirecciones adicionales cuando se conoce un grupo válido.
6. Instrumentar cada etapa con tiempos y correlation id. No almacenar contenido privado en caché global compartida.

El loading.tsx existente muestra un indicador; no hace que el dashboard entregue sus widgets por separado.

### P3. Listas pesadas sin paginación
`src/features/samples/actions.ts:228` carga todas las muestras y todas sus characterizations.data; `sample-grid.tsx:481` renderiza el árbol con map. El filtrado vuelve a recorrer datos y serializa attributes. Drive Reports carga todos los reportes con tareas y asignados relacionados.

Impacto actual: trabajo y transferencia innecesarios. Impacto al crecer: bloqueo de interfaz, respuestas más grandes y posible truncamiento por límites de API.

Cambios:
- Lista de 50–100 filas con cursor y columnas explícitas.
- Resumen de técnicas y conteos; cargar data de caracterizaciones al abrir detalle.
- Para genealogía, obtener estructura ligera y cargar ramas; no paginar arbitrariamente rompiendo padres e hijos.
- Virtualizar filas cuando haya suficiente volumen.
- Separar detalle de tareas/reportes de la vista de lista.
- Buscar en servidor o usar índice de búsqueda ligero; evitar JSON.stringify por fila y pulsación.

### P4. Carga científica demasiado amplia
`desktop-map-analyzer.tsx` importa estáticamente comparación, fitting, deconvolución, pipeline, RGI y RGI2. `sample-grid.tsx` importa estáticamente RamanWorkspace y varios diálogos.

Plotly ya usa dynamic import en distintas vistas: eso es positivo. Aun así, el build genera un chunk con Plotly de **4.624.500 bytes**, equivalente a **1.371.897 bytes con gzip calculado localmente**. No es tamaño Brotli real ni todo el JS inicial del dashboard. Sus referencias aparecen en los manifiestos de Samples y Map Analyzer; requiere trazado de red para saber cuándo se descarga en cada flujo.

Cambios:
- Importar cada herramienta y diálogo cuando se abre.
- Crear un componente común de Plotly con solo las trazas necesarias, validando todas las gráficas.
- Evitar montar componentes ocultos que disparan cargas.
- Comparar bundles por ruta antes/después; no asumir que quitar una dependencia reduce código si otra vista sigue importándola.

### P5. Carga de terceros y caché
GoogleScriptPreloader se monta para todos los grupos y carga scripts de Google inmediatamente; puede competir por CPU/red aunque el usuario no abra Drive. Retrasar a tiempo ocioso o intención de navegación y medir la diferencia.

loadGoogleScripts guarda una promesa rechazada sin restablecerla: tras un fallo transitorio, las llamadas posteriores reutilizan el rechazo hasta recargar. Añadir recuperación y límite de espera.

staleTimes en next.config.js ayuda a reutilizar rutas del cliente; no optimiza consultas de base, primer acceso o cálculo científico. No es solución al TTFB.

La fuente Inter se descarga durante build mediante next/font; el build restringido falló por red. Si se necesita compilación reproducible sin internet, empaquetar fuente local. No atribuirle una descarga externa de fuente en cada visita: el login publicado sirve la fuente desde /_next/static/media.

## Supabase: datos reales y optimización

Inventario aproximado: 121 muestras, 134 caracterizaciones, 27 tareas, 21 reportes Drive, 91 elementos de conocimiento y 13 workspaces. Las tablas principales inspeccionadas ocupan cientos de KB incluyendo índices. No hay evidencia de que el volumen actual exija ampliar el plan.

### Registros agregados de las últimas 24 horas

| Endpoint | Solicitudes | Media origen ms | Máximo ms |
|---|---:|---:|---:|
| GET /auth/v1/user | 122 | 80,83 | 660 |
| POST /auth/v1/token | 29 | 629,90 | 818 |
| GET /rest/v1/group_members | 31 | 137,68 | 675 |
| GET /rest/v1/profiles | 29 | 115,48 | 693 |
| GET /rest/v1/groups | 29 | 138,83 | 358 |
| GET /rest/v1/tasks | 7 | 253,00 | 336 |
| GET /rest/v1/drive_reports | 5 | 259,20 | 360 |
| GET /rest/v1/samples | 4 | 277,50 | 434 |

No sumar estas medias como si fueran una sola navegación: son peticiones distintas y algunas se ejecutan en paralelo. La frecuencia de auth merece trazado; estos agregados no demuestran por sí solos un bucle de renovación.

### Avisos de rendimiento del proyecto
- 30 claves foráneas sin índice de cobertura.
- 97 avisos auth_rls_initplan.
- 121 avisos multiple_permissive_policies. Son combinaciones de tabla/rol/operación; no 121 políticas distintas.
- 33 índices sin uso registrado. No eliminarlos automáticamente: estadísticas y ventana de uso pueden no representar necesidades futuras.

Priorizar sample_characterizations(sample_id), samples(logbook_id), samples(parent_id), raman_workspaces(group_id) y group_notes(group_id), evitando duplicar índices existentes. Para listas considerar índices compuestos adaptados al filtro y orden, por ejemplo samples(group_id, logbook_id, created_at, id). Confirmar utilidad con planes bajo el rol real.

sample_characterizations registra 64.337 seq_scan frente a 195 idx_scan. Es un indicio para revisar joins repetidos, no prueba de una consulta lenta: con solo 134 filas un escaneo secuencial puede ser la decisión correcta.

Optimizar auth.uid por consulta cuando sea independiente de la fila, declarar roles explícitos y consolidar políticas solapadas preservando semántica y aislamiento. No desactivar RLS para ganar velocidad.

[Índices de claves foráneas](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[evaluaciones repetidas](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
[políticas permisivas múltiples](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies),
[índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Escritorio y motor científico

### D1. El empaquetado actual no tiene una arquitectura de producción coherente
tauri.conf.json apunta frontendDist a ../out y ejecuta npm run build. Next.js no tiene output export; genera .next, y out no existe. Además hay cookies, Server Actions y rutas API dinámicas que requieren servidor.

No basta con añadir output export: rompería capacidades que necesitan ejecución del servidor. [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports) y [Tauri con Next.js](https://v2.tauri.app/start/frontend/nextjs/).

Opciones:
- Mantener Next.js para web y construir cliente desktop estático con componentes compartidos y API remota explícita. Recomendación para evolución y trabajo científico local.
- Empaquetar servidor Node junto a Tauri y Python: conserva más código, pero añade procesos, tamaño, actualizaciones y gestión de puertos.
- Cargar web remota en Tauri: requiere diseñar autenticación y permisos nativos para contenido remoto; no resuelve trabajo sin conexión.

No se compiló el instalador Rust; el hallazgo es la incompatibilidad de configuración y salida observada.

### D2. Detección de entorno incorrecta
src/lib/desktop.ts considera desktop cualquier localhost/127.0.0.1 y solo comprueba __TAURI__ como otra opción. La web local se confunde con escritorio y una instalación Tauri puede usar un origen diferente sin ese global.

Cambio: usar detección oficial del runtime Tauri y capacidades explícitas; distinguir desarrollo web de desktop. El servidor no debe decidir permisos nativos a partir de un hostname.

### D3. El motor Python se inicia manualmente
src-tauri/src/lib.rs registra diálogo y shell, pero no inicia ni supervisa Python. El README exige otro comando manual. checkEngineHealth tiene timeout de 2 segundos; muchas operaciones de desktop.ts no tienen cancelación ni plazo.

Cambio: empaquetar y supervisar proceso científico con Tauri, readiness, puerto acordado, token efímero, salida ordenada y mensajes de recuperación. Separar arranque de aplicación y disponibilidad de análisis. Resolver dependencias científicas reproducibles: requirements usa límites mínimos sin bloqueo de versiones.

### D4. Procesamiento y transferencia de mapas
- /api/map/all-spectra lee la matriz completa y la convierte a listas JSON.
- comparison-view.tsx descarga todos los archivos seleccionados con Promise.all al activar todos los espectros, sin límite de concurrencia.
- Varias operaciones HDF5 usan [:] sobre intensidades completas.
- /api/vault-files recorre rglob y abre cada HDF5 en cada listado; si no existe el subdirectorio pedido, retrocede a escanear todo el vault.
- async def ingest_file/ingest_group_files hacen lecturas y procesamiento síncrono en el bucle asíncrono. Los endpoints def normales ya se ejecutan mediante el mecanismo de hilos de FastAPI; no confundirlos con este problema.
- El analizador solicita logbooks, muestras completas y workspaces en serie.
- Los sondeos de progreso cada 500 ms pueden solaparse si la respuesta tarda; cancelar al salir y evitar solicitudes concurrentes.

Cambios:
1. Metadatos primero; espectro individual, región visible y resumen bajo demanda.
2. Matrices por bloques o formato binario cuando se necesiten completas; límites de puntos/trazas.
3. Reducción visual que preserve picos, separada de los datos de cálculo científico.
4. Concurrencia limitada según RAM y CPU; cola de trabajos largos, progreso por trabajo y cancelación.
5. Hilos para I/O bloqueante y procesos de trabajo cuando lo justifique la carga CPU; no multiplicar procesos sin controlar h5py/BLAS y memoria.
6. Catálogo local persistente con actualización incremental; no abrir cada archivo en cada navegación.
7. Cancelar fetch obsoletos; no limitarse a evitar setState tras desmontar.
8. Paralelizar los tres metadatos independientes del analizador y pedir solo campos de nombres.

Ejemplo de capacidad, no medición: 10.000 espectros × 2.000 puntos × 8 bytes son 160 MB solo de datos float64. Las listas Python, JSON y objetos JavaScript añaden memoria y copias. Se necesita un presupuesto explícito de tamaño por trabajo.

[Concurrencia en FastAPI](https://fastapi.tiangolo.com/async/).

## Arquitectura recomendada para ambas versiones

| Responsabilidad | Web | Desktop |
|---|---|---|
| Gestión de grupos, muestras, tareas y reportes | Next.js y Supabase con RLS | API compartida y caché de lectura |
| Archivos científicos grandes | Subida explícita si se ofrece ciencia remota | Vault local y motor Python supervisado |
| Análisis largo | Servicio/cola científica dedicada si se incorpora | Trabajos locales con límites y cancelación |
| Interfaz científica | Herramientas cargadas por demanda | Componentes compartidos con adaptador nativo |
| Sesión | Validación en servidor y por operación | Flujo de autenticación desktop definido |
| Sin conexión | Alcance explícito | Metadatos locales y sincronización con conflictos definidos |

Mantener lógica de dominio y componentes compartidos; aislar adaptadores de red, archivos, autenticación y entorno. No hace falta reescribir toda la aplicación para empezar a mejorar.

## Orden de ejecución propuesto

1. **Seguridad:** cerrar S1, S2 y S3 con pruebas de usuario ordinario, pendiente, administrador y dos grupos. Confinar el motor local antes de distribuir desktop.
2. **Web:** probar región europea, instrumentar tiempos y eliminar consultas/etapas redundantes. Separar widgets.
3. **Datos y bundles:** listas ligeras y paginadas, detalles bajo demanda, herramientas científicas por modo.
4. **Base:** índices selectivos y RLS optimizada con planes y pruebas de aislamiento. No borrar índices por el aviso de desuso.
5. **Desktop:** decidir arquitectura de producción, empaquetar/supervisar motor y corregir detección.
6. **Ciencia:** lectura por bloques, concurrencia limitada, catálogo del vault y presupuestos de memoria.
7. **Calidad:** ESLint TS/TSX, build, tipos y pruebas de flujos críticos en CI.

## Criterios de aceptación para validar las mejoras
Son objetivos propuestos, no resultados obtenidos:
- Medir acceso frío y caliente en producción para login → dashboard, navegación entre módulos y apertura de muestras.
- Registrar TTFB, LCP, INP, tamaño transferido, duración por consulta y cantidad de peticiones; comparar mismo equipo/red/datos.
- Objetivos web iniciales: LCP p75 ≤2,5 s, INP p75 ≤200 ms y CLS ≤0,1.
- Plotly no debe descargarse en dashboard/login ni antes de necesitar ciencia; comprobar con red real.
- Ningún usuario debe cambiar su rol de sistema o entrar a datos de un grupo pendiente/ajeno.
- Probar 100, 1.000 y 10.000 muestras en un entorno de prueba sin sacrificar genealogía.
- Probar mapas pequeños/medianos/grandes y registrar RAM máxima de Python y WebView, cancelación y retorno de memoria tras cerrar.
- Instalar desktop en equipo limpio sin Python/Node preinstalados si esa es la promesa de distribución.
- El build y la auditoría estática deben ser reproducibles y bloquear regresiones.

## Límites de la conclusión
No se dispone todavía de una traza completa autenticada que reparta cada segundo entre navegador, Next.js, red, Supabase y Python. Por ello no se prometen porcentajes de mejora ni se atribuyen segundos concretos a una causa aislada. Los fallos de políticas, la incompatibilidad de empaquetado, la región, el tamaño del chunk y las consultas amplias sí tienen evidencia directa.

