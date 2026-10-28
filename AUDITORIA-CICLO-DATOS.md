# Ciclo de mediciones y trazabilidad — 28 octubre 2026

## Problemas encontrados

La importación WIP asignaba un UUID como nombre visible del HDF5, mientras la carga manual construía nombres por parámetros. El archivo WIP se almacenaba bajo una carpeta SHA-256 larga. La eliminación de una caracterización quitaba la fila de Supabase sin coordinar los archivos locales. Las rutas y metadatos tenían varias representaciones sin un manifiesto común.

## Contrato para nuevos datos

Ambas cargas utilizan `vault_naming.py`, `prepareCharacterizationSave` y `createCharacterizationAction`. El identificador interno permanece separado del nombre visible. Ejemplo:

`A24_RAMAN_632.8nm_500uW_50x_0.5s_1ac_50x50ixj_50x50um_Spot1.h5`

Se conservan los parámetros disponibles en su orden habitual. Los puntos decimales son válidos; µ se convierte en u, se quitan caracteres prohibidos y se limita la longitud según la ruta. Nuevas adquisiciones reciben Spot2, Spot3…; el mismo objeto WIP/muestra se reconoce mediante su identidad interna y no se crea de nuevo por cambiarle el nombre. Una colisión adicional obtiene un sufijo sin sobrescribir. Si la raíz es demasiado larga para un nombre útil, se pide una raíz más corta.

Los proyectos se guardan en `WITec Projects/Projects/<nombre>.wip`. Un contenido distinto con igual nombre recibe `(2)`. El hash sigue identificando el contenido dentro del índice, sin convertirse en carpeta. Al reabrir un proyecto antiguo se adapta su carpeta de archivo al formato legible; no se recorren ni cambian masivamente los archivos existentes.

## Supabase y portabilidad

`data.asset_manifest` versión 1 conserva técnica, parámetros revisados, archivos, identificadores, SHA-256, dimensiones, rango espectral real, metadatos originales y relación con el archivo padre cuando existe. WIP conserva además proyecto, objeto, calibración, imágenes originales/anotadas y elecciones de importación. La precisión de adquisición permanece intacta; el nombre y la presentación del láser usan una cifra decimal.

Las ubicaciones operativas se expresan como raíz lógica y ruta relativa (`data_vault`, `witec_library`). Las ubicaciones absolutas históricas quedan como procedencia, no como configuración obligatoria. En otro ordenador se seleccionan las mismas carpetas sincronizadas desde Local Desktop Settings. Las rutas antiguas pueden reconectarse por un sufijo único bajo la nueva raíz; una coincidencia ambigua no se acepta.

El manifiesto ofrece una base para futuras cadenas del Map Analyser; este cambio no modifica sus algoritmos. Los datos voluminosos siguen locales/sincronizados. Supabase guarda metadatos, relaciones y recibos, no los espectros binarios ni los WIP.

## Guardado y eliminación

Cambiar nombre o parámetros prepara copias verificadas antes de guardar Supabase. El archivo antiguo continúa funcionando hasta confirmar el registro. Después se trasladan sus versiones anteriores no compartidas a `.phdnexus-recovery`; quedan recibos locales y en Supabase. Si falla el guardado, se conservan los originales. Un corte abrupto puede dejar copias preparadas visibles en la revisión de archivos; no hay una transacción distribuida entre Windows y Supabase.

Eliminar una caracterización primero crea una instantánea íntegra y elimina su fila en una transacción de Supabase. Después el escritorio mueve sus archivos no compartidos a recuperación. Si el motor o la raíz no están disponibles, la limpieza queda pendiente. Las referencias de otras caracterizaciones y workspaces, incluidos los ancestros de resultados derivados, protegen los archivos. Los proyectos fuente WIP nunca forman parte de esa limpieza. No se elimina nada definitivamente.

## Datos antiguos: revisión voluntaria

En Samples → **Vault files**:

- **Unlinked**: HDF5 del grupo sin referencias activas. **Recover & normalize name** permite seleccionar muestra y recuperar metadatos con el nombre común. **Move to recovery** conserva una instantánea antes de apartar los archivos.
- **Referenced**: archivos con referencias activas, incluidos padres de resultados derivados.
- **Deleted records**: permite completar limpieza pendiente o restaurar registro y archivos disponibles. Si la muestra original ya no existe, los archivos restaurados pueden recuperarse desde Unlinked hacia otra muestra.

El escaneo es bajo demanda, no ocurre al cargar Samples. Solo se clasifican HDF5 cuya pertenencia al grupo es verificable. No se borran PNG sueltos sin procedencia demostrable ni se busca fuera de la raíz elegida. El listado de eliminaciones muestra las 200 más recientes. La recuperación necesita los archivos locales o la carpeta de recuperación sincronizada; los metadatos por sí solos no reconstruyen espectros perdidos.

No se han renombrado ni eliminado masivamente los datos reales existentes mediante esta actualización. Reiniciar el motor Python para activar los nuevos servicios; la interfaz web se actualiza por Vercel.

## Validación y reversión

Pruebas: biblioteca (8), importador WIP (8, incluyendo los 22 objetos Raman del ejemplo), ciclo local (5), geometría, parámetros/autocompletado, manifiesto compartido, regresión Samples, TypeScript y ESLint dirigido. Los tests usan copias temporales; el WIP privado permanece intacto. La comparación espectral es contra los arreglos del decodificador, no una equivalencia certificada con exportación TXT del fabricante. Pruebas SQL transaccionales con ROLLBACK verifican borrado, permisos, reintentos, restauración y confirmación de recibos sin perder parámetros.

Las migraciones son `characterization_asset_lifecycle.sql` y `characterization_asset_confirmation.sql`. Las nuevas operaciones usan RLS, membresía activa y funciones SECURITY INVOKER. Los asesores no señalaron los objetos nuevos; existen avisos anteriores de otros módulos y de configuración Auth, fuera de este cambio.

Base anterior: `65066e9` / etiqueta `witec-library-2026-10-28`. Para volver, revertir el commit de esta actualización y desplegar. Revertir Git no deshace movimientos de archivos. Conservar `.phdnexus-recovery`, `.phdnexus-operations`, el índice WITec y la tabla `characterization_recovery`. `db/rollback/characterization_asset_lifecycle.sql` retira las funciones nuevas después de revertir la aplicación, conservando las instantáneas. No usar reset destructivo ni borrar la tabla de recuperación.
