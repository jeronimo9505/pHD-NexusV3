# Continuación y plan de mejoras — 2026-11-02

Este documento actualiza el orden de ejecución de PLAN.md. FEATURES.md sigue siendo el inventario de alcance completo: ninguna capacidad se excluye por no aparecer en el siguiente bloque.

## Estado comprobado

Avance selección (04-11-2026): disponible comparación temporal de hasta 32 índices explícitos, operación vectorizada única, tabla por índice/estado/R²/RMSE e inspección de curvas en el visor existente. Selección persistida localmente por adquisición; respuestas asociadas a configuración/selección y descartadas visualmente si cambian. No incluye aún selección por lazo, trabajos persistentes para selección grande ni validación visual. No se identifican representantes automáticamente.

Avance 04-11-2026: implementada la parte independiente de cobertura del bloque 3. La API devuelve estado por índice y conteos; el mapa permite alternar parámetros/estados, muestra todos los espectros en la segunda vista y permite inspeccionar fallidos o pendientes. También aparece antes del primer bloque calculado. No incluye aún máscaras científicas configurables, filtros de calidad ni comparación de varios representantes. Los bloques 1 y 2 siguen pendientes; esta mejora no requiere esperar su implementación.

Existe una integración preliminar con carga de la adquisición HDF5 desde Nexus, motor upstream fijado, vista previa inicial, ajuste individual, ocho perfiles, fondo automático, restricciones, ajuste de mapa, cancelación/reanudación por bloques, mapa de parámetros y CSV. Las corridas se conservan en el vault. No equivale a paridad completa con SPECTROview.

La revisión de hoy encontró que los componentes ya se guardaban en los bloques, pero no se devolvían al inspector. Se recuperan ahora junto con R², RMSE y éxito del cálculo, sin reajustar ni modificar resultados. Pulsar un punto del mapa cambia explícitamente al resultado guardado; antes podía dejar visible el borrador. La aceptación visual sigue pendiente.

## Orden de trabajo

| Prioridad | Bloque y alcance | Entrega comprobable | Dependencia |
|---|---|---|---|
| 1 | Cerrar recorrido visual (SV09/24/27, NX02) | Cargar → editar → ajustar uno → aplicar → cancelar/reanudar → inspeccionar → reabrir. Probar teclado y ventanas 1280×800, 1440×900 y amplia. Sin controles inaccesibles ni mezcla entre borrador/corrida. | Integración actual |
| 2 | Selección y comparación previa (SV07/24) | Seleccionar explícitamente varios índices/puntos; ajustar esa selección y comparar curvas, residuos y métricas sin lanzar el mapa completo. Mostrar cantidad y procedencia. | 1 |
| 3 | Calidad y cobertura del mapa (SV11/27, base GA03) | Mostrar todos los píxeles, incluidos fallidos y pendientes, con estados diferenciados; resumen cuyos conteos sumen N; filtro de calidad registrado y exportable. | 2 |
| 4 | Constructor y plantillas (SV20–23) | Eliminar cualquier pico con reindexación segura; prevenir expresiones rotas al borrar/cambiar perfil; plantillas versionadas con importar/exportar y restauración exacta. | 1 |
| 5 | Preparación completa (SV14–19/25) | Fondo manual, eje, normalización, cósmicos, pesos/ruido/tolerancias; previsualizar y registrar cada operación y su orden; restaurar originales. | 4, contrato de receta |
| 6 | Mapas y resultados avanzados (SV08/10–13/28) | Rangos, mapas en vivo/RGB, perfiles espaciales, tabla por píxel, columnas calculadas y selección enlazada estable. | 3 y 5 |
| 7 | Gráficas y multivariante (SV29–32/34) | Nueve tipos de gráficas, filtros/recetas/exportación, PCA/NMF y calculadoras con pruebas contra upstream y sesiones reproducibles. | 6 |
| 8 | Formatos y funciones transversales (SV01–06/33/35–38) | Importación/conversión, sesiones nativas, ayuda, preferencias, automatización y asistente; cada función del inventario tiene destino y prueba. | Contratos estabilizados |
| 9 | Perfil grafeno–Au (GA01–06) | Bandas por excitación, modelos comparables, magnitudes y unidades, incertidumbre identificable, comparación control/Au y reporte metodológico. | 3–7 y datos experimentales para aceptación científica |
| 10 | Distribución y regresión final (P9) | Instalación limpia Windows/Tauri, recuperación ante fallos, licencias/atribución, rendimiento/memoria y regresión Nexus. | Cierre de matriz |

Los bloques 7–9 no autorizan omitir funciones pendientes de bloques anteriores. No se estima una fecha de finalización sin cerrar y medir los bloques 1–3.

## Especificación del siguiente bloque de desarrollo: varios espectros

1. Introducir selección de índices originales únicos y validados; nunca usar posición dentro de una tabla filtrada como identidad científica.
2. Conservar la selección en el borrador por adquisición. Mantener selección, píxel inspeccionado y alcance del trabajo como conceptos distintos.
3. Añadir operación de ajuste de selección con un resultado por índice y la misma configuración efectiva de `fit_block`. Límite explícito de tamaño de vista previa; para selecciones grandes usar trabajo persistente y bloques, no múltiples peticiones por píxel.
4. Invalidar resultados al cambiar fuente, selección o receta. Ignorar respuestas antiguas al navegar. Mostrar errores parciales sin descartar resultados válidos de otros índices.
5. Comparar los espectros individualmente; un promedio puede ocultar poblaciones distintas. No seleccionar automáticamente representantes de RGI2 sin registrar método, semilla y pertenencia a clúster.
6. Aplicar al mapa debe mostrar la configuración y número de espectros. La adopción de semillas sigue siendo una acción explícita; no ampliar límites automáticamente.
7. Aceptación: paridad con las mismas filas de una corrida completa, orden estable, selección duplicada/fuera de rango, datos inválidos, navegación durante respuesta y conservación del archivo fuente.

## Calidad: separar cálculo de aceptación científica

- Convergencia, datos inválidos, puntos insuficientes y pendientes son estados del cálculo.
- R², RMSE y proximidad a límites son diagnósticos; ningún umbral universal convierte automáticamente un ajuste en científicamente válido.
- Definir umbrales configurables y guardar la máscara con sus razones. Cambiar la máscara no recalcula ni destruye el ajuste original.
- Asegurar categorías excluyentes para reconciliar el total; mantener razones adicionales por píxel cuando sean múltiples.
- Exportar todos los índices y sus estados; las estadísticas indican qué máscara utilizan. Incertidumbre y AICc/BIC requieren un tratamiento adicional, no se deducen del R².

## Riesgos concretos que deben cerrarse

- El constructor actual solo elimina el último pico; expresiones dependientes pueden quedar inválidas. El servidor las rechaza, pero la interfaz necesita explicación y operación segura.
- Cambiar el perfil reinicializa parámetros. Debe mostrar el efecto y conservar los compatibles únicamente con semántica y restricciones válidas.
- El mapa de parámetros omite fallos y pendientes. Hace falta una capa de estado que permita inspeccionarlos.
- Las expresiones con dependencias hacia delante están limitadas actualmente; resolver el orden tanto en evaluación como optimización antes de declarar paridad.
- Las vistas previas automáticas usan procesos separados. Medir latencia y solicitudes concurrentes antes de extenderlas a muchos espectros; abortar una petición del navegador no garantiza detener el cálculo del servidor.
- Verificar un reinicio real de la aplicación y un recorrido de escritorio. Las pruebas de API no sustituyen esa comprobación.

## Memoria y criterios de cierre por entrega

Actualizar MEMORY.md con cambios, pruebas realmente ejecutadas y siguiente acción. Actualizar FEATURES.md por IDs, sin convertir implementación parcial en función cerrada. Guardar evidencia en validation/REPORT.md; distinguir inspección de código, pruebas numéricas y recorrido visual.

Una entrega está terminada cuando su cálculo, estado de interfaz, persistencia y recuperación funcionan juntos. Mantener upstream fijado y adquisiciones originales intactas. No retirar RGI/RGI2 ni migrar sus sesiones destructivamente.
