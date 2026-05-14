# Preprocessing pipeline en Raman: orden recomendado y uso en grafeno

## 1. Idea principal

Un *preprocessing pipeline* en Raman es la secuencia de pasos que se aplica al espectro bruto antes de extraer información: posiciones de picos, intensidades, áreas, FWHM, ratios o mapas químicos.

La idea más importante es esta:

> No existe un único pipeline universal. El orden depende del objetivo: análisis físico de picos, comparación de intensidades, PCA, clustering, clasificación o visualización.

Aun así, en Raman es común seguir una lógica bastante estable:

```text
Raw data
↓
Inspección inicial
↓
Recorte espectral amplio
↓
Eliminación de rayos cósmicos
↓
Sustracción de fondo / sustrato, si existe referencia
↓
Denoising o suavizado, solo si hace falta
↓
Corrección de línea base
↓
Normalización
↓
Ajuste de picos / análisis estadístico
```

En RamanSPy, los ejemplos oficiales de pipelines siguen precisamente una lógica de este tipo: primero recorte espectral, después eliminación de rayos cósmicos, después denoising, corrección de línea base y finalmente normalización.

---

## 2. Orden recomendado general

### Pipeline general recomendado

```text
1. Cargar los espectros brutos
2. Revisar visualmente algunos espectros representativos
3. Recortar la región espectral útil
4. Eliminar rayos cósmicos
5. Sustraer fondo o sustrato, si existe referencia experimental
6. Aplicar denoising / smoothing, si es necesario
7. Corregir línea base / fluorescencia
8. Normalizar, si el objetivo lo requiere
9. Ajustar picos o aplicar análisis estadístico
```

Este orden es recomendable porque evita que los pasos finales trabajen sobre señales que no pertenecen realmente al material: ruido extremo, rayos cósmicos, fluorescencia, contribución del sustrato o regiones espectrales irrelevantes.

---

## 3. ¿Primero se recorta o después?

La respuesta práctica es:

> Normalmente se recorta primero, pero el recorte debe ser amplio.

Por ejemplo, para grafeno, si quieres estudiar los picos D, G y 2D, no conviene recortar solo alrededor de un pico. Es mejor conservar una ventana suficientemente grande.

Ejemplos razonables:

```text
1000–3200 cm⁻¹
```

O también:

```text
1200–3000 cm⁻¹
```

Estas regiones permiten conservar los picos principales:

- D: alrededor de 1350 cm⁻¹
- G: alrededor de 1580 cm⁻¹
- 2D: alrededor de 2700 cm⁻¹

### Por qué recortar primero

Recortar primero tiene varias ventajas:

1. Reduce el tamaño de los datos.
2. Evita procesar regiones que no se van a analizar.
3. Evita que la normalización use zonas irrelevantes.
4. Hace que el cálculo de SNV, Vector, AUC o MinMax se aplique solo sobre la región de interés.
5. Puede reducir falsos problemas generados por zonas saturadas o muy ruidosas fuera del rango útil.

### Cuándo no conviene recortar demasiado pronto o demasiado estrecho

No conviene hacer un recorte muy estrecho como:

```text
1550–1620 cm⁻¹
```

si después quieres corregir línea base o calcular bien el FWHM del pico G. Si el recorte es demasiado estrecho, el algoritmo de línea base no tiene suficiente información para estimar el fondo.

La regla práctica es:

> Recortar sí, pero no recortar de forma agresiva antes de la línea base y el fitting.

---

## 4. Eliminación de rayos cósmicos

Los rayos cósmicos aparecen como picos muy estrechos, intensos y artificiales. No pertenecen al material. En mapas Raman pueden aparecer en uno o pocos píxeles.

En RamanSPy se puede usar el método de Whitaker-Hayes, por ejemplo:

```python
import ramanspy as rp

pipeline = rp.preprocessing.Pipeline([
    rp.preprocessing.misc.Cropper(region=(1000, 3200)),
    rp.preprocessing.despike.WhitakerHayes(),
])
```

La eliminación de rayos cósmicos suele ir antes del suavizado y antes de la corrección de línea base, porque un rayo cósmico puede alterar el ajuste del fondo, la normalización y el fitting de picos.

### Advertencia

Hay que comprobar visualmente que el algoritmo no está eliminando picos Raman reales. Esto es importante en materiales con picos estrechos. En grafeno, los picos D, G y 2D son reales y no deben confundirse con spikes cósmicos.

---

## 5. Sustracción de fondo vs corrección de línea base

Conviene distinguir dos cosas que a veces se mezclan:

### 5.1. Sustracción de fondo o sustrato

Se aplica cuando tienes un espectro de referencia del fondo, por ejemplo:

- sustrato Si/SiO₂;
- vidrio;
- polímero;
- señal instrumental;
- medio líquido;
- portamuestras.

La idea es restar una señal que sabes que no pertenece a la muestra.

```text
Espectro corregido = espectro muestra - espectro sustrato
```

Este paso tiene sentido si la referencia está medida en condiciones comparables: mismo láser, objetivo, tiempo, potencia, foco y configuración.

### 5.2. Corrección de línea base

La corrección de línea base elimina una tendencia suave de fondo, normalmente asociada a fluorescencia o deriva instrumental.

Ejemplos de métodos:

- polynomial baseline;
- ALS, Asymmetric Least Squares;
- ASPLS;
- airPLS;
- rubberband;
- SNIP.

En RamanSPy se puede usar, por ejemplo:

```python
pipeline = rp.preprocessing.Pipeline([
    rp.preprocessing.misc.Cropper(region=(1000, 3200)),
    rp.preprocessing.despike.WhitakerHayes(),
    rp.preprocessing.baseline.ASPLS(),
])
```

La línea base debe corregirse antes de calcular intensidades, áreas o ratios.

---

## 6. Denoising / smoothing

El suavizado puede ayudar cuando el espectro tiene mucho ruido. Sin embargo, no debe usarse de forma automática sin comprobar sus efectos.

Métodos comunes:

- Savitzky-Golay;
- Gaussian filter;
- Whittaker smoothing;
- wavelet denoising.

Ejemplo en RamanSPy:

```python
pipeline = rp.preprocessing.Pipeline([
    rp.preprocessing.misc.Cropper(region=(1000, 3200)),
    rp.preprocessing.despike.WhitakerHayes(),
    rp.preprocessing.denoise.SavGol(window_length=9, polyorder=3),
    rp.preprocessing.baseline.ASPLS(),
])
```

### Precaución con el suavizado

Para grafeno, el suavizado excesivo puede alterar:

- altura del pico D;
- anchura FWHM;
- forma del pico 2D;
- cálculo de ratios;
- detección de defectos.

Por eso, para análisis físico de picos, conviene usar el mínimo suavizado necesario o incluso trabajar sin suavizado si la señal es buena.

---

## 7. Normalización

La normalización debe ir normalmente al final del preprocessing, después de eliminar rayos cósmicos, fondo y línea base.

La razón es sencilla:

> Si normalizas antes de corregir el fondo, normalizas también la fluorescencia, el ruido y la señal del sustrato.

Métodos frecuentes:

- normalización por dosis;
- normalización por área bajo la curva, AUC;
- normalización vectorial;
- MinMax;
- SNV;
- normalización respecto a un pico interno.

---

## 8. SNV: qué es y cuándo usarlo

SNV significa *Standard Normal Variate*. Para cada espectro, se calcula:

```text
I_SNV = (I - media_del_espectro) / desviación_estándar_del_espectro
```

En Python, de forma simple:

```python
def snv(x):
    return (x - x.mean(axis=-1, keepdims=True)) / x.std(axis=-1, keepdims=True)
```

Si `x` es un mapa Raman con forma:

```text
(n_filas, n_columnas, n_puntos_espectrales)
```

la función anterior aplica SNV sobre el último eje, es decir, sobre cada espectro individual.

### Cuándo sí usar SNV

SNV puede ser útil para:

- PCA;
- clustering;
- clasificación;
- machine learning;
- comparar formas espectrales;
- reducir diferencias globales de intensidad por enfoque o por variaciones experimentales.

### Cuándo no usar SNV

SNV no es recomendable como paso principal si quieres interpretar físicamente:

- intensidades absolutas;
- áreas de pico;
- mapas de intensidad;
- ratios de intensidad como ID/IG o I2D/IG;
- comparación cuantitativa de señal Raman entre muestras.

La razón es que SNV cambia la escala de cada espectro de forma estadística. Al restar la media y dividir por la desviación estándar, las alturas relativas de los picos pueden cambiar respecto al espectro original corregido.

En grafeno, esto puede ser delicado porque ratios como:

```text
ID/IG
I2D/IG
```

se interpretan físicamente. Por eso, para parámetros Raman físicos, es mejor extraer los picos desde espectros corregidos de línea base, pero no transformados por SNV.

---

## 9. Pipeline recomendado para grafeno

Para análisis físico de grafeno, el pipeline recomendado sería:

```text
1. Cargar espectros brutos
2. Inspección visual de espectros representativos
3. Crop amplio: 1000–3200 cm⁻¹ o 1200–3000 cm⁻¹
4. Eliminación de rayos cósmicos
5. Sustracción de sustrato, si tienes referencia
6. Corrección de línea base
7. Ajuste de picos D, G y 2D
8. Extracción de parámetros Raman
```

Parámetros a extraer:

```text
Pos(D), Pos(G), Pos(2D)
I_D, I_G, I_2D
A_D, A_G, A_2D
FWHM(D), FWHM(G), FWHM(2D)
ID/IG
I2D/IG
A_D/A_G
A_2D/A_G
```

### Pipeline para grafeno en código RamanSPy

```python
import ramanspy as rp

pipeline_graphene = rp.preprocessing.Pipeline([
    rp.preprocessing.misc.Cropper(region=(1000, 3200)),
    rp.preprocessing.despike.WhitakerHayes(),
    # El suavizado es opcional. Usar solo si el ruido lo justifica.
    # rp.preprocessing.denoise.SavGol(window_length=9, polyorder=3),
    rp.preprocessing.baseline.ASPLS(),
])

# preprocessed = pipeline_graphene.apply(raman_map)
```

Después de este pipeline, se haría el ajuste de picos.

---

## 10. Pipeline para PCA, clustering o machine learning

Si el objetivo no es extraer parámetros físicos sino clasificar espectros o agrupar regiones del mapa, entonces sí puede tener sentido usar SNV o normalización vectorial.

Pipeline recomendado:

```text
1. Cargar datos
2. Crop amplio
3. Eliminar rayos cósmicos
4. Sustracción de fondo / sustrato, si aplica
5. Corrección de línea base
6. SNV o Vector normalisation
7. PCA / clustering / clasificación
```

Ejemplo con normalización vectorial en RamanSPy:

```python
import ramanspy as rp

pipeline_ml = rp.preprocessing.Pipeline([
    rp.preprocessing.misc.Cropper(region=(1000, 3200)),
    rp.preprocessing.despike.WhitakerHayes(),
    rp.preprocessing.baseline.ASPLS(),
    rp.preprocessing.normalise.Vector(pixelwise=True),
])
```

Ejemplo con SNV usando NumPy después del pipeline:

```python
import numpy as np

def snv(x):
    std = x.std(axis=-1, keepdims=True)
    std[std == 0] = 1
    return (x - x.mean(axis=-1, keepdims=True)) / std

# corrected = pipeline_without_normalisation.apply(raman_map)
# corrected_snv = snv(corrected.spectral_data)
```

El detalle importante es que la normalización debe aplicarse igual a todos los espectros. No conviene cambiar el pipeline muestra por muestra.

---

## 11. Pipeline para comparación de intensidades entre experimentos

Si quieres comparar intensidades absolutas entre espectros medidos con condiciones distintas, puede ser necesaria una normalización por dosis.

Una forma simple es:

```text
I_norm = I / (P · t · N)
```

Donde:

- P = potencia láser real en la muestra;
- t = tiempo de integración;
- N = número de acumulaciones.

Si cambia el objetivo o el tamaño del spot, puede ser más adecuado considerar la dosis por área:

```text
Dosis por área = (P · t · N) / A_spot
```

Sin embargo, esto no sustituye a una buena práctica experimental. Para comparar intensidades de forma rigurosa, lo ideal es medir todas las muestras con la misma configuración Raman.

---

## 12. Qué parámetros no se normalizan directamente

No tiene sentido dividir directamente por dosis parámetros que no son intensidades.

No se normalizan directamente por dosis:

```text
Pos(G)
Pos(2D)
FWHM(G)
FWHM(2D)
FWHM(D)
```

Sí pueden calcularse después de procesar un espectro que ha sido escalado o normalizado, pero el valor final de FWHM sigue estando en cm⁻¹. No se divide el FWHM entre potencia, tiempo o dosis.

---

## 13. Recomendación práctica final

Para tu análisis Raman de grafeno, yo separaría dos pipelines:

### A. Pipeline físico, para parámetros Raman reales

```text
Crop amplio
↓
Cosmic ray removal
↓
Sustracción de sustrato, si hay referencia
↓
Baseline correction
↓
Peak fitting
↓
Parámetros: Pos, FWHM, intensidades, áreas y ratios
```

Este pipeline es el más adecuado para estudiar calidad del grafeno, defectos, número de capas, tensiones o variaciones espaciales del mapa.

### B. Pipeline estadístico, para PCA o clustering

```text
Crop amplio
↓
Cosmic ray removal
↓
Sustracción de fondo / baseline correction
↓
SNV o Vector normalisation
↓
PCA / clustering / clasificación
```

Este pipeline es útil para encontrar patrones, agrupar regiones o entrenar modelos, pero no debe confundirse con un pipeline de cuantificación física directa.

---

## 14. Errores comunes

### Error 1: normalizar antes de quitar la línea base

Si haces esto, la fluorescencia y el fondo entran en la normalización.

Mejor:

```text
Baseline correction → Normalisation
```

### Error 2: usar SNV y después interpretar ID/IG como si fuera el espectro original

SNV puede cambiar las relaciones de intensidad. Para ratios físicos, mejor usar espectros corregidos de línea base, no SNV.

### Error 3: recortar demasiado estrecho

Un recorte demasiado estrecho puede impedir una buena corrección de fondo y puede alterar el fitting.

### Error 4: suavizar demasiado

Un suavizado fuerte puede modificar FWHM y forma de pico, especialmente en el pico 2D de grafeno.

### Error 5: aplicar pipelines distintos a muestras distintas

Para comparar muestras, el preprocessing debe ser idéntico. Si cambias los parámetros del pipeline para cada muestra, puedes introducir sesgo.

---

## 15. Checklist antes de cerrar el análisis

Antes de aceptar los resultados, conviene comprobar:

```text
[ ] ¿Se han guardado los datos brutos sin modificar?
[ ] ¿El recorte conserva todos los picos necesarios?
[ ] ¿La eliminación de rayos cósmicos no borra picos reales?
[ ] ¿La línea base queda físicamente razonable?
[ ] ¿El suavizado no ensancha artificialmente los picos?
[ ] ¿La normalización se justifica según el objetivo?
[ ] ¿El mismo pipeline se aplica a todas las muestras?
[ ] ¿Se comparan también algunos espectros antes/después del preprocessing?
[ ] ¿Los parámetros finales tienen unidades correctas?
[ ] ¿Se documenta el pipeline completo en el informe o script?
```

---

## 16. Frase recomendada para metodología

Una forma clara de describirlo en un informe sería:

> Raman spectra were preprocessed using a fixed pipeline applied equally to all spectra. First, the spectra were cropped to the spectral region containing the D, G and 2D bands. Cosmic ray artefacts were then removed, followed by substrate/background subtraction when a reference spectrum was available. A baseline correction was applied before peak fitting. Normalisation was only used for multivariate analysis and was not used for the extraction of physical Raman parameters such as peak position, FWHM and intensity ratios.

En español:

> Los espectros Raman se preprocesaron mediante un pipeline fijo aplicado de la misma forma a todos los espectros. Primero, se recortaron a la región espectral que contiene las bandas D, G y 2D. Después se eliminaron los artefactos asociados a rayos cósmicos y, cuando se disponía de una referencia, se sustrajo la contribución del sustrato o fondo. A continuación, se aplicó una corrección de línea base antes del ajuste de picos. La normalización se utilizó únicamente para análisis multivariante y no para la extracción de parámetros Raman físicos como posición de pico, FWHM o ratios de intensidad.

---

## 17. Fuentes útiles

- RamanSPy official documentation, preprocessing module: https://ramanspy.readthedocs.io/en/latest/preprocessing.html
- RamanSPy official example, preprocessing pipelines: https://ramanspy.readthedocs.io/en/stable/auto_examples/plot_i_preprocessing_pipelines.html
- RamanSPy GitHub repository: https://github.com/barahona-research-group/RamanSPy
- Georgiev et al., RamanSPy paper, Analytical Chemistry / open access version: https://pmc.ncbi.nlm.nih.gov/articles/PMC11140669/
