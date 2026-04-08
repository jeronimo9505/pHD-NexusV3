# Documento de Arquitectura - PhD Nexus LIMS
## Parte 2: El Cerebro y la Nube (Supabase + Vercel)

### 1. Filosofía de Almacenamiento (Data Segregation)
El núcleo de esta arquitectura híbrida se basa en una segregación estricta de los datos. Supabase (PostgreSQL) y Vercel (Hosting) están diseñados para ser ultra-rápidos manejando texto y metadatos, no para almacenar gigabytes de matrices numéricas crudas.

**Regla de Oro de la Base de Datos:**
* **SÍ va a la nube:** Metadatos del experimento, parámetros del equipo (láser, potencia), estado del procesamiento, rutas relativas y miniaturas gráficas (PNGs).
* **NO va a la nube:** Archivos `.txt`, `.csv`, `.parquet` o `.h5` con los puntos (X, Y) del espectro Raman. Estos viven única y exclusivamente en el disco duro local o en OneDrive.

### 2. Modelado de la Base de Datos (PostgreSQL en Supabase)
Para que tu aplicación web y tu programa de escritorio se entiendan perfectamente, el modelo relacional debe separar la "Muestra" física de la "Medición" que se le hace.



#### Tabla A: `samples` (Las Muestras Físicas)
Registra el objeto físico real que fabricaste en el laboratorio.
* `id` (UUID): Identificador único.
* `name` (String): Ej. "Au-NPs-15nm" o "A2-B2-C1".
* `description` (Text): Notas sobre la síntesis o preparación.
* `created_at` (Timestamp): Cuándo se registró.
* `lineage_id` (UUID, opcional): Si esta muestra deriva de otra anterior.

#### Tabla B: `raman_measurements` (Las Mediciones / La Bitácora)
Aquí es donde registras cada vez que pones la muestra en el microscopio Witec. Una muestra puede tener muchas mediciones.
* `id` (UUID): Identificador único de la medición.
* `sample_id` (UUID): Llave foránea que conecta con la tabla `samples`.
* **Metadatos Científicos (Lo que rellenaste en tu web):**
    * `laser_wavelength` (Integer): Ej. 633, 532, 785.
    * `laser_power_uw` (Float): Ej. 50.0.
    * `integration_time_s` (Float): Tiempo de exposición.
    * `analyte` (String): Ej. "R6G M-6" (como se ve en tus capturas).
* **Control del Sistema Híbrido (La Magia de la Sincronización):**
    * `status` (String): Puede ser `'pending_upload'`, `'pending_processing'`, `'processed'`, `'error'`.
    * `local_relative_path` (String): **CLAVE.** Ej. `/datos_crudos/2026/marzo/A2_Raman_01.parquet`.
    * `preview_image_url` (String): URL de Supabase Storage apuntando al PNG de la gráfica procesada.
    * `pca_cluster_id` (Integer, opcional): Resultados numéricos resumidos del procesamiento en Python.

### 3. El Sistema de Rutas Relativas (El "Truco" Multi-PC)
Dado que tu app local moverá y transformará archivos, la base de datos necesita saber dónde están. Sin embargo, si guardamos la ruta absoluta (ej. `C:/Users/Rodrigo/OneDrive/...`), el sistema fallará si abres tu app en una Mac o en la PC del laboratorio.

**La Solución Implementada:**
1. Supabase **solo** guarda la ruta desde una carpeta raíz imaginaria hacia adelante (ej. `/Raman/AuNPs/espectro_1.parquet`).
2. La App de Escritorio (Tauri) tiene un panel de "Configuración Local" donde el usuario define su "Carpeta Raíz" para esa computadora específica (ej. `D:/Mi_Doctorado/OneDrive_Datos`).
3. Cuando la App Local necesita abrir un archivo para hacer un PCA con Python, concatena ambas partes dinámicamente:
   `Raíz Local` + `Ruta Supabase` = `D:/Mi_Doctorado/OneDrive_Datos/Raman/AuNPs/espectro_1.parquet`
   
De esta forma, la base de datos en la nube es agnóstica al sistema operativo (Windows/Mac/Linux) y sobrevive a cambios de computadora.

### 4. Supabase Storage (El Puente Visual)
Aunque los datos crudos no suben a la nube, la versión web en Vercel necesita mostrar resultados para que puedas compartir tus avances con tu director de tesis o colegas.
* **El Flujo Visual:** Cuando el "Sidecar" de Python en tu computadora local termina de procesar un espectro (ej. quita la línea base y encuentra los picos), utiliza la librería `matplotlib` para generar un gráfico limpio y ligero en formato `.png` (apenas unos 50 KB).
* Python sube automáticamente este `.png` a un "Bucket" público en Supabase Storage llamado `processed_plots`.
* La URL generada se guarda en el campo `preview_image_url` de la medición.
* Al instante, la web en Vercel se actualiza y muestra el gráfico final, pareciendo que todo se procesó en la nube, cuando en realidad el trabajo pesado se hizo en tu PC local.