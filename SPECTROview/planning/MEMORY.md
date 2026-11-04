# Memoria de continuidad — leer al retomar

Última actualización: 31-10-2026, Europe/Paris.

## Estado nuevo — implementación autorizada

El usuario indicó «ok, continua» y posteriormente pidió retomar. Está autorizada la implementación por fases. Hay una primera integración en `python-engine/spectroview_integration/` y `src/features/map-analyzer/spectroview/`, registrada como nueva pestaña de Map Analyzer. No confundir este avance con paridad completa.

Ya ejecutado: instalación aislada en `SPECTROview/.venv`; 376 tests upstream de fit_engine/API/SpectraStore/workspace_io aprobados (17.71 s), 20 tests nuevos de adapter/runs aprobados, 2 tests HTTP→worker→checkpoint→CSV aprobados. `pip check`, TypeScript y ESLint dirigido finalizaron con código 0. Se comprobó que importar el router en el Python original no importa SPECTROview; su worker usa el entorno separado.

Corrección respecto a la auditoría inicial: incluso `fit_engine` importa `VBFthread` y por ello bibliotecas Qt; sí funciona sin QApplication. No afirmar «sin dependencias Qt». Modelo totalmente fijo se evalúa en el adapter, y se etiqueta `evaluated`; no se usa la salida cero del early-return upstream.

Implementado: fuente HDF5 de solo lectura por bloques, IDs por fila, eje descendente reversible, geometría WIP calibrada e irregular explícita; filtros de datos inválidos; validación de modelos; checkpoints NPZ/JSON con hashes, lock del SO, cancelación y reanudación; CLI worker; router local; UI preliminar con ocho modelos, baseline automático, fitting de mapa, resultados de espectro y CSV.

Actualización final de este tramo: **22 tests de integración y 2 HTTP aprobados**, mapas de parámetros enlazados implementados y verificados por API, fingerprint de dependencias/código y configuración persistido. Benchmark sintético: 2500 espectros en 2.874 s y 25000 en 19.963 s, todos convergentes; oracle independiente en ocho espectros por corrida con diferencia máxima <1.8e-7. Ver `validation/REPORT.md` y `benchmark-results.json` para condiciones y limitaciones. Tres tests existentes de canvas/workspace aprobados.

Pendientes actuales: revisión visual real (acceso a ventana Nexus agotó tiempo de aprobación; no se interactuó), medición de memoria/benchmark experimental, preparación manual/plantillas, cierre granular P0 y resto de FEATURES. Expresiones con dependencias hacia adelante se rechazan explícitamente por ahora, para no heredar una evaluación con valores iniciales obsoletos. No hay paridad declarada. Próximo paso: comprobar la vista con el motor reiniciado, cerrar controles/preparación/plantillas e integrar derivados en biblioteca; continuar con las fases de paridad sin retirar modos anteriores.

Los apartados históricos siguientes describen la entrega de planificación original; prevalece este estado nuevo.

## Petición y alcance

El usuario quiere una nueva integración completa de SPECTROview dentro de Map Analyzer, adaptada al diseño y carga de Nexus; considera fallidas adaptaciones como RGI2 y quiere rehacer la integración desde cero. **Pidió primero un plan profundo con archivos de memoria.** No tomar el documento científico como orden de implementar de inmediato ni afirmar que todas sus capacidades ya existen upstream.

## Estado real

- [x] Inspección de arquitectura Nexus, integración de modos, biblioteca/carga, HDF5, RGI2 y puntos de entrada de otras adaptaciones.
- [x] Lectura de especificación y referencia visual proporcionadas.
- [x] Clon completo en `SPECTROview/upstream`, sin modificaciones, commit `d40ec6278fe982a7efda6e4ab15646016995a2db`, versión 26.44.2.
- [x] Lectura de API, motor, persistencia, datos, importadores, modelos, MVA, manual y estructura de tests.
- [x] Inventario estático: 532 archivos, 4572 símbolos Python y 129 encabezados de manual, cero errores AST.
- [x] PLAN.md, AUDIT.md, FEATURES.md y este registro.
- [ ] Completar asignación granular manual/acciones→feature ID antes de declarar P0 cerrado.
- [ ] Entorno upstream aislado, importaciones headless, tests numéricos y benchmarks.
- [ ] Implementación, prueba visual en aplicación y validación con datos reales.

**No hay módulo nuevo implementado ni funciones certificadas.** No se ejecutaron pruebas upstream ni se instalaron paquetes. No se alteraron datos experimentales. La lectura estática identifica riesgos, no demuestra la causa de todos los fallos históricos.

## Decisiones de diseño propuestas

1. Nueva pestaña SPECTROview; reutilizar la biblioteca Nexus y mantener los modos antiguos durante desarrollo.
2. Motor/API upstream fijados; UI React nueva. No copiar RGI2 como esqueleto científico ni reescribir el solver.
3. Preferir integración headless; comprobar imports transitivos antes de cerrar diseño de empaquetado.
4. Job por corrida/revisión con checkpoints; fuente inmutable; resultados versionados y modelos reproducibles.
5. Paridad de todas las capacidades originales, incluidas gráficas/MVA/calculadoras/IA/MCP; extensiones grafeno separadas.
6. No inferir coordenadas físicas de dimensiones visuales ni equiparar amplitud lmfit y altura upstream.
7. Clon ignorado por Git exterior; producción usará paquete fijado/vendor explícito con licencia y atribución.

Estas son propuestas registradas, no decisiones de producto ya aprobadas fuera del alcance del plan.

## Hallazgos que no deben perderse

- Puerto real 8888; README del motor muestra 8765 y está desactualizado en ese punto.
- RGI2 usa funciones de RGI, progreso global y copias elegidas por sufijos; su despike puede fallar y continuar.
- API `fit_batch` ofrece progreso/cancelación; `SpectraWorkspace.fit` no es la ruta eficiente de mapas.
- Ocho modelos upstream, sin Voigt exacto en registro. El contrato de salida no incluye incertidumbres.
- Caso VBF de todos los parámetros fijos retorna ceros/success: caracterizar y resolver en el adaptador o patch antes de validación.
- Umbral de ruido puede poner parámetros a cero. Guardar no-detección y QC, no confundir con medición física.
- `m_io.py` importa utilidades del ViewModel y `api/__init__` varios módulos: «sin GUI» requiere prueba real.
- NumPy >=2/pandas >=3/SciPy >=1.17/Python >=3.12 en clon. No confiar en metadatos web cacheados más antiguos.
- MapData usa float32 para señales; comprobar precisión frente al original.
- GPL-3.0-or-later declarada; revisión de distribución pendiente antes de entrega del paquete.

## Próximo tramo concreto (cuando comience implementación)

1. Leer README, AUDIT, PLAN, FEATURES y git status; confirmar HEAD upstream sin actualizarlo automáticamente.
2. Asignar secciones manual y acciones a IDs; resolver diferencias API/GUI y dejar pruebas de caracterización por capacidad.
3. Inspeccionar intérprete real del sidecar y entorno aislado; no instalar dependencias sobre el entorno usado por Nexus.
4. Ejecutar tests existentes de fit_engine/model/API y pruebas de importación sin Qt; registrar comando, entorno y salida.
5. Probar adaptador HDF5 mínimo de solo lectura con fixture sintético; comparar arrays y geometría, no crear aún grandes paneles UI.
6. Elegir sidecar integrado/worker por evidencia, luego contrato y primer recorrido guardable (P2/P3).

## Protocolo para cada sesión

Al comenzar: leer esta memoria y comprobar cambios externos. Al terminar: registrar fase, IDs trabajados, archivos cambiados, comandos/pruebas realmente ejecutados, resultado, decisiones, límites y siguiente acción. En FEATURES, pasar a validado únicamente con evidencia funcional, persistencia y paridad donde aplique.

No regenerar inventarios encima de anotaciones manuales sin guardarlas: el script restablece estados de inventario. Mantener las decisiones en FEATURES/registro o versionar antes de regenerar. Cada actualización upstream requiere registrar ambos commits y diferencias.

Formato de entrada futura:

```text
Fecha / fase / commit Nexus / commit upstream:
Objetivo e IDs:
Cambios:
Evidencia (comando, resultado, artefacto):
Decisiones y motivo:
Pendientes o bloqueo real:
Siguiente acción concreta:
```

## Cambios locales preexistentes que preservar

HEAD Nexus inicial `d3b646896d740e05df0ac6a2a41ce8a7d60494bd`. Ya estaban modificados `.github/workflows/backup.yml`, `next-env.d.ts`, `src-tauri/Cargo.toml`; sin seguimiento `Reference/`, el documento científico en `SPECTROview/`, `docs/database-backups.md`, `google-oauth-form-ready.png`. No incorporarlos accidentalmente a commits de integración ni revertirlos.

## Registro de esta sesión

Clon: primer intento sin acceso ampliado falló por resolución de red; segundo intento terminó correctamente. No hubo rechazo de aprobación. Se creó `.gitignore` local de SPECTROview, documentación e inventario; código upstream sin cambios. Inventario generado con Python 3.13.7 mediante lectura AST y hashes. La implementación queda pendiente conforme a la petición de plan primero.

## Continuación 2026-11-01: revisión y ajuste previo

Implementada vista previa inicial y ajuste individual antes de nuevas corridas desde la interfaz. Comparación con RGI2/upstream, decisiones y pendientes en PREVIEW_REVIEW.md. No repetir auditoría desde cero. Pruebas actuales: 22 del adaptador, 3 API (incluyen paridad preview/mapa, recorte, fondo, índices inválidos y fuente intacta), script test-spectroview-preview.mjs, TypeScript y ESLint pasan. Validación visual de escritorio pendiente. SETUP.md actualizado. Siguiente bloque: revisar visualmente el flujo y ampliar representantes/control de calidad y la matriz de paridad; no declarar integración completa.

## Continuación 2026-11-02: continuidad del inspector y plan operativo

SV09/24/27: el endpoint spectrum recupera componentes guardados, éxito y R²; calcula RMSE de los residuos persistidos sin reajustar. El inspector muestra componentes/métricas también en Saved result. Pulsar mapa cambia al resultado guardado. No cambia el motor ni formato de checkpoints. Prueba API ampliada verifica paridad preview/guardado y recuperación exacta con cliente nuevo; 3 pruebas API pasan. TypeScript y ESLint del módulo pasan. No se repitieron pruebas upstream ni adaptador, pues no cambió cálculo/persistencia.

NEXT_STEPS.md contiene diez bloques priorizados, aceptación del siguiente bloque de selección múltiple y riesgos concretos del constructor, calidad y concurrencia. PLAN.md corrige frases antiguas que afirmaban que no había implementación; FEATURES.md actualiza cobertura parcial. Pendiente verificación visual real. Próxima acción: cerrar recorrido visual y desarrollar selección múltiple con identidad por fila y comparación previa, siguiendo NEXT_STEPS.md. No declarar paridad completa.

## Continuación 2026-11-04: cobertura visible del mapa

SV11/27: endpoint map devuelve statuses por fila original y status_counts mutuamente excluyentes. Filas sin checkpoint permanecen pending (incluidas las no calculadas tras interrupción). La vista alterna valores/estados; estados incluye todas las filas y permite inspeccionar cualquiera. Sin geometría, eje X = índice y eje Y categórico, sin fabricar posiciones ni valores científicos. El panel aparece desde una corrida guardada aunque no tenga bloques. Convergencia no se presenta como aceptación científica.

Validación: 4 tests API pasan (24.004 s), con caso de fila inválida intermedia, índice preservado, inspección fallida, total de estados y corrida aún pendiente. TypeScript y ESLint del módulo pasan. Aplicada revisión React de efectos, peticiones abortables, estado derivado y controles etiquetados. No se modificó solver ni checkpoints. No se ejecutó validación visual ni se repitieron pruebas upstream.

Se adelantó la parte independiente de cobertura del bloque 3 de NEXT_STEPS.md; bloques 1/2 siguen abiertos. Próximo: verificación visual y selección múltiple con ajuste comparativo previo. Filtros/máscaras científicas, persistencia de selección y restantes funciones siguen pendientes. SETUP/FEATURES/NEXT_STEPS actualizados.

## Continuación 2026-11-04: comparación previa de selección

SV07/24: endpoint preview-selection con índices estrictos, únicos y acotados a 1–32; worker reutiliza preview_selection y fit_block vectorizado. Preview individual pasa por la misma ruta. Orden de entrada preservado, resultados/fallos por índice, sin crear corrida ni modificar HDF5. Validación antes de leer espectros. CLI ampliada; solver y checkpoints intactos.

Interfaz: SelectionPreview permite lista por índices y añadir el espectro inspeccionado; tabla de estado/R²/RMSE con inspección de curvas en el visor existente. Selección local por adquisición; resultados temporales ligados a fuente/receta/selección; cambios ocultan resultados antiguos. Inspeccionar una fila satisfactoria permite la misma revisión/adopción explícita de semillas que el ajuste individual. No se aplican semillas automáticamente.

Pruebas: 5 API pasan (15.609 s); después se reforzó caso mixto con centros distintos 1570/1590 y se repitió ese test, pasa (2.341 s). Verifica orden [8,4,0], fila NaN intermedia, coincidencia selección/mapa, ausencia de artefactos y rechazo de vacíos/duplicados/fuera de rango/fracciones/booleanos/más de 32. TypeScript y ESLint pasan. No se hizo validación visual. Actualizados SETUP, FEATURES y NEXT_STEPS.

Siguiente: recorrido visual, selección gráfica y continuidad de selección en análisis persistente; constructor seguro/plantillas y resto de matriz abiertos. No confundir previews temporales con ajuste persistente de una selección o cierre de paridad completa.
