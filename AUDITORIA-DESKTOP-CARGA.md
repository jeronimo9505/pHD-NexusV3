# Carga desktop: revisión del 26 de octubre de 2026

## Qué muestran los registros compartidos

Tauri abre `http://localhost:3000` y ejecuta `npm run dev`, que inicia Next en desarrollo. Next compila las rutas al abrirlas; ese coste no representa el frontend compilado. Los mensajes de petición describen trabajo de servidor y autenticación, no el renderizado del WebView.

| Pantalla | Tiempo total observado | Next.js | Proxy | Código de aplicación |
| --- | --- | --- | --- | --- |
| Samples | 3,9 s | 3,3 s | 100 ms | 547 ms |
| Tasks | 1547 ms | 1197 ms | 138 ms | 211 ms |
| Settings | 2,3 s | 1518 ms | 91 ms | 643 ms |
| Dashboard de grupo, una apertura | 1148 ms | 94 ms | 88 ms | 965 ms |

La compilación domina las primeras aperturas mostradas de Samples y Tasks. Dashboard conserva un coste de consultas/autenticación que sí merece atención. Estos números no miden FPS, bloqueo del hilo principal, hidratación o tiempo hasta mostrar todos los datos. Tampoco bastan para atribuir dos GET de Dashboard a una única causa sin una traza de navegación.

La advertencia `Auth session missing` durante la pantalla de login puede corresponder a una petición sin sesión. No se ha eliminado la validación de sesión ni cambiado cookies para ocultarla.

## Correcciones de esta entrega

- `SessionTracker` antes marcaba la visita como enviada al terminar la promesa. Dos ejecuciones del efecto podían enviarla antes de esa marca, especialmente con Strict Mode en desarrollo. Ahora se programa en tiempo ocioso, se cancela el efecto descartado y se deduplica por usuario y grupo, tanto en curso como durante cuatro horas tras un resultado correcto.
- Los errores de lectura o inserción de visitas no se consideran éxito. El servidor conserva su comprobación de cuatro horas y usa una sola identidad autenticada para insertar; evita la segunda consulta de usuario del anterior ayudante genérico. La deduplicación de cliente no garantiza unicidad entre dispositivos o pestañas distintas.
- Admin recibe la primera instantánea desde el servidor. Se eliminan cuatro Server Actions de lectura al montar el cliente. Un refresco explícito usa una sola acción con lecturas concurrentes y una comprobación de administrador. Los errores de estadísticas se muestran como error, no como ceros aparentes.
- La redirección inicial al grupo predeterminado comprueba su membresía activa antes de consultar el directorio completo. `noredirect=true` conserva el selector; una membresía no activa no concede acceso.
- Cuando se necesita el directorio, grupos y membresías se consultan en paralelo.

## Comparación con frontend compilado

Comando nuevo, desde la raíz del proyecto:

```powershell
npm run tauri:perf
```

Antes, terminar con Ctrl+C la sesión actual de Tauri/Next que usa el puerto 3000. El comando nuevo compila una vez con `next build --webpack` y ejecuta `next start` en el mismo puerto. Mantiene el origen de OAuth existente, los servicios de servidor y el motor científico. La primera compilación tarda; la comparación de navegación empieza cuando termina y abre la ventana.

La configuración es una variante de `tauri dev`: Rust sigue siendo de desarrollo y no se genera un instalador. `--no-watch` evita recompilaciones de Rust durante la comparación. El comando habitual `npm run tauri -- dev` conserva el flujo de edición y recarga rápida. No ejecutar ambos a la vez: usan la misma salida `.next` y el mismo puerto.

El ayudante comprueba IPv4/IPv6 antes de compilar y aborta si el puerto está ocupado. Durante esta revisión, la ejecución con acceso al entorno real encontró el puerto ocupado y se detuvo sin cerrar la sesión del usuario. No se ha completado una navegación autenticada dentro del nuevo modo.

## Métricas de la ventana

Solo el comando de comparación activa `NEXT_PUBLIC_NEXUS_PERFORMANCE=1` al compilar. El componente de diagnóstico escribe `[Nexus performance]` en la consola de las herramientas de desarrollo del WebView:

- TTFB: espera inicial de respuesta.
- FCP y LCP: aparición de contenido y del elemento principal del documento.
- INP: respuesta a interacciones, cuando hay interacciones elegibles.
- CLS: desplazamientos de contenido.

Los datos permanecen en esa consola; no se envían a Supabase ni a un servicio externo y no incluyen identificadores de usuario o grupo. Estas métricas estándar describen el documento y no proporcionan por sí solas un LCP nuevo para cada transición interna entre módulos. Comparar primera apertura y revisita por separado. No se han calculado porcentajes de mejora del WebView.

## Límite del empaquetado actual

`tauri.conf.json` declara `frontendDist: ../out`, pero el proyecto usa rutas dinámicas y Next de servidor, cuya compilación normal produce `.next`. El funcionamiento de `tauri dev` no valida el empaquetado de un instalador. Esta entrega prepara la comparación de frontend compilado; una distribución desktop definitiva necesita resolver explícitamente el alojamiento del servidor Next y el ciclo de vida del motor científico.

## Verificación y reversión

Pruebas controladas: `npm run test:desktop`. Verifican concurrencia, aislamiento por usuario/grupo, expiración, reintento, errores de persistencia, autorización de Admin, redirección al grupo predeterminado y configuración del comando compilado. No insertan datos en producción.

Base recuperable: `samples-targeted-updates-2026-10-26` (`919e437`). Rama: `codex/desktop-loading-audit`. Etiqueta final prevista: `desktop-loading-2026-10-26`.

Para revertir toda la entrega: `git revert --no-commit samples-targeted-updates-2026-10-26..desktop-loading-2026-10-26`, revisar el resultado, crear el commit y publicar. No hay cambios SQL que revertir.

## Referencias

- [Next.js: desarrollo local frente a producción](https://nextjs.org/docs/app/guides/local-development).
- [Next.js: useReportWebVitals](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals).
- [Tauri: modo de desarrollo](https://v2.tauri.app/develop/).
