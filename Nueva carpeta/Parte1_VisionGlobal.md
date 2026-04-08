# Documento de Arquitectura - PhD Nexus LIMS
## Parte 1: Visión Global, Filosofía y División del Sistema

### 1. El Problema Fundamental (Contexto del Proyecto)
En la investigación científica moderna, especialmente en técnicas espectroscópicas (Raman, SERS, FTIR), se genera una desconexión crítica entre la **información de la muestra (metadatos)** y los **datos crudos (matrices numéricas)**. 
Tradicionalmente, los investigadores anotan las condiciones experimentales en cuadernos o hojas de cálculo, mientras que los equipos (ej. microscopios Witec) escupen archivos `.txt` o `.csv` de varios Gigabytes en carpetas inconexas. Esto genera:
* **Pérdida de trazabilidad:** Olvidar a qué muestra corresponde un archivo.
* **Duplicación de esfuerzo:** Escribir los parámetros en la web y luego escribirlos de nuevo en los scripts de Python locales para procesar.
* **Saturación de almacenamiento:** Subir gigabytes de datos basura a la nube solo para poder ver un gráfico.

### 2. La Solución: Arquitectura Híbrida (LIMS)
La visión de este proyecto es construir un Sistema de Gestión de Información de Laboratorio (LIMS, por sus siglas en inglés) con una arquitectura **híbrida**. Esto significa dividir el sistema en dos "mundos" asimétricos que comparten un único "cerebro".

#### A. El Cerebro Central (Supabase / Nube)
Es el núcleo del sistema. Funciona bajo el principio de la **"Única Fuente de la Verdad" (Single Source of Truth)**. 
* **Qué almacena:** Relaciones de muestras, IDs, fechas, parámetros físicos del experimento (láser, potencia, tiempo de integración, analito), enlaces a imágenes de resumen y **rutas relativas** del disco duro local.
* **Qué NO almacena:** Archivos de texto crudos de espectros con millones de puntos.

#### B. El Mundo Nube: La Bitácora Web (Next.js en Vercel)
Es la "cara pública" e interactiva del sistema.
* **Propósito:** Entrada de datos, consulta rápida y compartición.
* **Disponibilidad:** 24/7 desde cualquier dispositivo (el móvil en el laboratorio, la tablet del supervisor).
* **Flujo principal:** El usuario termina de medir en el laboratorio, abre la web, registra la muestra, selecciona los parámetros y deja el estado en "Pendiente de Procesamiento".

#### C. El Mundo Local: La Estación Científica (Tauri + Python)
Es el "músculo" computacional. Una aplicación instalada en el disco duro del investigador, con la misma interfaz que la web, pero con permisos del Sistema Operativo.
* **Propósito:** Ingesta de archivos crudos pesados, organización automática de directorios y procesamiento matemático exhaustivo.
* **Capacidades exclusivas:** 1. Acceso de lectura/escritura a discos duros (para mover archivos del escritorio a carpetas ordenadas).
  2. Uso de toda la memoria RAM y CPU del equipo local (sin depender del internet) para ejecutar librerías como Pandas, SciPy y Scikit-learn.
  3. Conversión de formatos lentos (`.txt`) a formatos de alta velocidad bidimensional (`.parquet` o `.h5`).



### 3. El Flujo de Vida de un Dato (Ejemplo Práctico)
Para entender cómo interactúan estos dos mundos sin que el usuario trabaje el doble, este es el ciclo de vida de un experimento:

1. **La Medición:** Se mide la muestra `Au-NPs-15nm` en el equipo Raman. Se obtiene un archivo pesado llamado `medicion_martes_final.txt`.
2. **El Registro (Mundo Nube):** Desde la web, el usuario crea el registro de la muestra, anota que usó un láser de 633nm, y establece el experimento. Todo queda guardado en Supabase.
3. **La Ingesta (Mundo Local):** El usuario llega a su PC, abre la App de Escritorio y arrastra el archivo `medicion_martes_final.txt`. 
4. **La Sincronización Automática:** La App lee de Supabase que esta muestra usó láser 633nm. El "Sidecar" de Python en la PC toma el archivo, lo renombra inteligentemente, lo mueve a `C:/PhD_Nexus_Data/Au-NPs/Raman/`, extrae los datos, realiza una sustracción de blanco, y genera un PNG con la gráfica resultante.
5. **El Cierre del Ciclo:** Python sube **solo** el archivo PNG pequeño a Supabase, y actualiza el registro a "Procesado". Ahora, cualquier persona que entre a la web verá la gráfica terminada, pero los Gigabytes de datos pesados siguen a salvo y ordenados exclusivamente en la PC del investigador.

### 4. Ventajas Competitivas de este Diseño
* **Zero Double-Entry:** El investigador escribe los metadatos una sola vez.
* **Escalabilidad Infinita:** Al no subir datos pesados a la nube, los costos de servidores son nulos (se puede operar siempre en la capa gratuita de Supabase y Vercel).
* **Potencia de Software Empresarial:** Se obtiene la experiencia de usuario de una app moderna, con el rigor matemático del ecosistema de Python.