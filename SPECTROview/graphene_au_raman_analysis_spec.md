# Especificación científica y técnica: análisis Raman avanzado de grafeno después de la deposición de Au

**Documento:** requisitos experimentales, metodológicos y de software  
**Fecha:** 29 de octubre de 2026  
**Motor de software seleccionado:** [SPECTROview](https://github.com/CEA-MetroCarac/SPECTROview)  
**Contexto:** estudio de transferencia y posterior deposición de Au sobre grafeno; aplicación potencial como sustrato SERS  
**Estado:** especificación de análisis; los mecanismos físicos son hipótesis, no conclusiones demostradas.

## 1. Objetivo general

Desarrollar y validar un flujo de análisis cuantitativo, reproducible y escalable para mapas Raman de grafeno, tomando SPECTROview como base open source. El flujo debe procesar un número arbitrario **N** de espectros, extraer con fiabilidad las posiciones, anchuras a media altura (**FWHM**), áreas e intensidades de las bandas características de grafeno, evaluar la calidad de los ajustes y establecer relaciones estadísticas y espaciales entre los parámetros.

La finalidad científica es identificar cambios inducidos durante la transferencia y/o por la deposición de oro (**Au**), diferenciando, hasta donde permitan los datos, contribuciones debidas a defectos, deformaciones (*strain*), dopaje, heterogeneidad local, acoplamiento electrónico con Au, apantallamiento dieléctrico y fenómenos ópticos/plasmónicos. **Los parámetros Raman aislados no constituyen prueba inequívoca de ninguno de esos mecanismos.**

Además, se desea determinar si los cambios estructurales y electrónicos del grafeno afectan la idoneidad del sistema grafeno–Au para **SERS** (*surface-enhanced Raman scattering*), sin asumir que la anchura de la banda G o 2D equivale a un factor de realce SERS.

## 2. Problema científico

Se han observado dos modificaciones destacadas al comparar grafeno de referencia con grafeno sometido a deposición de Au:

1. **Ensanchamiento considerable de la banda 2D:** desde menos de **32 cm⁻¹** en la referencia hasta aproximadamente **50–51 cm⁻¹** tras el proceso. Tomando 32 cm⁻¹ como límite superior inicial, el aumento es **al menos 18 cm⁻¹ (56,25 %)**.
2. **Posible desplazamiento de las bandas Raman**, especialmente 2D, aún sin cuantificar con un control equivalente medido bajo las mismas condiciones.

Los mapas más recientes muestran también una banda **G extraordinariamente ancha**, aproximadamente 43 cm⁻¹, que requiere comprobar la calidad del ajuste antes de interpretarla físicamente.

Las razones de intensidades comunicadas son **I(2D)/I(G) > 1,5** e **I(D)/I(G) < 0,3**. Son compatibles con grafeno de baja activación relativa de D y con una señal 2D intensa, pero **no prueban por sí solas** que la muestra sea monocapa intacta, especialmente en presencia de Au, donde dopaje, interferencia óptica, fondo y realce diferencial pueden alterar las intensidades. La forma de 2D y las medidas complementarias deben evaluarse.

### 2.1. Datos disponibles (preliminares)

| Variable | Valor observado | Estado / advertencia |
|---|---:|---|
| Número de espectros por mapa | ~2500 (un mapa previo mostró 2466 píxeles analizados) | Confirmar total y máscara de exclusión |
| Excitación | 632,8 nm | Según capturas disponibles |
| Tiempo de integración | 0,5 s | Confirmado |
| Acumulaciones | 1 | Confirmado |
| Potencia sobre la muestra | Descrita como baja | **No cuantificada** en mW |
| Posición media G | 1589,439 cm⁻¹ | Extraída de histogramas; no reajustada |
| FWHM media G | 43,089 cm⁻¹ | Extraída de histogramas; pendiente de validación |
| Posición media 2D | 2641,946 cm⁻¹ | Extraída de histogramas; no reajustada |
| FWHM media 2D | 51,360 cm⁻¹ | Extraída de histogramas; pendiente de validación |
| FWHM de 2D en referencia | <32 cm⁻¹ | Valor orientativo facilitado por el investigador |
| I(2D)/I(G) | >1,5 | Confirmar si se trata de alturas o áreas |
| I(D)/I(G) | <0,3 | Confirmar método de cálculo y distribución |
| Método y espesor de Au | No comunicados | No suponer sputtering/evaporación ni cobertura uniforme |
| Posición G y FWHM G de referencia | No disponibles | Imprescindibles para inferir cambio inducido por Au |

**Restricción:** no usar estos promedios de histogramas para deducir correlaciones entre píxeles. Se requiere cada registro espectral con su posición espacial y sus parámetros apareados.

## 3. Preguntas de investigación

1. ¿Es reproducible un FWHM(G) cercano a 43 cm⁻¹ o es en parte consecuencia de SNR baja, fondo, D′, ruido cósmico, resolución o elección del modelo?
2. ¿Se conserva una banda 2D de perfil compatible con una monocapa, aun cuando su FWHM supera 50 cm⁻¹?
3. ¿Los aumentos de FWHM(G) y FWHM(2D) están correlacionados **píxel a píxel** y espacialmente?
4. ¿Qué desplazamientos de G y 2D se producen respecto a una referencia realmente comparable?
5. ¿Qué parte de la variación puede asociarse a strain y dopaje bajo las hipótesis del modelo de correlación Raman? ¿Existen residuos incompatibles con un modelo de solo dos mecanismos?
6. ¿Existen subpoblaciones espectrales (dominios con distinta interacción Au–grafeno) ocultas detrás de histogramas unimodales?
7. ¿Cambian los resultados con tiempo total de adquisición, potencia o longitud de onda del láser?
8. ¿El sistema conserva suficiente orden estructural y reproducibilidad para uso como sustrato SERS?
9. ¿Qué evidencias adicionales serían necesarias para atribuir contribuciones a transferencia de carga, apantallamiento o plasmones?

## 4. Requisitos funcionales del análisis de N espectros

### 4.1. Escalabilidad y reproducibilidad

- Procesar inicialmente **N ≈ 2500** espectros y admitir N mayor sin límites arbitrarios por diseño.
- Mantener el vínculo **(identificador, x, y, espectro, metadatos, resultados, indicadores de calidad)**.
- Ejecutar ajustes individuales o vectorizados por lotes sin modificar la interpretación del resultado.
- Preservar las señales y metadatos originales; cualquier corrección debe ser reversible y trazable.
- Guardar versión de software, revisión de código, modelo, ventanas, restricciones, parámetros iniciales, algoritmo, semilla (si corresponde), estrategia de exclusión y configuración instrumental.
- Permitir reanálisis con idéntico pipeline y exportación tabular de resultados por píxel.
- Registrar espectros fallidos, saturados, ruidosos, no identificables y aquellos cuyos parámetros alcanzan límites impuestos.

### 4.2. Preprocesamiento controlado

Se requieren operaciones activables individualmente, con comparación antes/después:

- Detección y eliminación de picos cósmicos sin borrar bandas Raman genuinas.
- Corrección de la línea base (constante, lineal y alternativas justificadas). Evitar sobrecorregir las colas de las bandas.
- Control de picos de sustrato y contribuciones ópticas de Au.
- Calibración del eje Raman y registro de resolución instrumental.
- Evaluación objetiva de SNR por banda usando regiones locales de fondo.
- **No suavizar de manera predeterminada antes de calcular FWHM**; si se explora un suavizado, evaluar su sesgo con espectros simulados.
- No normalizar intensidad de un modo que oculte cambios físicos, particularmente al comparar I(2D)/I(G) o áreas.

### 4.3. Identificación de bandas

Detectar y ajustar, donde haya cobertura espectral suficiente:

| Banda | Interpretación principal | Precaución |
|---|---|---|
| D | Activación por desorden / dispersión intervalle | Depende de energía de excitación y defectos |
| G | Fonón óptico de primer orden | Puede solaparse con D′; evaluar asimetría |
| D′ | Activación por desorden, vecina de G | No forzar su presencia en datos con baja SNR |
| 2D | Segundo orden/doble resonancia | Su posición depende mucho de energía láser; forma y número de componentes importan |
| D+D′, 2D′ y otras | Opcional | Solo si el rango y SNR permiten resolverlas |

Las ventanas iniciales deben calibrarse para **632,8 nm** y ajustarse mediante datos reales; no usar posiciones estándar de 532 nm sin corregir por dispersión.

## 5. Motor de fitting: modelos y condiciones

### 5.1. Conjunto mínimo de modelos

- **Lorentziana + fondo:** modelo de referencia para G y 2D aproximadamente simétricas de monocapa.
- **Voigt + fondo:** para evaluar perfiles mixtos; no interpretar directamente sus partes como strain y lifetime sin validación.
- **Pseudo-Voigt:** opcional como aproximación computacional validada frente al Voigt exacto.
- **G + D′ (dos componentes):** comparar exclusivamente cuando la forma de la banda, residuos y SNR justifiquen la segunda componente.
- **BWF/Fano:** exploratorio si hay asimetría reproducible y físicamente argumentable, no como explicación automática de interacción electrónica.
- **Modelos multicomponente para 2D:** solo cuando la forma espectral y el objetivo físico lo justifiquen; un FWHM elevado no demuestra por sí mismo bicapa AB.

### 5.2. Parámetros por banda

Para cada banda y píxel, exportar:

- Posición central y su incertidumbre, cm⁻¹.
- FWHM **observado** y su incertidumbre, cm⁻¹.
- Altura máxima sobre fondo.
- Área integrada del componente y su incertidumbre cuando pueda estimarse.
- Modelo seleccionado y número de componentes.
- Indicadores de convergencia, límites activos y posible degeneración de parámetros.
- Métricas de SNR y de ajuste; curva ajustada y residuos disponibles para inspección.

**Nota sobre FWHM:** en una Lorentziana bien parametrizada, la anchura puede ser un parámetro directo. En Voigt hay que calcular la anchura total del perfil resultante, no confundirla con la anchura Lorentziana interna. No usar una misma fórmula instrumental de deconvolución para funciones Gauss, Lorentz y Voigt.

### 5.3. Criterios de selección de modelos

- Emplear **residuos**, comportamiento de colas y regiones solapadas, no solo R².
- Comparar **AICc/BIC** cuando los modelos se ajusten sobre los mismos datos y bajo supuestos compatibles.
- Considerar incertidumbre, identificabilidad, estabilidad ante pequeños cambios de ventana/fondo y plausibilidad física.
- Introducir componentes adicionales solo si la mejora es robusta y no genera soluciones degeneradas.
- Conservar un **modelo fijo de referencia** para comparar controles y Au, además de un análisis de sensibilidad con modelos alternativos.
- No descartar píxeles solo porque contradigan la hipótesis física; clasificar su calidad con criterios predefinidos.

## 6. Incertidumbre y control de calidad

La adquisición original es de **0,5 s × 1**. La baja cantidad de fotones puede afectar la precisión y estabilidad del ajuste, pero **no implica un sesgo obligatorio hacia FWHM mayores**.

La validación debe comprender:

1. Inspección de espectros representativos y extremos de FWHM.
2. Estimación del ruido y análisis de residuos por banda.
3. Ensayos de repetición en puntos fijos: 0,5 s × 1; 0,5 s × 10; 0,5 s × 20; 5 s × 2, manteniendo potencia constante y vigilando daño/fotocalentamiento.
4. Comparación de FWHM y centros frente a tiempo total y organización de adquisiciones.
5. Medida de referencia para estimar función instrumental del espectrómetro y estabilidad de calibración.
6. Simulación de espectros con posiciones/FWHM conocidos, ruido realista, fondo, D′ variable y señal de Au, verificando sesgo y dispersión de estimadores.
7. Reporte de porcentaje de convergencia, porcentaje de intervalos útiles y proporción de valores excluidos por criterio explícito.

**Tests sintéticos mínimos:** (i) G Lorentziana aislada; (ii) G+D′ solapadas; (iii) 2D Lorentziana ensanchada; (iv) Voigt con resolución instrumental; (v) fondo inclinado; (vi) ruido proporcional a señal; (vii) picos cósmicos; (viii) dos regiones con parámetros diferentes; (ix) datos degenerados o saturados. Evaluar error de posición y FWHM, cobertura de intervalos de incertidumbre y sensibilidad a la SNR.

## 7. Estadística de mapas: más allá de los histogramas

### 7.1. Resúmenes robustos

Por cada parámetro, calcular media, mediana, desviación estándar, MAD, rango intercuartílico, percentiles 5/25/50/75/95, intervalos de incertidumbre y cantidad de píxeles válidos. Mostrar distribuciones y mapas espaciales con la misma máscara de calidad.

**Cuidado:** los 2500 píxeles vecinos son mediciones espacialmente correlacionadas, no necesariamente 2500 réplicas independientes. Reportar replicación entre regiones y entre muestras; para intervalos por mapa usar **bootstrap espacial por bloques** u otros métodos compatibles con autocorrelación.

### 7.2. Análisis bivariado indispensable

- **FWHM(2D) vs FWHM(G):** asociación entre anchuras, con pendiente estimada e incertidumbre; **no** confundir una pendiente de incrementos con el cociente de anchuras absolutas.
- **Pos(2D) vs Pos(G):** correlación strain/dopaje, con referencias calibradas a la excitación y limitaciones bajo interacción metálica.
- **FWHM(2D) vs área(2D):** variación de anchura frente al peso espectral; evaluar si existe señal de ensanchamiento inhomogéneo.
- **FWHM(G) vs posición(G)** y **FWHM(G) vs I(D)/I(G)**: comprobar relaciones entre anchura, desplazamiento y desorden Raman.
- **I(2D)/I(G) vs FWHM(2D)** y **área(2D)/área(G)**: comprobar si la intensidad cambia junto con el ensanchamiento.
- Matriz de Pearson y Spearman con intervalos que respeten dependencia espacial, y gráficos de dispersión ligados a la posición (x, y).

### 7.3. Análisis espacial

- Mapas de posición, FWHM, intensidad, área, defectos, SNR y residuales del ajuste.
- Autocorrelación espacial y análisis de tamaño de dominios cuando la resolución del mapa y su paso lo permitan.
- Detección de regiones con cambios sistemáticos de bandas sin perder la localización de sus píxeles.
- Correlación con topografía AFM u otras imágenes **solo tras registro geométrico** y evaluación de la escala/resolución.

### 7.4. Análisis multivariante exploratorio

PCA, clustering y métodos similares pueden ayudar a identificar subpoblaciones, pero requieren controlar previamente la influencia de fondo, intensidad, SNR y normalización. Inspeccionar siempre los *loadings*, espectros promedios por grupo y mapas de pertenencia. **Un cluster matemático no equivale automáticamente a una fase física.**

## 8. Hipótesis físicas y pruebas discriminantes

| Hipótesis | Firma compatible | Evidencia adicional requerida |
|---|---|---|
| Strain nanométrico heterogéneo | Ensanchamiento de G/2D y relaciones espaciales entre anchuras | AFM, correlaciones intra-píxel, controles mecánicos |
| Dopaje por transferencia de carga | Cambio en G, frecuentemente estrechamiento de G para dopaje uniforme; cambios en intensidades | Posiciones y FWHM de control, KPFM/UPS cuando sean interpretables, análisis electrónico |
| Dopaje espacialmente heterogéneo | Ensanchamiento por mezcla de desplazamientos locales | Mapa y caracterización de potencial/cobertura a escala comparable |
| Apantallamiento electrónico por Au | Desplazamiento de 2D no explicado completamente por strain/dopaje | Control de interfaz y evidencia electrónica independiente |
| Acoplamiento plasmónico | Dependencia resonante de intensidad/perfil con excitación o emisión Raman | Respuesta óptica de Au, Raman multiexcitación y controles de geometría |
| Daño de red | Crecimiento de D/D′ y posibles modificaciones de perfiles | Análisis de defectos, técnica de deposición, caracterización adicional |
| Problema de fitting | FWHM depende sensiblemente del fondo, D′, modelo o SNR | Espectros originales, residuos, benchmark sintético y medidas de SNR alta |

**Evitar afirmaciones causales basadas solamente en FWHM o intensidades.** Comparar muestras medidas con idénticas condiciones y un diseño experimental que aísle el proceso de deposición del material Au.

## 9. Vinculación con SERS

El propósito aplicado es desarrollar superficies **grafeno–Au** para realce Raman de moléculas. La calidad Raman del grafeno debe interpretarse por separado del rendimiento analítico del sensor.

Medidas SERS recomendadas:

- Molécula patrón con bandas distinguibles de G/D/2D, sobre grafeno + Au y controles apropiados.
- Intensidad de bandas del analito, reproducibilidad espacial y entre sustratos, fondo y estabilidad temporal.
- Factor de realce SERS únicamente cuando se conozcan y justifiquen las cantidades/número de moléculas de referencia y SERS bajo una definición comparable.
- En aplicaciones VOC: adsorción, selectividad, concentración conocida, tiempo de exposición, recuperación y límite de detección con criterio estadístico definido.
- Evaluar si G ensanchada genera interferencia con analitos en la región ~1590 cm⁻¹.

**No equiparar** incremento de intensidad Raman de G/2D a incremento del realce de una molécula objetivo. La interacción Au–grafeno puede alterar las bandas propias del grafeno sin proporcionar un SERS proporcional para el analito.

## 10. Arquitectura de software propuesta sobre SPECTROview

### 10.1. Capacidades verificadas del proyecto base

El README oficial de [SPECTROview](https://github.com/CEA-MetroCarac/SPECTROview) documenta análisis de espectros discretos y mapas hiperespectrales 2D, **Vectorized Batch Fit**, modelos de ajuste personalizados, exportación unificada de resultados y visualización. El proyecto requiere Python ≥3.12 y publica documentación para desarrolladores. Existe una publicación en *SoftwareX* (2026). 

**No se ha auditado en este documento el motor interno ni ejecutado un benchmark contra tus archivos.** Por ello, las capacidades especializadas descritas abajo son **requisitos de adaptación** que deberán contrastarse con el código antes de afirmar que ya existen.

### 10.2. Extensiones propuestas

1. Perfil de análisis `graphene`: catálogo de bandas, ventanas dependientes de láser, modelos Lorentz/Voigt, G+D′ y reglas de selección.
2. Modelo de datos común por píxel con incertidumbres, máscara de QC, parámetros y coordenadas espaciales.
3. Interfaz de inspección del ajuste bruto + fondo + componentes + residuos y selección de píxeles a partir de mapas.
4. Benchmark reproducible de fitting sobre espectros sintéticos y reales de alta SNR.
5. Correlaciones de anchuras, posiciones, áreas e intensidades y estadísticas espaciales robustas.
6. Comparador `control vs Au` con igual algoritmo y metadatos instrumentales, sin cambiar el modelo silenciosamente.
7. Exportación estructurada de tabla y configuración, figuras y reporte metodológico.

### 10.3. Rendimiento y seguridad metodológica

- Procesar mapas por bloques de memoria si N aumenta; parametrizar tamaño del lote.
- No sacrificar precisión física por velocidad: contrastar resultados vectorizados con un solver independiente en un subconjunto representativo.
- Proteger frente a NaN/Inf, ejes no monótonos, espectros sin picos, límites saturados, intensidades negativas tras fondo y fallas de convergencia.
- Guardar diagnósticos en cada caso; **no reemplazar silenciosamente parámetros fallidos por ceros**.
- Comprobar condiciones de redistribución de la licencia **GPL-3.0** antes de incorporar o distribuir código adaptado; preservar atribuciones y obligaciones correspondientes.

## 11. Criterios de aceptación y validación

El sistema no estará listo para interpretar físicamente los mapas solo porque termine el procesamiento. Antes deben superarse estas etapas:

1. **Exactitud con datos sintéticos:** recuperar centros y FWHM conocidos en condiciones de SNR y solapamiento comparables a los datos reales; documentar sesgo y error con tolerancias definidas tras caracterizar resolución y ruido.
2. **Comparación de optimizadores:** SPECTROview frente a un ajuste independiente de referencia para un subconjunto estratificado de espectros; investigar discrepancias.
3. **Robustez:** resultados relativamente estables ante variaciones justificadas de inicialización, baseline y ventana; informar variaciones cuando no lo sean.
4. **Calidad de ajuste:** métricas y residuos sin patrones sistemáticos en los píxeles incluidos; componentes adicionales deben ser identificables.
5. **Escalabilidad:** completar el mapa de ~2500 espectros sin pérdidas, con reporte de tiempo, memoria, convergencia y fallos; repetir a N mayores.
6. **Trazabilidad:** reproducir parámetros y gráficos desde el mismo conjunto de espectros, configuración y versión del código.
7. **Inferencia científica:** distinguir observación, interpretación y mecanismo confirmado; comprobar incertidumbre instrumental y comparar con controles pertinentes.

No se fijan tolerancias numéricas arbitrarias de FWHM sin conocer la dispersión espectral por píxel, la resolución instrumental, la SNR real y la amplitud/forma de cada banda.

## 12. Información experimental pendiente de reunir

**Prioridad crítica:** espectros brutos (al menos uno de control y uno con Au), mapa de espectros y posiciones por píxel, configuración de baseline y perfil de ajuste actualmente usado; resultados de referencia para posición/FWHM de G y 2D.

**Instrumental:** potencia real sobre muestra (mW), objetivo y apertura numérica, red de difracción, resolución espectral y calibración, rango espectral, paso espacial y tamaño del foco, detector, condiciones de enfoque, fecha y secuencia de medición.

**Preparación:** método de deposición de Au, espesor nominal, tasa y condiciones, historial térmico/vacío, material del sustrato, proceso de transferencia, limpieza/PMMA, tiempo transcurrido hasta Raman y morfología del Au (AFM/SEM si existe).

**Controles:** grafeno antes de Au, grafeno sometido al proceso sin Au cuando sea posible, Au sobre sustrato sin grafeno y réplicas de muestras independientes.

## 13. Plan por fases

| Fase | Actividad | Entregable |
|---|---|---|
| 0 | Verificar versión, arquitectura, tests y licencia de SPECTROview | Informe de viabilidad y componentes reutilizables |
| 1 | Importar N espectros con metadatos (sin atarse a formatos concretos) | Cubo Raman y validación de integridad |
| 2 | Implementar/validar perfiles G, D, D′, 2D y comparador de modelos | FWHM, posición, área e incertidumbres por píxel |
| 3 | Pruebas sintéticas + medidas de alta SNR | Validación de precisión, sesgo y robustez |
| 4 | Estadística de mapa y comparaciones control/Au | Correlaciones, mapas de heterogeneidad, QC y reporte |
| 5 | Caracterización complementaria y experimentos discriminantes | Discusión física contrastada y límites de inferencia |
| 6 | Evaluación con analito SERS | Sensibilidad, reproducibilidad, selectividad y limitaciones |

## 14. Referencias científicas y de software

### Software

- Le, V. H. (2026). *SPECTROview: An Open-Source Application for Interactive Spectroscopic Data Processing, Fitting, and Visualization*. **SoftwareX, 35**, 102862. https://doi.org/10.1016/j.softx.2026.102862
- Repositorio oficial: https://github.com/CEA-MetroCarac/SPECTROview
- Documentación oficial: https://cea-metrocarac.github.io/SPECTROview/
- Goldie et al., metodología estadística Raman en materiales de carbono: https://doi.org/10.1021/acsanm.0c02361

### Física Raman de grafeno e interacciones con Au

- Ferrari, A. C. & Basko, D. M. (2013). *Raman spectroscopy as a versatile tool for studying the properties of graphene*. **Nature Nanotechnology**. https://doi.org/10.1038/nnano.2013.46
- Lee et al. (2012). *Optical separation of mechanical strain from charge doping in graphene*. **Nature Communications**. https://doi.org/10.1038/ncomms2022
- Neumann et al. (2015). *Raman spectroscopy as probe of nanometre-scale strain variations in graphene*. **Nature Communications**. https://doi.org/10.1038/ncomms9429
- Ghamsari et al. (2015). *Frequency pulling and line-shape broadening in graphene Raman spectra by resonant Stokes surface plasmon polaritons*. **Physical Review B**. https://doi.org/10.1103/PhysRevB.91.201408
- Weis et al. (2018). *Surface-enhanced Raman spectra on graphene*. **Journal of Raman Spectroscopy**. https://doi.org/10.1002/jrs.5228
- *Sensitive Raman Probe of Electronic Interactions between Monolayer Graphene and Substrate under Electrochemical Potential Control*. **ACS Omega** (2018). https://doi.org/10.1021/acsomega.7b01928

## 15. Resultado esperado

Obtener un sistema científico confiable y adaptable, sustentado en un motor open source mantenible, capaz de convertir **N espectros Raman de grafeno** en resultados cuantitativos auditables: posiciones, FWHM, áreas, intensidades, incertidumbres, modelos seleccionados, mapas de calidad, distribuciones y asociaciones espaciales. Su primer objetivo será verificar si el ensanchamiento de G (~43 cm⁻¹) y 2D (~51 cm⁻¹) tras la deposición de Au es real y cuantificarlo frente a controles; el siguiente será contrastar mecanismos físicos mediante mediciones independientes, sin confundir correlaciones Raman con prueba directa de transferencia de carga, apantallamiento o plasmones.
