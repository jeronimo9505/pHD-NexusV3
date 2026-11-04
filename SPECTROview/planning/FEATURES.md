# Matriz de cobertura funcional

Constructor (04-11-2026): SV21 permite eliminar cualquier pico, renumerar referencias y rechazar dependencias al pico eliminado sin modificar el modelo. Pendientes arrastre, nombres, cambio de perfil seguro y validación visual.

Selección previa (04-11-2026): SV07/24 permiten comparar hasta 32 espectros elegidos por índice con inspección individual y conservación de fallos. Pendiente selección gráfica, ajuste persistente de selección/múltiples mapas y recorrido visual.

Actualización 04-11-2026: SV11/27 añaden mapa de estados por fila y conteos completos (incluidos pendientes/fallos) con selección enlazada. Implementación parcial: faltan máscaras de calidad, filtros, variantes y validación visual.

Actualización 02-11-2026: SV09/24/27 incluyen vista previa individual y recuperación de componentes, R² y RMSE guardados. Pendiente aceptación visual y variantes completas. Prioridades y criterios: `NEXT_STEPS.md`.

Estado actualizado 31-10-2026: existe implementación parcial de NX01/NX02 y SV09/11/15/17/20/22/24–27/35. Ver `../validation/REPORT.md` para pruebas y límites. **Ninguna fila se considera cerrada en paridad integral**; faltan variantes y verificación visual. «Fuente» significa localizado en código/manual, no probado. Las rutas son relativas a `upstream/spectroview/`. Esta matriz agrupa capacidades; `manual-coverage.csv` y `upstream-symbols.csv` permiten desglosarlas sin perder acciones pequeñas.

Estrategias: **R** reutilizar núcleo/API; **A** adaptar interacción a Nexus; **E** extensión nueva. Ninguna función se considera terminada solo porque exista un botón.

| ID | Capacidad / variantes que conservar | Fuente principal | Destino / estrategia | Comprobación de aceptación |
|---|---|---|---|---|
| SV01 | Espectros TXT/CSV, delimitadores y cabeceras | model/m_io.py | Importación R+A | Igual número de puntos, eje y señal; fixture por variante |
| SV02 | Mapas TXT/CSV y wafer, coordenadas | model/m_io.py | Importación R+A | Orden de píxeles y coordenadas conservados |
| SV03 | WDF y SPC, espectro/mapa y metadatos | model/m_io.py, m_spc.py | Importación R | Comparación con ejemplos y valores originales |
| SV04 | TRPL DAT y decaimientos | model/m_io.py | Espectros R+A | Unidades temporales y modelos correctos |
| SV05 | Excel/CSV para gráficas y hojas | api/io.py, viewmodel/vm_workspace_graphs.py | Gráficas R+A | Tipos, hojas, categorías y valores preservados |
| SV06 | Conversión de mapas, incluida salida Renishaw TXT | model/m_file_converter.py | Herramientas R+A | Conversión sin pérdida y error explícito de formato |
| SV07 | Lista, activar/desactivar, selección, colores y etiquetas | viewmodel/vm_workspace_spectra.py | Datos/Espectros A | Selección estable al filtrar/ordenar |
| SV08 | Transferencia entre espectros, mapas y gráficas | viewmodel/vm_workspace_spectra.py, vm_workspace_maps.py | Vistas enlazadas A | Mismos IDs y procedencia tras transferir |
| SV09 | Curvas, componentes, baseline, zoom, escala, leyendas, copia | view/components/v_spectra_viewer.py, manual spectra_maps | Espectros A | Valores inspeccionados iguales al motor |
| SV10 | Heatmap espectral y opciones de vista | manual spectra_maps §3.4 | Espectros A | Ejes, selección y color reproducibles |
| SV11 | Mapas 2D/wafer, límites, paletas, máscara y selección | viewmodel/vm_workspace_maps.py | Mapas R+A | Geometría rectangular, irregular y datos faltantes |
| SV12 | Rangos interactivos, live maps y RGB | viewmodel/vm_workspace_maps.py, manual §3.5 | Mapas R+A | Mover rango actualiza operación correcta sin perder receta |
| SV13 | Perfiles espaciales y extracción de espectros | api/workspace.py:MapsWorkspace | Mapas R+A | Perfil coincide con coordenadas y unidades |
| SV14 | Corrección del eje y deshacer | vm_workspace_spectra.py | Preparación R+A | Eje original recuperable, shift registrado |
| SV15 | Crop, reinicialización y alcance uno/selección/todos | api/workspace.py | Preparación R+A | Ningún cambio silencioso de alcance |
| SV16 | Baseline manual: puntos, attached, ruido, polinomio | fit_engine/baseline.py, vm_workspace_spectra.py | Preparación R+A | Antes/después, puntos y orden se restauran |
| SV17 | arPLS/airPLS/AsLS/ModPoly, copiar/pegar/restar/borrar | fit_engine/baseline.py | Preparación R+A | Parámetros y curvas coinciden con upstream |
| SV18 | Normalización y reversión | api/preprocessing.py, vm_workspace_spectra.py | Preparación R+A | Factor y unidades guardados; no doble normalización |
| SV19 | Detección/borrado de cosmic rays y validación | vm_workspace_spectra.py | Preparación A+R | Máscara/corrección auditables y bandas conservadas |
| SV20 | Ocho modelos registrados y previews | fit_engine/models.py, scalar_models.py | Modelo R+A | Curvas y Jacobianos; todos los parámetros accesibles |
| SV21 | Alta/baja/arrastre de picos, nombres y reindexación | vm_workspace_spectra.py, model/peak_model.py | Modelo A | Expresiones siguen apuntando al componente correcto |
| SV22 | Límites, fijos y expresiones entre parámetros | fit_engine/evaluator.py | Modelo R+A | Dependencias inválidas/cíclicas rechazadas; restricciones respetadas |
| SV23 | Plantillas JSON, copiar/pegar, guardar/aplicar, drag/drop | api/fitting.py, vm_fit_model_builder.py | Modelo R+A | Round-trip, ruido actual vs guardado visible |
| SV24 | Ajuste individual, selección, mapa y múltiples mapas | api/fitting.py, fit_engine/vbf_thread.py | Ajuste R+A | Paridad de parámetros/curvas con igual configuración |
| SV25 | Pesos, negativos, ruido, linear/soft_l1/huber, tolerancias | fit_engine/weights.py, optimizer.py | Ajuste R+A | Máscaras/pesos y configuración efectiva exportados |
| SV26 | Progreso y detener | api/fitting.py | Trabajos R+A | Cancelar no marca pendientes como terminados |
| SV27 | Recopilar resultados, convergencia, decimales y exportación | api/workspace.py, vm_workspace_spectra.py | Resultados R+A | Totales válidos/fallidos/excluidos concilian con N |
| SV28 | Columnas por nombre y expresiones calculadas | vm_workspace_spectra.py | Resultados A | Nuevas columnas preservan ID y fórmula |
| SV29 | Nueve gráficas: point/scatter/box/bar/line/trendline/histogram/wafer/2Dmap | api/graphs.py | Gráficas R+A | Misma estadística y categorías que upstream |
| SV30 | Filtros, ejes, leyendas, colores, anotaciones, barras y CI | model/m_graph.py, v_plot_renderer.py, manual graphs | Gráficas R+A | Receta reproduce presentación y cálculo |
| SV31 | Recetas, estilos, edición, undo/redo y exportación de figuras | vm_workspace_graphs.py, api/graphs.py | Gráficas R+A | Guardar/reabrir y deshacer no altera datos |
| SV32 | PCA: scores/loadings/varianza; NMF: W/H/error | model/m_mva.py, api/analysis.py | Multivariante R+A | Semilla, preparación y selección trazables |
| SV33 | .maps/.spectra/.graphs, ZIP v2 y legado JSON | model/workspace_io.py, api/workspace.py | Sesiones R+A | Importar/exportar y reabrir en ambas aplicaciones |
| SV34 | Calculadoras ópticas, penetración y unidades | model/m_quick_calculators.py, api/calculators.py | Herramientas R+A | Fórmulas/unidades contrastadas con origen |
| SV35 | Preferencias, límites globales, tema, ayuda y atajos | settings/, resources/user_manual/ | Preferencias A | Alcance por usuario/proyecto y persistencia claros |
| SV36 | Versión, entorno y actualización | settings/build_info.py, model/m_update_checker.py | Acerca de A | Mostrar versión fijada; actualizar motor solo con regresión |
| SV37 | Chat, proveedores, historial, recetas y dictado opcional | ai_agent/ | Asistente A+R | Acciones usan servicios del módulo y dejan historial |
| SV38 | API programática y herramientas MCP locales | api/, application/, ai_agent/mcp/ | Automatización A+R | Mismo resultado que acción manual; permisos y errores definidos |
| NX01 | HDF5/WIP/MAT/Lightnovo y biblioteca existente | Nexus readers/, vault-assets | Adaptador E | No reimportar ni perder muestra/adquisición/derivación |
| NX02 | Trabajos persistentes, checkpoints y reanudación | Nueva capa | Servicios E | Reiniciar proceso y recuperar sin duplicar resultados |
| GA01 | D/G/D′/2D, ventanas por láser y modelos comparables | Especificación §§4–5 | Perfil grafeno E | Modelo de referencia fijo; componentes opcionales justificados |
| GA02 | Voigt exacto, FWHM total, áreas y alturas separadas | Especificación §5 | Modelos/derivados E | Validación escalar/vectorial y unidades |
| GA03 | Incertidumbres, límites, identificabilidad, AICc/BIC | Especificación §§5–6 | QC E | Supuestos/invalidaciones explícitos; no CI inventado |
| GA04 | Correlación por píxel, estadística robusta y bootstrap espacial | Especificación §7 | Estadística E | Misma máscara/IDs; dependencia espacial considerada |
| GA05 | Control frente a Au, calibración e instrumento | Especificación §§8–12 | Comparación E | Condiciones compatibles o diferencias visibles |
| GA06 | SERS y reporte metodológico | Especificación §§9–11 | Informe E | No inferir EF ni mecanismo físico solo de G/2D |

## Regla de cierre sin omisiones

Antes de declarar paridad: asociar las 129 secciones del manual a estos IDs o sub-IDs; revisar acciones de ViewModels, menús/context menus y API; asignar cada archivo a reutilizado/adaptado/infraestructura/recurso/test/documentación. Las funciones auxiliares no necesitan un botón, pero sí un destino justificado. Añadir filas para cualquier capacidad descubierta, nunca eliminarla para elevar el porcentaje.

Cada ID necesita evidencia: archivo fuente, destino implementado, prueba numérica si aplica, recorrido de interfaz, round-trip de sesión y estado. Las diferencias intencionadas (por ejemplo, actualización del motor controlada por Nexus) deben describir la equivalencia y conservar la capacidad. Cualquier exclusión funcional requiere decisión explícita del usuario. No confundir «MVP útil» con «integración completa».
