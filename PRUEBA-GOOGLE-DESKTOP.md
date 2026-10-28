# Prueba aislada de Google con navegador de Windows

Esta prueba no cambia el login de PhD Nexus, no sube datos Raman y no crea ni modifica archivos Drive. Comprueba el acceso inicial y un intercambio real de credencial de renovación, seguido de una consulta mínima a Drive. No sustituye la prueba final integrada en Tauri ni demuestra que Google nunca pueda revocar permisos.

## Preparación

1. En https://console.cloud.google.com/auth/clients selecciona el proyecto Google usado por PhD Nexus.
2. Crea un cliente separado de tipo **Aplicación de escritorio**, llamado **PhD Nexus — prueba desktop**. No cambies ni elimines el cliente actual.
3. Descarga el JSON y guárdalo fuera del repositorio, por ejemplo en Descargas. No lo pegues en el chat ni lo añadas a Git. Si la aplicación es externa y está en Testing, la cuenta que autorice debe estar entre sus usuarios de prueba.
4. Indica únicamente la ruta local del archivo. Google Drive API debe estar habilitada en ese proyecto.

## Ejecución

Desde el proyecto:

```powershell
node scripts/google-oauth-probe.mjs --credentials 'C:\Users\jeron\Downloads\cliente-prueba.json'
```

Abre una página en el navegador predeterminado de Windows. Allí se pulsa **Conectar Google para la prueba**, se elige cuenta y se acepta el permiso. Google vuelve a una página local de prueba, sin introducir las credenciales dentro del WebView de Tauri.

Luego se pulsa **Probar renovación sin otra ventana**. La prueba solicita un token nuevo mediante refresh_token y verifica que Drive lo acepta. No hay que esperar una hora para comprobar ese mecanismo. Puede repetirse para observar varias renovaciones. Que pase esta prueba no equivale a haber probado varias horas de uso real ni a haber integrado la renovación en la app.

Solo se pide drive.file y solo se consulta el tipo de respuesta de una lista de archivos; no se recuperan nombres ni contenidos. Los tokens se mantienen en memoria, no se muestran en la página ni se guardan. La prueba termina con Ctrl+C o a los 20 minutos; terminarla no revoca automáticamente el consentimiento de Google. El cliente de prueba puede retirarse después desde Google Cloud.

Para un cliente **web** en vez de desktop se requiere registrar exactamente `http://127.0.0.1:8765/oauth/callback` y descargar su JSON actualizado. La integración compartida web/desktop propuesta para producción necesitará sus propias credenciales de servidor y almacenamiento cifrado; este experimento no los instala ni configura.

## Verificación sin cuenta

`node scripts/test-google-oauth-probe.mjs` verifica PKCE, solicitud offline, renovación, consulta de solo lectura y errores sin secretos usando respuestas controladas. No inicia OAuth real.

## Reversión

No hay cambios de base ni de configuración de producción. Se agregan únicamente este documento y los scripts de prueba; se pueden retirar sin afectar el flujo actual. El JSON descargado permanece fuera del repositorio.

Fuentes: https://developers.google.com/identity/protocols/oauth2/native-app y https://developers.google.com/identity/protocols/oauth2/web-server.
