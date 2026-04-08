# Documento de Arquitectura - PhD Nexus LIMS
## Parte 3: La Interfaz Unificada (Next.js + Tauri)

### 1. El Paradigma del Código Único (Write Once, Run Everywhere)
El mayor desafío al crear un sistema híbrido (Web + Escritorio) suele ser el mantenimiento de dos códigos distintos. En este proyecto, eliminamos ese problema utilizando un enfoque de **código base unificado**.

Toda la interfaz gráfica que ya has diseñado (como se ve en tus capturas de pantalla de la bitácora, los botones de analitos y los parámetros del láser) está escrita en **Next.js (React)**. 
* **Para la Nube:** Vercel toma este código Next.js y lo publica como una página web tradicional.
* **Para el Escritorio:** Tauri toma **este mismo código exacto**, lo envuelve y lo compila como un archivo instalable (`.exe` para Windows, `.app` para Mac).

### 2. ¿Qué es Tauri y por qué es la elección correcta?


Tauri es un framework de construcción de aplicaciones de escritorio. A diferencia del estándar antiguo (Electron), Tauri no empaqueta un navegador Google Chrome completo dentro de tu aplicación. 

**Ventajas de Tauri para PhD Nexus:**
* **Ultra Ligero:** Utiliza el motor web que ya viene instalado de fábrica en tu sistema operativo (Edge WebView2 en Windows, WebKit en macOS). El instalador final pesará apenas unos 10-15 MB.
* **Eficiencia de Memoria (RAM):** Al no tener un Chrome oculto consumiendo recursos, Tauri deja casi toda tu memoria RAM libre. Esto es **crítico** porque necesitarás esa RAM para que Python procese matrices gigantescas de datos Raman.
* **Seguridad Nativa:** Por defecto, la interfaz web dentro de Tauri no puede leer tu disco duro. Tú debes habilitar explícitamente qué carpetas y comandos están permitidos en el archivo de configuración (`tauri.conf.json`).

### 3. Detección de Entorno (El "Cambio de Forma")
Dado que es el mismo código fuente, ¿cómo evitamos que un usuario en la página web pública haga clic en un botón que intenta leer su disco duro local (lo cual daría un error)?

La solución es la **Detección de Entorno**. En tu código de Next.js, creamos una variable global que detecta si la app se está ejecutando dentro de Tauri o en un navegador normal.

```javascript
// utilidades/entorno.js
export const isDesktopApp = typeof window !== 'undefined' && window.__TAURI__ !== undefined;