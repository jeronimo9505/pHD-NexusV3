# pHD-NexusV3 🔬

**PhD Nexus V3** es una plataforma avanzada de escritorio para la investigación y el análisis de espectroscopía (como SERS Au & G, Raman y deconvolución de picos). Combina una interfaz premium y ultra-reactiva construida en **Tauri + React (Next.js/Vite)** con un potente motor científico en **Python**.

---

## 💻 Arquitectura de la Aplicación

1. **Frontend (Desktop App)**: 
   - Desarrollado en React y empaquetado como aplicación nativa de escritorio ultraligera usando **Tauri** (en lugar de navegadores pesados tipo Electron).
2. **Backend (Science Engine)**:
   - Motor científico en **Python** para procesamiento pesado de datos espectrales, optimización de archivos HDF5 (`.h5`), y deconvolución/ajuste de curvas matemáticas de alta precisión.

---

## 🚀 Guía de Sincronización y Git (Sin Conflictos)

Si trabajas en **múltiples computadoras**, sigue estas pautas estrictas para evitar conflictos en el código y mantener todo sincronizado de forma limpia:

### 1. Clonar por primera vez en una computadora nueva
Si no tienes el proyecto en la computadora, abre tu terminal y ejecuta:
```bash
git clone https://github.com/jeronimo9505/pHD-NexusV3.git
```

### 2. Sincronizar cambios si ya tienes la carpeta localmente
Si ya estabas desarrollando en esa computadora y quieres fusionar los cambios de la nube sin sobrescribir ni perder tus modificaciones locales:

```bash
# 1. Guarda temporalmente tus cambios locales en el cajón seguro de Git (Stash)
git stash

# 2. Descarga y aplica de forma ordenada las actualizaciones de GitHub
git pull origin main --rebase

# 3. Vuelve a sacar tus cambios locales del cajón para aplicarlos encima
git stash pop
```
*💡 Nota: Si ocurre algún conflicto en el mismo fragmento de código, Git te avisará. Puedes abrirlo en VS Code y seleccionar visualmente qué cambio conservar de forma interactiva.*

### 3. Subir tus actualizaciones a GitHub
Cuando realices cambios locales y quieras guardarlos en el repositorio remoto:
```bash
git add .
git commit -m "Explicación breve de lo que cambiaste (ej: Ajustes en el motor Python)"
git push origin main
```

---

## 🛠️ Requisitos de Instalación

### Frontend (Tauri + Node.js)
1. **Node.js** (v20 o superior).
2. Instalar dependencias del proyecto:
   ```bash
   npm install
   ```
3. Instalar herramientas de compilación C++ de Visual Studio (MSVC) y el compilador de Rust (`rustup` / `cargo`) para que Tauri pueda compilar el ejecutable nativo `.exe`.

### Backend (Python Engine)
1. **Python 3.10+**.
2. Instalar dependencias científicas:
   ```bash
   pip install -r python-engine/requirements.txt
   ```

---

## 🏃 Cómo Ejecutar el Proyecto

### 1. Iniciar el Motor de Python (Ciencia)
Ejecuta el servidor de procesamiento en segundo plano:
```bash
python python-engine/start.py
```

### 2. Iniciar la Aplicación de Escritorio (Tauri)
En otra terminal en la raíz del proyecto, arranca el entorno de desarrollo de Tauri:
```bash
npm run tauri dev
```

---

## 🔒 Seguridad y Configuración
El archivo `.env` local contiene claves confidenciales de base de datos y la clave API anon de Supabase. **Nunca compartas ni subas este archivo a Git**. El archivo `.gitignore` está configurado para omitir automáticamente:
- Archivos `.env`
- Carpetas temporales `.next/` y `node_modules/`
- Compilaciones y binarios temporales de Rust / Python
- Archivos `.txt` y `.bak` generados durante pruebas
