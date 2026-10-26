# Integraciones Google: revisión del 26 de octubre de 2026

## Alcance

Se revisaron la autenticación compartida, el explorador y selector de Drive, la sincronización de Knowledge, cargas y descargas usadas por Samples, Calendar/Meet, generación de Docs/Slides y selección de modelos Gemini en Nexus AI y Logbook. Esta entrega no realiza operaciones sobre archivos o calendarios reales ni modifica configuraciones de Google Cloud o Supabase.

## Correcciones implementadas

| Área | Problema | Cambio |
| --- | --- | --- |
| OAuth | Cerrar/bloquear un popup podía dejar la promesa pendiente e impedir los siguientes intentos | Manejo de `error_callback`, tiempo límite de 90 segundos, liberación y reintento |
| OAuth | Se reutilizaban tokens vencidos durante cinco minutos adicionales | Se respeta la caducidad con margen de 30 segundos; se valida el almacenamiento y se conserva memoria temporal si el navegador bloquea localStorage |
| OAuth | Una respuesta antigua podía restablecer credenciales tras cancelar o cambiar de cuenta | Invalidación de solicitudes en curso y comprobación de generación antes de aplicar el token |
| Sesión | El token Google podía sobrevivir al cierre de sesión o a un cambio de cuenta observado por el cliente | Limpieza del token, memoria de GAPI y sugerencia de cuenta; eliminación del correo de los mensajes de consola |
| Calendar | Se trataban todos los 403 como caducidad y se intentaba abrir otro popup después de una llamada asíncrona | Solo 401 invalida el token; no se repite automáticamente una escritura ni se borra la sesión ante permisos/cuotas |
| Calendar | Actualizar un evento suponía que la API ya estaba cargada | Actualización, creación y eliminación aseguran la carga de Calendar |
| Calendar | El token inicial de login podía carecer de permisos de Calendar | Las operaciones verifican los permisos necesarios; un token sin esa información requiere autorización en el flujo de usuario. Se mantiene la lista de permisos que ya pedía GIS |
| Knowledge | Se leía solo una página por carpeta y se ocultaban fallos individuales | Se recorren páginas y subcarpetas con concurrencia limitada, deduplicación y detección de escaneo incompleto; un fallo evita anunciar o enviar una sincronización parcial |
| Knowledge | El límite de recorrido devolvía resultados parciales como éxito | Límite explícito de 1000 lecturas con error, sin guardar la parte incompleta |
| Picker | `setAppId` recibía el identificador OAuth completo y el cargador no propagaba errores | Se usa el prefijo numérico de proyecto del identificador OAuth; carga esperable con error/timeout propagado al botón |
| Descargas | El token aparecía en enlaces `access_token=...` | Peticiones autenticadas por cabecera y descarga mediante URL local temporal; exportaciones con extensión correcta |
| Detalle Drive | Una revisión de un archivo anterior podía sustituir las del archivo actual | Descarte de respuestas antiguas y limpieza de historial al cambiar de archivo |
| Cargas compartidas | El archivo completo se convertía a Base64 y se concatenaba como texto | Multipart binario con Blob y límite aleatorio, sin la expansión Base64 del contenido |
| Gemini | Todo identificador que contuviera `2.5` se sustituía por `gemini-1.5-flash` | Se respeta el modelo configurado, sin sustituciones silenciosas |
| Gemini | La configuración proponía versiones antiguas y forzaba un modelo predeterminado sin verificar la cuenta | Identificador editable y obligatorio, sugerencias actualizadas y aviso de disponibilidad por cuenta. Si no hay modelo configurado ni `GOOGLE_GEMINI_MODEL`, se pide configurarlo antes de generar |

El cierre de sesión se detecta mediante los eventos de Supabase que recibe el componente. No constituye una revocación remota de tokens Google en otros dispositivos. La sincronización de Knowledge conserva categorías y etiquetas; el límite de escaneo impide truncar silenciosamente, pero un árbol muy grande requerirá un proceso de sincronización por lotes.

## Limitaciones y siguientes trabajos

- El SDK `@google/generative-ai` sigue siendo legado. Migrarlo a `@google/genai`, junto con streaming y el bucle de herramientas, requiere revisar el comportamiento completo del asistente; esta entrega corrige la selección de modelo, sin afirmar que migra el SDK.
- Los modelos Gemini disponibles dependen de la clave/cuenta. La documentación oficial consultada indica acceso condicionado a uso previo para modelos 2.5. Las sugerencias del formulario no garantizan acceso. No se ejecutaron generaciones ni se consumieron créditos para comprobar disponibilidad.
- El explorador principal ya pagina carpetas desde la entrega anterior. El panel de actividad y el selector interno alternativo tienen recorridos propios que necesitan unificar paginación/caché. El historial de revisiones sigue mostrando como máximo 20 revisiones por lectura; algunas revisiones de documentos nativos requieren exportación específica.
- El generador Docs/Slides conserva inicialización compatible con los flujos existentes. Faltan pruebas con documentos reales de plantillas, permisos, errores parciales y limpieza de un documento creado si falla su población.
- La carga multipart evita Base64, pero no añade recuperación de transferencias grandes interrumpidas. Para archivos grandes, el siguiente paso es una sesión de carga reanudable.
- Se conserva `next-env.d.ts` modificado por la sesión de desarrollo local. No forma parte de esta entrega.

## Verificación

`npm run test:google` ejecuta pruebas controladas de OAuth simultáneo, cancelación, timeout, caducidad, permisos de Calendar, respuesta antigua tras cancelación, paginación completa, fallos de escaneo, carga binaria, descargas sin token en URL, Picker y selección de modelo. No se usan cuentas, claves ni documentos reales.

Las pruebas de carga, Samples y desktop se mantienen como regresión. TypeScript, ESLint y la compilación de Vercel verifican la integración. Esto no sustituye una prueba autenticada con consentimiento, API habilitada y permisos efectivos en web o Tauri.

## Git y reversión

Base: `desktop-loading-2026-10-26` (`dadfc58`). Rama: `codex/google-integrations-reliability`. Etiqueta final: `google-integrations-2026-10-26`.

Revertir la entrega completa: `git revert --no-commit desktop-loading-2026-10-26..google-integrations-2026-10-26`, revisar, crear el commit y publicar. No hay cambios SQL ni permisos nuevos que revertir.

## Fuentes oficiales consultadas

- [Google Identity: callbacks de autorización y errores de popup](https://developers.google.com/identity/oauth2/web/reference/js-reference).
- [Google Drive: errores 401, 403 y cuotas](https://developers.google.com/workspace/drive/api/guides/handle-errors).
- [Google Picker: identificador de aplicación](https://developers.google.com/workspace/drive/picker/reference/picker.pickerbuilder.setappid).
- [Google Drive: multipart y cargas reanudables](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
- [Gemini: catálogo de modelos](https://ai.google.dev/gemini-api/docs/models).
- [Gemini: calendario de retiradas](https://ai.google.dev/gemini-api/docs/deprecations).
