# Validación de la primera integración

Actualizado: 31-10-2026. Revisión upstream: `d40ec6278fe982a7efda6e4ab15646016995a2db` (26.44.2).

## Lo comprobado

| Comprobación | Resultado |
|---|---|
| Entorno aislado Windows/Python 3.13 | Instalado en `SPECTROview/.venv`; `pip check`: sin incompatibilidades declaradas |
| API upstream sin ventana | Importación correcta; `QApplication.instance()` es None |
| Importación del router desde Python original Nexus | No importa el paquete SPECTROview ni cambia sus dependencias |
| Tests upstream de fit_engine, API, SpectraStore y WorkspaceIO | **376 passed**, 17.71 s; reporte `upstream-tests.xml` |
| Tests nuevos de integración HDF5/motor/checkpoints | **22 passed** |
| Tests HTTP con worker real aislado | **2 passed**: ajuste, doble inicio, mapa, inspector, CSV, recuperación de sesión y rechazo de origen externo |
| TypeScript de Nexus | `tsc --noEmit --incremental false`: código 0 |
| Regresiones de canvas, identidad y render de workspace | Tres scripts existentes: PASS |
| Revisión visual en ventana Tauri | **Pendiente**; acceso a la ventana agotó el tiempo de autorización, sin acciones sobre ella |

Las primeras ejecuciones de pruebas fallaron por permisos de archivos temporales y por una carpeta temporal faltante. Se corrigió el entorno de ejecución y se repitieron. Una nueva prueba asumía erróneamente ausencia total de imports Qt: la evidencia muestra que `fit_engine/__init__.py` importa `VBFthread`. Se corrigió la condición a ausencia de una aplicación/event loop; no se simuló ni se omitió el motor.

## Benchmark sintético reproducible

Ver `benchmark.py` y `benchmark-results.json`. Tres Lorentzianas, 701 canales, ruido gaussiano σ=0.15, semilla 20261031, bloques de 128, pérdida lineal, negativos incluidos, tolerancias 1e-8. Sin baseline ni normalización. Entorno y versiones en el JSON y `requirements-windows-py313.lock`.

| Espectros | Tiempo | Convergencia | Máximo error absoluto de centro | Máximo error absoluto de FWHM |
|---:|---:|---:|---:|---:|
| 2500 | 2.874 s | 2500/2500 | 0.1163 cm⁻¹ | 0.4041 cm⁻¹ |
| 25000 | 19.963 s | 25000/25000 | 0.1271 cm⁻¹ | 0.3589 cm⁻¹ |

Para ocho espectros de cada ejecución se comparó contra `scipy.optimize.least_squares` con función Lorentziana independiente. Máxima diferencia absoluta entre parámetros: <1.8e-7. El tiempo incluye generación de señal y esa comparación, pero **no incluye** importación HDF5, escritura de checkpoints, transferencia HTTP ni renderizado. No se midió memoria máxima. No extrapolar a otros modelos, fondos, SNR ni archivos reales.

## Comportamientos garantizados por tests de esta entrega

- Se conserva el archivo fuente byte a byte; no se reemplazan NaN por señales cero.
- Las filas excluidas/fallidas conservan su índice y se distinguen de convergencia.
- Un eje descendente se revierte junto con las intensidades; ejes duplicados/incompatibles se rechazan.
- Geometría WIP usa transformación y orden de filas del importador existente. Coordenadas irregulares se conservan. Falta de geometría no genera coordenadas físicas ficticias.
- Se evalúan modelos totalmente fijos y se etiquetan `evaluated`, evitando el early-return de ceros upstream.
- Cancelar/reanudar conserva bloques terminados; se verifica SHA-256 de fuentes/checkpoints y hash de configuración.
- Se registra versión de dependencias y hash del código científico/adaptador; otra revisión no puede reanudar mezclando algoritmos.
- El router invoca un worker separado; no requiere instalar SPECTROview en el Python original.

## Límites abiertos

La UI es una vista preliminar, todavía sin validación visual end-to-end. No hay paridad total con SPECTROview. Faltan selección de subconjuntos, modelos/plantillas con todas las interacciones, baseline manual, normalización y despike completos, múltiples mapas, curvas por componente en UI, gráficas avanzadas, MVA, calculadoras, import/export nativo, IA/MCP y extensiones grafeno–Au.

Las expresiones con dependencias hacia adelante se rechazan explícitamente para evitar valores iniciales obsoletos en upstream; queda pendiente resolverlas con paridad. «Completed» significa que todos los bloques fueron procesados: la calidad científica se consulta por fila, y el mapa omite no convergentes. Incertidumbre, AICc/BIC y QC físico no están implementados. No se ejecutó el benchmark experimental del documento científico.

No se han actualizado datos cloud ni distribuido un instalador; los originales permanecen locales. La integración de los análisis nuevos como derivados dentro del árbol de adquisiciones está pendiente; por ahora aparecen en Saved analyses dentro de la pestaña.

## Vista previa — 2026-11-01

22 pruebas de integración + 3 API pasan; test-spectroview-preview.mjs pasa. TypeScript y ESLint pasan. La API verifica paridad numérica entre ajuste previo y mapa, evaluación de semillas, componentes, recorte/fondo, rechazo de peticiones inválidas y ausencia de escritura de adquisiciones/corridas durante preview. No se repitieron las 376 pruebas upstream en este cambio: motor upstream intacto. Validación visual pendiente. Detalle: ../planning/PREVIEW_REVIEW.md.

## Recuperación de componentes — 2026-11-02

3 pruebas API pasan (20.09 s): se añaden comparación de componentes/R²/RMSE/éxito entre preview y corrida, y recuperación exacta con cliente nuevo. TypeScript sin emisión y ESLint del módulo pasan. Sin cambios al solver ni checkpoints. Inspector guardado y selección desde mapa corregidos; comportamiento visual pendiente de comprobar en escritorio. Plan operativo: ../planning/NEXT_STEPS.md.

## Cobertura de estados — 2026-11-04

4 pruebas API pasan en 24.004 s. Se verifica corrida pendiente (9/9), completada (9 convergentes), mapa con NaN en fila intermedia (8 convergentes + 1 inválida), valor nulo y estado/índice correctos al inspeccionarla. TypeScript y ESLint pasan. Mapa de estados sin recálculo ni cambios al formato de resultados. Pendiente recorrido visual en escritorio y comparación de selección múltiple.

## Comparación de selección — 2026-11-04

5 pruebas API pasan; caso mixto reforzado y vuelto a ejecutar pasa con centros distintos e índice inválido intermedio. Se verifica paridad con filas del mapa, orden, validación estricta y ausencia de escrituras de corrida durante preview. TypeScript y ESLint pasan. Límite de selección previa: 32. Resultados temporales, selección local por adquisición. Recorrido visual pendiente.

## Constructor y escritorio — 2026-11-04

Pruebas frontend de eliminación segura y estado de preview pasan; ESLint pasa. Verificadas referencias P10/P2, borrado intermedio, restricciones preservadas y rechazo sin mutación. Acceso de lectura a Nexus funciona, pero navegación falló al identificar el proceso de la ventana; recuperación no encontró destino único. No se declara aceptación visual de SPECTROview.
TypeScript sin emisión también pasa para esta entrega.
