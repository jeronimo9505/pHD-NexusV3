# Samples: creación y borrado confirmados

Revisión del 26 de octubre de 2026. Base Git: `google-integrations-2026-10-26` (`e5f22aa`).

## Problemas encontrados

- Crear una muestra esperaba varias consultas sucesivas y la reconstrucción de la página. La tabla podía tardar en mostrar un guardado ya realizado.
- La protección del botón no bastaba ante reintentos o solicitudes distintas. La asignación de códigos calculaba el siguiente número fuera de la transacción de inserción.
- El borrado individual no comprobaba filas afectadas ni acotaba explícitamente el grupo. Una respuesta sin error de transporte podía parecer un éxito sin haber eliminado nada.
- El borrado múltiple lanzaba acciones independientes y mostraba éxito cuando las promesas resolvían, incluso si contenían `{error}`. Podía borrar parcialmente la selección.
- La confirmación usaba `window.confirm`, dependiente del comportamiento del WebView, sin un estado de espera propio.
- La relación padre usa `ON DELETE SET NULL`: borrar un padre podía dejar sus derivadas sin genealogía.
- Los intentos de escribir el historial de creación no tenían una política INSERT en `sample_audit_log`; el error se ignoraba.
- La selección global comparaba cantidades y podía confundir IDs ocultos con las filas visibles. Los campos con `0` se mostraban vacíos por usar `|| ''`.

## Comportamiento nuevo

### Crear y editar

Cada borrador nuevo conserva un UUID durante sus reintentos. La creación usa ese UUID como identidad de fila. La función de base de datos serializa la asignación del código dentro del grupo, comprueba bitácora/padre, mantiene RLS y confirma creación e historial en una transacción. Repetir el mismo borrador ya guardado devuelve la misma muestra sin otra inserción ni otro historial. Si se cambia un borrador cuya petición ya se guardó, se pide actualizar la lista antes de editar esa muestra.

El formulario bloquea envíos, cierre y edición mientras espera. Un fallo conserva el borrador. Al confirmar el servidor, la tabla recibe la fila devuelta sin esperar a reconstruir toda la página. Se limpian búsqueda/filtro y se abren sus ancestros plegados para hacer visible la muestra nueva. El padre se valida dentro de la misma bitácora y grupo; se infiere su nivel en servidor.

No se promete deduplicación de dos borradores nuevos intencionales con UUID diferentes. Tampoco se identifican ni borran duplicados históricos por similitud: dos muestras físicas legítimas pueden tener idéntica composición.

### Eliminar

La app muestra un diálogo HTML modal con la lista exacta y botones explícitos. Abrirlo o cancelarlo no inicia ninguna eliminación. Mientras el servidor trabaja se bloquean nuevas confirmaciones y el cierre. Solo se retiran filas y selección después de recibir todos los identificadores confirmados.

La eliminación múltiple usa una sola operación transaccional, con grupo y bitácora explícitos. Si falta una fila, no hay permiso o se omitieron derivadas, no se elimina parcialmente. El diálogo permite incluir explícitamente la familia completa; no borra descendientes por sorpresa ni deja huérfanos deliberadamente.

Una pérdida de conexión después del commit puede impedir confirmar la respuesta en el navegador. En ese caso se pide refrescar antes de reintentar; no se muestra un éxito supuesto.

### Otros ajustes

- Las filas creadas no aparecen duplicadas cuando llega la instantánea del servidor; las eliminadas no reaparecen por una respuesta anterior. Una versión de edición más reciente del servidor prevalece sobre un parche local.
- “Seleccionar todo” actúa sobre las filas visibles y conserva las selecciones ocultas, que aparecen explícitamente en el diálogo de borrado.
- Se conservan los valores `0` y `false` de los atributos. Se evita arrastrar composición durante un guardado.
- Las API de Samples devuelven un error JSON de sesión vencida en lugar de redirigir silenciosamente una petición de escritura a HTML de login.

## Base de datos y seguridad

Migración aplicada: `sample_mutation_safety`. Fuente: `db/changes/sample_mutation_safety.sql`.

- `create_sample_safe` y `delete_samples_safe` son SECURITY INVOKER, con `search_path` vacío y ejecución revocada para PUBLIC/anon. No usan service role ni omiten RLS.
- Ambas exigen membresía activa. La creación no acepta un propietario enviado por el navegador.
- Se añadió INSERT de historial únicamente para el actor autenticado y muestras de sus grupos activos; las creaciones de historial deben corresponder a muestras de ese actor. No se permite atribuir un evento a otro usuario.
- Los códigos consideran tanto `sample_code` como `display_id` para no colisionar con identificadores conservados tras una edición. Se mantiene la unicidad existente por grupo.
- La revisión de integridad encontró cero enlaces padre entre grupos o bitácoras diferentes.
- La comparación de avisos de seguridad de Supabase antes/después no encontró avisos nuevos. Los avisos previos de otros módulos no se modificaron en esta entrega.

## Verificación

- `npm run test:samples`: doble envío pendiente, UUID conservado en reintento, borrador ante error, ausencia de cambios antes de confirmar, errores/confirmación de borrado, instantáneas antiguas, selección de familias, selección global con filtros y validación/autorización HTTP.
- `db/tests/sample_mutation_safety.sql`: funciones reales con rol authenticated, reintento del mismo borrador, cambio de petición, códigos diferentes, derivadas, borrado parcial rechazado, historial con actor incorrecto rechazado y membresía no autorizada. Se ejecutó antes y después de aplicar la migración; todos los datos de prueba se revirtieron con ROLLBACK.
- TypeScript y ESLint; suites existentes de carga, Google y desktop como regresión; compilación de Vercel.
- No se han eliminado muestras reales ni se ha completado una prueba destructiva de interfaz con la sesión del usuario. No se atribuyen porcentajes de mejora de tiempo.

## Reversión

Etiqueta de la entrega: `sample-mutation-safety-2026-10-26`.

1. Revertir la aplicación con `git revert --no-commit google-integrations-2026-10-26..sample-mutation-safety-2026-10-26`, revisar, crear el commit y publicar.
2. Solo después de restaurar una aplicación que no dependa de las funciones nuevas, aplicar `db/rollback/sample_mutation_safety.sql` como una nueva reversión registrada.
3. La reversión SQL elimina funciones y la nueva política de historial; no borra las muestras creadas. Git/Vercel no revierten SQL automáticamente.
