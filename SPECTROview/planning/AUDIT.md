# Auditoría de arquitectura y viabilidad

Fecha: 30-10-2026. Método: inspección de código, contratos, manual y pruebas existentes; inventario AST completo. No se ejecutó la aplicación upstream ni un benchmark científico. Las observaciones de comportamiento son lecturas estáticas salvo indicación contraria.

## 1. Qué hace Nexus y cómo circulan los datos

Nexus combina gestión de investigación (muestras, logbook, informes, tareas, calendario, Drive, conocimiento) con análisis local de espectros. `package.json` declara Next 16, React 19, Tauri 2, Plotly, React Query y Zustand. La aplicación científica no se reduce a RGI2.

Flujo observado:

1. Lectores locales convierten WITec TXT/WIP, MATLAB y Lightnovo a HDF5; WIP tiene bibliotecas y geometría específicas en `python-engine/readers/`.
2. Los espectros se almacenan en `/spectrum/wavenumbers` y `/spectrum/intensities`, con metadatos de adquisición y relaciones de origen.
3. `src/features/map-analyzer/components/desktop-map-analyzer.tsx` mantiene archivo activo, lista de sesión, dimensiones, selección y modos; `VaultLibrary` presenta muestra → adquisición → derivados.
4. La cabecera y biblioteca resuelven identidad con `workspace-display.ts`; la geometría faltante se enriquece mediante `/api/vault-assets/workspace-metadata`. La sesión local conserva referencias y existen acciones para workspaces guardados.
5. Los componentes llaman al motor FastAPI local. `src/lib/desktop.ts:14` y `python-engine/start.py` fijan **8888**. El README del motor aún muestra 8765: no usar ese dato documental como contrato.
6. Procesamientos y ajustes producen resultados/archivos derivados; `onFileCreated → handleImport` los devuelve a la biblioteca.

Puntos concretos de integración: unión `mode` de `DesktopMapAnalyzer`, botones del selector, importación dinámica de una nueva vista, render de esa vista y condición que oculta el inspector inferior para modos completos. Añadir también el reconocimiento del nuevo derivado donde se clasifican sufijos; evitar depender del nombre para identificar la procedencia.

## 2. RGI2 y adaptaciones existentes

Se inspeccionaron RGI2, sus rutas y motor, y los puntos de entrada de Fitting, Pipeline, RGI y Deconvolution. No se reprodujo en vivo el fallo histórico que describe el usuario.

| Evidencia | Implicación para la nueva integración |
|---|---|
| `rgi2_engine.py:16` importa fitting, baseline y resultados científicos de RGI | RGI2 no es un motor independiente. No basar la nueva implementación en copiar esa vista y cambiar el nombre. |
| `rgi2_engine.py:108–119`: fallo de despike permite continuar; `nan_to_num` transforma valores del preprocesamiento | Registrar operación fallida y máscara; no presentar una corrección solicitada como aplicada si falló. |
| `main.py:2621`: progreso global único `rgi2_progress` | El progreso nuevo debe pertenecer a un `job_id`, mapa y revisión. |
| `main.py:2534`: copia derivada se elige por sufijo; si existe puede reutilizarse | Versionar resultados por identificador; no sobreescribir una corrida por coincidencia de nombre/fecha. |
| `rgi2-view.tsx:251` restaura sesión y múltiples estados React; el ajuste se lanza mediante llamadas independientes | Persistir configuración y resultados en un contrato común, con invalidación de dependencias y recuperación. |
| `DesktopMapAnalyzer`: paso escalar, geometría y dimensiones por archivo | Admitir coordenadas explícitas y paso X/Y diferente; no fabricar coordenadas científicas desde una rejilla visual estimada. |
| `MAP-ANALYZER-NAVIGATION.md` y `canvas-grid.ts` documentan correcciones de identidad y canvas vacío | Reutilizar esas protecciones; evitar regresiones al añadir el módulo. |

La captura aportada sirve como referencia visual: navegación izquierda, biblioteca clara, contexto superior, controles y gráfica/tabla. La zona científica oscura de RGI2 es una variación existente, no necesariamente el sistema de diseño a imponer en toda la nueva vista.

## 3. SPECTROview verificado en el clon

Versión 26.44.2, commit `d40ec6278fe982a7efda6e4ab15646016995a2db`. `pyproject.toml` exige Python >=3.12 y declara NumPy >=2.0.2, pandas >=3.0.1, SciPy >=1.17.1, PySide6 >=6.10.2. El Python invocado en esta sesión es 3.13.7; esto **no demuestra** que las dependencias requeridas estén instaladas ni que sea el intérprete empaquetado de Nexus.

La versión consultada por web devolvió metadatos antiguos; prevalece el commit clonado, no esa caché. No fijar dependencias a partir de la página indexada.

| Capa | Archivos y lectura |
|---|---|
| Datos | `model/spectra_store.py`: `MapData` conserva x0/Y0, x/Y procesados, coords, máscaras activas, modelo, resultados y curvas. Y0/Y se describen como float32; evaluar cuantización respecto al HDF5 original. |
| API | `api/workspace.py`: `SpectraWorkspace` y `MapsWorkspace` tienen carga, crop, baseline, normalización, ajuste, tablas, save/load, mapas y perfiles. `api/fitting.py:fit_batch` expone callbacks de progreso/cancelación. |
| Motor | `fit_engine/vbf_engine.py`: inicialización, umbral de ruido antes/después, LM por lotes, construcción de resultados. `optimizer.py`, `evaluator.py`, `models.py`, `weights.py` constituyen la ruta numérica. |
| Modelos | Registro real: Gaussian, Lorentzian, PseudoVoigt, GaussianAsym, LorentzianAsym, Fano, DecaySingleExp, DecayBiExp. Voigt exacto no está en ese registro. |
| Baseline | `fit_engine/baseline.py`: None, Linear, Polynomial, arpls, airpls, asls y modpoly; puntos y parámetros de cada método no son intercambiables. |
| Orquestación Qt | `viewmodel/vm_workspace_spectra.py`, `vm_workspace_maps.py`, `fit_engine/vbf_thread.py`: selección, acciones interactivas, agrupación de lotes, write-back y señales. Son fuente de comportamiento a portar, no componentes React reutilizables. |
| Persistencia | `model/workspace_io.py`: ZIP v2 con metadata JSON, arrays NPY sin pickle y tablas Parquet; detección de formato legado JSON. No confundirlo con HDF5 de Nexus. |
| Gráficas | `api/graphs.py` reutiliza `view/components/v_plot_renderer.py` y `MGraph`; nueve estilos, recetas y exportación. Aunque el renderer viva en `view`, su API declara no requerir Qt. Verificarlo por importación aislada. |
| Multivariante | `model/m_mva.py`: PCA por SVD y NMF por actualizaciones multiplicativas. No asumir igualdad exacta con sklearn usado en RGI2. |
| IA y automatización | `ai_agent/`, `application/`, API y MCP: inventariar herramientas, historial, proveedores, reglas, permisos y despacho Qt. No conectar el servidor Qt directamente al nuevo workspace sin adaptador. |

## 4. Límites que afectan la estrategia

- La API headless es el primer candidato, pero no basta con confiar en el nombre: `api/__init__.py` importa varios submódulos y `model/m_io.py` importa `viewmodel.utils`. Hace falta comprobar imports transitivos y arranque sin QApplication en un entorno aislado.
- `api/workspace.py:SpectraWorkspace.fit` llama al motor por espectro; la ruta de mapas y `fit_batch` deben preservarse para mapas grandes. No sustituir vectorización por un bucle HTTP por píxel.
- `VBFengine.fit_spectra` devuelve parámetros, success, R², curvas y nombres; no devuelve covarianza/errores estándar en ese contrato. Incertidumbre, AICc/BIC y QC de grafeno requieren otra capa.
- El caso `n_params_free == 0` devuelve actualmente ceros y success verdadero. Necesita prueba de caracterización; no tratar esa salida como evaluación científica válida de un modelo fijo.
- El umbral de ruido modifica parámetros antes y después del ajuste. Separar ausencia/no detección de banda de una anchura física igual a cero.
- `evaluator.py` evalúa expresiones con `eval` restringido. Revisar gramática, dependencias cíclicas, nombres y límites de cálculo antes de aceptar modelos importados.
- Carga TXT/CSV tiene convenciones específicas; en `m_io.py` el lector de espectro CSV salta tres filas y usa punto y coma. Probar archivos sin cabecera para evitar perder la primera medida. No prometer CSV arbitrario.
- La API y la GUI tienen matices: copiar/pegar modelo utiliza el umbral de ruido actual; aplicar plantilla usa el guardado. Exponer y registrar ese comportamiento para reproducibilidad.
- El motor es una base bien desarrollada, pero su madurez no sustituye validación con los mapas del usuario.

## 5. Evidencia y límites de esta entrega

El inventario lee todos los 532 archivos versionados y calcula SHA-256; el AST localiza 4572 clases/funciones/métodos sin errores de sintaxis. Incluye tests y utilidades: no son 4572 funciones de usuario. Se inventarían 129 encabezados del manual para controlar acciones que no aparezcan en la API.

No se instaló software, no se cambiaron dependencias ni se modificaron HDF5, bases de datos o módulos actuales. No se ejecutaron tests numéricos upstream; sus pruebas existentes sirven para planificar, no como resultados aprobados en este entorno.

Licencia declarada en el commit: `GPL-3.0-or-later`, con LICENSE presente. Conservar autoría, licencia, revisión y registro de cambios en el paquete adaptado. La compatibilidad de distribución de Nexus se debe resolver antes de distribuir la integración; separar procesos por sí solo no demuestra compatibilidad.
