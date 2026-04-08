# Documento de Arquitectura - PhD Nexus LIMS
## Parte 4: El Motor Científico Local (Python "Sidecar")

### 1. El Concepto de "Sidecar" (El Copiloto)
En el desarrollo de aplicaciones de escritorio modernas, un "Sidecar" (coche sidecar de una motocicleta) es un programa secundario e independiente que viaja empaquetado junto a la aplicación principal. 

Para PhD Nexus, **Tauri es la motocicleta** (maneja la interfaz, los clics y la base de datos web), y **Python es el sidecar** (maneja la carga pesada, las matrices matemáticas y el procesamiento de espectros Raman). El usuario solo ve una aplicación, pero por debajo, son dos motores trabajando en perfecta sincronía.

### 2. La Comunicación: FastAPI (El Servidor Invisible)
Como se estableció en el diseño, la comunicación entre la interfaz (JavaScript/Rust) y el motor científico (Python) NO se hará imprimiendo texto en la consola de comandos, ya que esto bloquearía la aplicación al transferir matrices de 50,000 puntos de datos.

**La Solución:** Cuando el usuario abre la app de Tauri, esta ejecuta el sidecar de Python en segundo plano. Este script de Python levanta instantáneamente un mini-servidor web ultraligero usando el framework **FastAPI**, exclusivo para esa computadora (ej. en el puerto `localhost:8000`).



**Flujo de Comunicación:**
1. El usuario hace clic en "Procesar PCA" en la interfaz de Next.js.
2. Next.js hace una petición HTTP `POST` a `http://localhost:8000/process_pca`, enviando las rutas relativas de los archivos.
3. Python recibe la orden, carga los archivos del disco duro en milisegundos, ejecuta las matemáticas y devuelve un JSON con los ejes X e Y del gráfico PCA.
4. Next.js recibe el JSON y dibuja el gráfico instantáneamente usando librerías como Chart.js o Recharts.

### 3. El Stack Científico (Herramientas de Python)
El entorno de Python tendrá acceso ilimitado a las mejores librerías científicas del mercado, ejecutándose nativamente usando el procesador (CPU) completo de la computadora:

* **Manipulación de Datos (`pandas`, `numpy`):** Para cargar, filtrar, alinear y transformar los datos brutos provenientes del equipo Witec.
* **Pre-procesamiento Raman (`scipy.signal`, `pybaselines`):** * *Sustracción de Blanco/Línea Base:* Algoritmos asimétricos de mínimos cuadrados (ALS) o polinomios adaptativos.
    * *Suavizado:* Filtros Savitzky-Golay.
    * *Detección de Picos:* `find_peaks` para localizar automáticamente las bandas características (ej. los picos del R6G).
* **Análisis Multivariado (`scikit-learn`):** Para correr algoritmos de reducción de dimensionalidad como Análisis de Componentes Principales (PCA), agrupamiento (K-Means) o modelos predictivos (PLS-DA).

### 4. Optimización de Datos (El Secreto de la Velocidad)
Los equipos Raman como el Witec exportan los datos en archivos de texto plano (`.txt` o `.csv`). Leer un archivo `.txt` de 2 GB con millones de puntos espectrales en un mapa Raman es extremadamente lento y consume mucha memoria.

**El Flujo de Ingesta Inteligente:**
1. Cuando la App de Tauri mueve el archivo `.txt` del escritorio a la "Bóveda Local" del proyecto.
2. FastAPI intercepta este evento y, en segundo plano, lee el `.txt` una sola vez.
3. Python convierte esa matriz en un archivo **`.parquet`** o **`.h5` (HDF5)**.
4. *Resultado:* Un archivo `.parquet` pesa una fracción del original y Python puede cargarlo en memoria en *milisegundos* en lugar de *minutos*. La base de datos de Supabase guardará la ruta apuntando al archivo rápido (`.parquet`), no al lento.

### 5. Empaquetado y Distribución (PyInstaller)
Para que esta aplicación sea verdaderamente profesional y compartible con otros investigadores del laboratorio, **no se puede exigir que el usuario final instale Python, pip, o configure entornos virtuales.**

**El Proceso de Construcción (Build):**
* Se utilizará **PyInstaller**. Esta herramienta toma todo el código de Python (`main.py`, `procesamiento_raman.py`) y todas las librerías instaladas (`pandas`, `scipy`, etc.) y las "congela" en un único archivo ejecutable cerrado (`.exe` para Windows, binario para Mac).
* El usuario final solo descarga el instalador principal de Tauri (ej. `PhD_Nexus_v1.0.msi`). Al instalarlo, todo el entorno científico ya viene incluido y pre-configurado, listo para usarse desde el primer clic.