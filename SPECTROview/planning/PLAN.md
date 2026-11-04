# Plan de integración completa en Map Analyzer

Plan base: 30-10-2026. Actualización 02-11-2026: ya existe una implementación parcial; el orden operativo y sus criterios de aceptación están en `NEXT_STEPS.md`. Este plan conserva el alcance integral. Ver `MEMORY.md`, `AUDIT.md` y `FEATURES.md` para distinguir estado actual y auditoría inicial.

## 1. Resultado esperado y enfoque

Añadir un modo **SPECTROview** dentro de Map Analyzer, con la biblioteca, identidad de muestra, carga y aspecto de Nexus. Crear de cero su integración y gestión de estado; conservar el motor científico upstream y adaptar las interacciones de su interfaz Qt a React. RGI/RGI2/Fitting continúan disponibles durante la transición. El perfil grafeno–Au será una especialización del nuevo módulo, sin recortar las funciones generales de SPECTROview.

La prioridad técnica es garantizar un recorrido continuo: seleccionar adquisición → revisar datos → preparar → definir modelo → ajustar → revisar calidad → explorar mapas/estadística → exportar → cerrar/reabrir/reanudar. Cada entrega vertical debe completar ese recorrido para su alcance.

## 2. Arquitectura propuesta

```mermaid
flowchart LR
  V[Biblioteca y contexto Nexus] --> U[Nueva vista SPECTROview React]
  U --> A[API local versionada]
  A --> J[Sesiones y trabajos persistentes]
  J --> D[Adaptador HDF5 y geometría]
  D --> S[API y núcleo SPECTROview fijados]
  S --> Q[QC y extensiones grafeno]
  Q --> R[Resultados y procedencia local]
  R --> U
  R --> V
```

Ubicaciones de integración (las dos primeras ya creadas; no todas sus capacidades previstas están implementadas):

- `src/features/map-analyzer/spectroview/`: vista contenedora, cliente tipado, estado y paneles separados de datos, preprocesamiento, modelo, jobs, resultados, mapas, gráficas y MVA.
- `python-engine/spectroview_integration/`: contratos, adaptadores de datos/modelos, servicio, trabajos, almacenamiento, QC y perfiles. Router pequeño registrado desde `main.py`, sin añadir allí toda la lógica.
- Paquete upstream fijado y parches mínimos trazables. El directorio `SPECTROview/upstream` queda como referencia, nunca importado por una ruta absoluta del equipo.
- Entorno Python aislado para demostrar compatibilidad. Decidir integración en el sidecar actual o worker dedicado según prueba de dependencias; mantener el protocolo igual en ambos casos.

Preferencia: usar API pública y núcleo sin Qt. Si una operación solo existe en ViewModel, extraer/adaptar su lógica en un servicio probado, conservando la semántica. No lanzar una ventana Qt escondida como solución general ni traducir el solver a TypeScript.

## 3. Interfaz adaptada

Conservar barra global, Active Workspace, árbol de muestras, chips de medición, búsqueda y cabecera de adquisición. La nueva pestaña recibe el archivo activo y `onFileCreated`, siguiendo el patrón de integración existente.

Dentro del módulo:

1. Cabecera compacta: adquisición, N espectros, versión del análisis, estado guardado, guardar/exportar y progreso del trabajo.
2. Navegación interna: **Datos · Preparación · Modelo y ajuste · Mapas y resultados · Gráficas · Multivariante**; herramientas/ayuda/preferencias y asistente accesibles sin duplicar la navegación global.
3. Controles a la izquierda; área principal con espectro, bruto/procesado, baseline, componentes y residuos; tabla de parámetros debajo o en panel ampliable.
4. Selección enlazada: clic en mapa/tabla/gráfica conserva `spectrum_id`, resalta el mismo punto y muestra su ajuste persistido, sin reajustarlo silenciosamente para inspeccionarlo.
5. Tabla de picos con ancho suficiente, scroll interno y encabezado fijo; campos min/valor/max, fijo y expresión claramente distinguibles. Atajos y drag/drop con alternativas accesibles.
6. Paneles redimensionables y plegables; estilo tomado de componentes/tokens Nexus, contraste y tipografía coherentes. Revisar a 1280×800, 1440×900 y tamaño de la captura; no asumir 1920 px disponibles para el área científica.
7. Distinguir «vista actual» de «alcance del cálculo»: espectro, selección, mapa o varios mapas. Confirmación visual de cantidad antes de lanzar trabajo, sin diálogos innecesarios.
8. Errores accionables en contexto: eje incompatible, fuente ausente, QC insuficiente, dependencia no disponible, fallo de job. Mostrar resultados anteriores como obsoletos cuando proceda.

La paridad visual se comprobará contra las acciones de upstream, no por parecido de capturas. Exportaciones científicas usarán el renderer upstream cuando sea necesario para conservar estadística y estilo; la interacción web puede usar Plotly/Canvas con valores del mismo servicio.

## 4. Contrato de datos y continuidad

### Identidad e integridad

`DatasetRef`: schema_version, dataset_id, sample_id, acquisition_id, parent_asset_id, origen relativo validado, hash de contenido, lector/versión, unidades, eje, forma N×M, metadatos instrumentales y geometría. `spectrum_id` estable por fila original, separado del índice filtrado/visual. Mantener coordenadas explícitas y orden de barrido; admitir mapas rectangulares, anisótropos, incompletos e irregulares y espectros independientes.

No sobrescribir señales originales. Verificar formas, NaN/Inf, eje descendente/no monótono, duplicados, saturación y cobertura; rechazos y transformaciones deben dejar registro. Conservar HDF5 original y precisión; medir el efecto de conversión float32 upstream. Nunca derivar coordenadas físicas de la raíz cuadrada de N.

### Configuración reproducible

`AnalysisSpec`: versión del esquema, commit upstream/adaptador, hash fuente, orden de pasos, parámetros efectivos, bandas/modelos, restricciones, ruido/pesos/pérdida, semilla, selección/QC y configuración instrumental. Separar normalización exploratoria de la señal usada para cuantificar alturas/áreas.

Guardar contenido efectivo de plantilla, no solo nombre de archivo; distinguir defaults de usuario y valores congelados del análisis. Transformación de parámetros explícita: `ampli/fwhm/x0` upstream no equivale automáticamente a `amplitude/sigma/center` de lmfit.

### Trabajos y almacenamiento

`AnalysisRun`: run_id, revision, job_id, spec_hash, entradas, estado, tiempo, bloques completos, fallos por espectro y referencias de artefactos. Estados: draft → validated → queued → running → completed/partial/failed/cancelled; `interrupted` para caída y `stale` para resultados de configuración antigua.

API propuesta `/api/spectroview/v1`: capabilities, datasets, sessions, preview, jobs (crear/consultar/cancelar/reanudar), results (mapa/tabla/espectro paginados), import/export y templates. Respuestas de error tipadas con código, detalle, etapa, run_id y posibilidad de reintento. Validar rutas resueltas dentro del vault y origen de llamadas locales.

Persistir manifiesto JSON y resultados por bloques en archivos derivados bajo el vault; un único escritor por corrida, escritura temporal + reemplazo atómico y checkpoints. Reanudación inicial a nivel de bloque: repetir únicamente el bloque incompleto, no prometer recuperar la iteración interna del optimizador. No usar un diccionario global de progreso para todas las corridas.

El navegador guarda selección/layout, no matrices completas. Resultados y curvas por demanda; previews reducidas solo para visualización. Guardar un namespace nuevo `/analysis/spectroview_v1` si se utiliza HDF5 derivado y nunca escribir en `/analysis/rgi*_v1`. Preservar parent_asset/parent_file para el árbol.

### Invalidación

Cambiar fuente/eje/preprocesamiento invalida ajuste, QC, mapas y gráficas dependientes. Cambiar modelo/pesos invalida ajuste y derivados. Cambiar máscara QC invalida estadísticas y figuras de esa máscara, no los ajustes originales. Cambiar color/zoom no dispara cálculo científico. Cada job queda ligado a la revisión con la que comenzó; al cambiar de muestra, sus respuestas no pueden entrar en la nueva vista.

Autosave de configuración, guardado de hitos y recuperación al reiniciar. Fuente movida: relocalizar comprobando hash; fuente modificada: nueva revisión, nunca reutilizar silenciosamente resultados antiguos. Una falla de guardado debe impedir el indicador «guardado».

## 5. Fases ejecutables y puertas de salida

| Fase | Trabajo | Entregable y condición para avanzar |
|---|---|---|
| P0 · Inventario y referencia | Completar mapa de acciones API/ViewModels/manual, fijar versiones, dependencias y distribución | 100% de capacidades clasificadas; ejemplos y expectativas registrados; sin exclusiones silenciosas |
| P1 · Viabilidad del núcleo | Entorno aislado; import sin GUI; tests upstream relevantes; perfil de imports; decisión sidecar/worker | Carga y fit headless reproducibles; solver, modelos, cancelación y formatos caracterizados |
| P2 · Datos y contratos | HDF5→MapData, identidad, geometría, precisión, schemas y errores | Fixtures 1D/rectangular/irregular y HDF5 real validan valores y coordenadas; fuente intacta |
| P3 · Sesión y primer recorrido | Pestaña nueva, selección existente, preview, ajuste individual, guardar/cerrar/reabrir/exportar | Primer flujo completo funciona desde biblioteca sin reimportar; muestra/corrida no se mezclan |
| P4 · Preparación y constructor completos | SV14–23; tabla/puntos/arrastre, plantillas y undo aplicable | Paridad de curvas/parametrización y restauración; prueba de invalidación |
| P5 · Mapas y jobs | Lotes, selección, varios mapas, límites de memoria, progreso, cancelar y reanudar | Mapa de ~2500 completo; reinicio recupera bloques; N contabilizado; UI responde |
| P6 · Resultados y visualización | SV07–13 y SV27–34: mapas, RGB, perfiles, nueve gráficas, filtros, recetas, MVA y calculadoras | Cada ID tiene recorrido, valores contrastados y round-trip; exportación reproducible |
| P7 · Formatos y funciones transversales | Resto de formatos nativos/instrumentales, settings/ayuda/atajos, IA y MCP | Paridad funcional cerrada incluyendo funciones opcionales; mismas acciones vía UI/API |
| P8 · Perfil grafeno–Au | GA01–06, modelos/errores/QC, comparador y reportes | Benchmark científico supera tolerancias predefinidas; límites físicos explicitados |
| P9 · Integración distribuible | Regresión Nexus, entorno limpio, Windows/Tauri, licencias, documentación y recuperación | Paquete reproducible, matriz sin pendientes y guía de soporte/rollback |

Orden de dependencias: P0→P1→P2→P3→P4→P5; P6/P7 después de contratos estables; P8 depende de fitting validado y trazabilidad; P9 integra todo. P3 es un hito utilizable, no el final solicitado. No fijar fechas sin medir P1/P5; estimar por capacidades y actualizar después de cada puerta.

## 6. Validación técnica y científica

- **Paridad upstream:** mismos datos/configuración, comparar parámetros, curvas, baseline, máscaras y resultado de cada modo. Caracterizar todos fijos, sin picos, límites, expresiones y cancelación. Conservar salidas de referencia por commit.
- **Oracle independiente:** lmfit/SciPy con parametrización equivalente para un subconjunto estratificado; no usar solo el mismo motor para validarse a sí mismo. Comparar formas y unidades antes de amplitudes/FWHM.
- **Sintéticos grafeno:** G sola, G+D′ solapadas, 2D ancha, Voigt instrumental, fondo inclinado, ruido proporcional a señal, cósmicos, dos dominios, degenerados/saturados. Medir sesgo/dispersion/cobertura de incertidumbre, no solo R².
- **Estadística:** mismo conjunto de IDs y máscara para relaciones pareadas; distinguir alturas y áreas; bootstrap espacial y referencia instrumental. AICc/BIC solo con datos/likelihood comparables; no aplicar automáticamente a pérdidas robustas.
- **Persistencia:** cierre durante lote, proceso terminado, disco lleno, exportación interrumpida, fuente movida/modificada, sesión antigua, navegación durante petición y dos corridas. Verificar no duplicación y ningún cambio al hash fuente.
- **Rendimiento:** N=1, mapa ~2500 y al menos 10× ese N, tamaños M/K representativos; medir tiempo, memoria máxima, transferencia y latencia UI. Presupuesto de memoria determina chunk size incluyendo Jacobiano N×M×K, curvas y temporales. Registrar máquina/hilos/BLAS y no prometer aceleración antes de medir.
- **Regresión Nexus:** tests existentes de workspace display/render, canvas grid, WIP map analyzer, typecheck/lint y recorridos manuales de módulos existentes. Ejecutar solo lo pertinente en cada fase y el conjunto de integración al final.
- **Aceptación visual:** controles alcanzables sin recorte, mapa→píxel→curva coherente, estados vacíos/cargando/error/cancelado, teclado y tamaños de ventana indicados.

Tolerancias numéricas: definir primero con fixtures sin ruido y precisión; para datos experimentales usar resolución/SNR y distribución de referencia, registrarlas antes de comparar. No declarar validez física por terminar el cálculo.

## 7. Extensiones grafeno y datos pendientes

Mantener G/D/D′/2D como catálogo configurable por excitación, incluyendo 632.8 nm. Añadir Voigt exacto con derivadas/pruebas y FWHM total correcto; estudiar Fano y modelos multicomponente con justificación. Las incertidumbres pueden requerir covarianza condicionada y/o bootstrap, con banderas cuando no sean identificables. No suavizar por defecto ni convertir no detección en cero físico.

Datos pendientes para validar científicamente: mapa bruto de control y Au con coordenadas, parámetros actuales de ajuste, resolución/calibración, potencia real, preparación de Au y réplicas. Su ausencia no bloquea P0–P7; sí limita la aceptación experimental de P8. No usar promedios de histogramas para reconstruir correlaciones por píxel.

## 8. Mantenimiento y recuperación

No actualizar upstream automáticamente durante una fase. Cada actualización debe regenerar inventarios, revisar cambios, ejecutar paridad y registrar nuevas capacidades. Mantener patches y adaptadores separados y rastreables.

Activación por feature flag prevista para distribución; la integración preliminar usa una pestaña directa. Volver al modo anterior no elimina resultados nuevos. No migrar destructivamente sesiones RGI. Antes de una futura retirada de modos antiguos, ofrecer exportación y una decisión específica.
