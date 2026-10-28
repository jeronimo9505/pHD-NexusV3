# Renovación Google Drive en Tauri — 2026-10-28

## Causa y solución

Raman intentaba autorizar Google dentro del WebView, abandonaba a los tres segundos y omitía subidas sin dejarlas pendientes. La sesión Supabase se renovaba, pero no el acceso Drive. Una edición podía perder el enlace anterior.

Se implementó OAuth desktop nativo con navegador predeterminado, receptor temporal 127.0.0.1 en puerto libre, estado aleatorio, PKCE S256 y consentimiento offline. Solo se solicita `drive.file`. El JSON se importa en el Administrador de credenciales Windows; no se copia a Git ni Supabase. Las credenciales renovables permanecen en Rust y el almacén seguro del sistema, separadas por usuario PhD Nexus y grupo. JavaScript recibe únicamente el permiso temporal. Keychain macOS está incluido pero no probado aquí.

La renovación se serializa, respeta la caducidad con margen de un minuto, se realiza al necesitarla y se comprueba periódicamente con la app abierta. Un 401 permite renovar y repetir una vez. La revocación exige reconectar explícitamente; no se abre Google automáticamente al guardar.

## Referencias pendientes

Raman conserva el enlace previo y guarda primero la caracterización en Supabase con `raman_drive_sync`: identidad del trabajo/usuario, estado pendiente, espectro representativo y parámetros. No sube H5 completos. El sincronizador procesa solo pendientes del usuario/grupo actuales, con sesión y membresía activa comprobadas en servidor.

Se activa al guardar, conectar Google, recuperar internet, volver a la ventana y cada minuto. Se reserva un ID Drive y se guarda antes de subir; los reintentos usan el mismo ID. Un 409 requiere verificar que el archivo sea del mismo trabajo. El enlace se actualiza únicamente al confirmar Drive. La actualización compara la instantánea completa para no pisar ediciones concurrentes y retira el cuerpo pendiente al completar. Una referencia inaccesible no bloquea las demás.

Las tareas sobreviven al cierre porque están en Supabase; se retoman al abrir la app y conectarse. No hay servicio de Windows que sincronice con la app cerrada. Se indica pendiente en el detalle y existe reintento explícito con errores visibles.

Una edición genera una referencia nueva, conservando los archivos de versiones anteriores. Un trabajo reemplazado durante una subida puede dejar su archivo en Drive, pero no sustituye el enlace de la edición actual. La deduplicación cubre reintentos del mismo trabajo, no el borrado del historial. Desconectar retira la conexión local, sin revocar consentimiento remoto ni borrar archivos.

## Activación

1. Reiniciar `tauri dev` para cargar los comandos Rust. Un deployment Vercel no actualiza el ejecutable desktop.
2. Abrir una caracterización Raman o Settings → Google Drive Integration.
3. Pulsar **Importar JSON desktop** y seleccionar el JSON ya descargado de Google Cloud, fuera del proyecto.
4. Pulsar **Conectar en navegador de Windows**, elegir la cuenta con acceso a la carpeta configurada y autorizar.
5. Volver a Tauri y pulsar **Comprobar renovación**. Debe confirmar sin nueva ventana. Guardar una caracterización y verificar que pasa de pendiente a enlazada.

La sesión de entrada a PhD Nexus, Calendar, Docs/Slides y la autorización web conservan sus flujos. Esta entrega implementa renovación **nativa desktop**, no un servidor OAuth compartido para todos los navegadores.

Si la cuenta no puede escribir en la carpeta, el trabajo queda pendiente. Si Google Cloud mantiene una aplicación externa en Testing, puede limitar la duración de la credencial renovable. No se cambió ese estado ni se promete acceso perpetuo ante revocaciones o políticas administrativas.

## Verificación y límites

La prueba real previa confirmó recepción de refresh token y renovación aceptada por Drive, fuera de Tauri. `npm run test:raman-drive` comprueba el adaptador nativo/401, detección de Tauri, guardado previo a Drive, enlace anterior, doble clic, fallo de guardado, respuesta perdida, ID persistido, confirmación, membresía y ediciones concurrentes.

`cargo check --manifest-path src-tauri/Cargo.toml --locked` y `cargo test --manifest-path src-tauri/Cargo.toml --lib google_drive::tests --locked` comprueban la integración nativa y el almacén Windows con valores sintéticos que se retiran al terminar. Regresiones: Google, Samples, desktop, Vault y plantillas; TypeScript, ESLint y compilación Vercel.

No se subieron referencias científicas reales como parte de las pruebas automatizadas. Queda validar autorización y subida desde Tauri después de reiniciar/importar/conectar. No se generó instalador ni se comprobó macOS.

## Git y reversión

Base `pipeline-templates-cloud-2026-10-28` (`063fbe2`). Etiqueta final `google-desktop-renewal-2026-10-28`.

Revertir con `git revert --no-commit pipeline-templates-cloud-2026-10-28..google-desktop-renewal-2026-10-28`, revisar, crear commit y publicar; recompilar desktop. No hay migración SQL. Los datos y pendientes permanecen. Usar **Desconectar en este equipo** antes de revertir para retirar la conexión Windows. Se excluyen `next-env.d.ts`, la captura del formulario y el JSON de credenciales.

Fuentes: [OAuth desktop Google](https://developers.google.com/identity/protocols/oauth2/native-app), [almacenes seguros keyring](https://docs.rs/keyring/3.6.3/keyring/).
