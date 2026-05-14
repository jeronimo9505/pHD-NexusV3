# Propuesta de módulo visual para ajuste y deconvolución de espectros Raman

## 1. Idea general

El módulo debería llamarse, provisionalmente, **Raman Visual Fit Module**. La idea no sería crear una herramienta solo para grafeno, sino una plataforma general para espectros Raman con un **preset avanzado para grafeno**.

El objetivo principal sería permitir tres cosas:

1. Cargar un espectro Raman o un mapa Raman.
2. Ver visualmente el ajuste: espectro bruto, baseline, espectro corregido, picos individuales, suma del modelo y residuos.
3. Comparar modelos de ajuste, por ejemplo:
   - grafeno monolayer: 2D como una sola Lorentziana;
   - bilayer: 2D como cuatro Lorentzianas;
   - espectro genérico: detección automática de picos + selección manual del modelo.

La filosofía del sistema debería ser:

> Primero visualizar y entender el ajuste; después automatizarlo.

Esto es importante porque en Raman es muy fácil obtener un ajuste matemáticamente bueno pero físicamente incorrecto.

---

## 2. Librerías recomendadas

### 2.1. Núcleo científico

```bash
pip install numpy pandas scipy lmfit pybaselines plotly streamlit
```

Librerías principales:

| Librería | Uso dentro del módulo |
|---|---|
| `numpy` | Cálculo numérico |
| `pandas` | Lectura y organización de tablas |
| `scipy` | Suavizado, detección de picos, filtros |
| `pybaselines` | Corrección de línea base |
| `lmfit` | Ajuste no lineal de picos Raman |
| `plotly` | Visualización interactiva del ajuste |
| `streamlit` | Interfaz visual rápida tipo app |
| `ramanspy` | Opcional para workflows Raman más completos |
| `fityk` / `cfityk` | Opcional como backend externo de ajuste |

---

## 3. Papel de Fityk dentro del sistema

Fityk es muy útil porque ya ofrece una interfaz gráfica madura para ajuste de curvas y picos. Puede ajustar funciones como Gaussian, Lorentzian, Voigt, Pearson VII y otras formas de línea. También permite trabajar por comandos, scripts y línea de comandos con `cfityk`.

Sin embargo, para desarrollar una herramienta propia en Python, yo no haría que Fityk fuese el corazón obligatorio del sistema. Lo usaría de tres formas posibles:

### Opción A: Fityk como herramienta externa de validación

El usuario ajusta manualmente en Fityk, exporta el script `.fit`, y el módulo Python puede reproducir o comparar los parámetros.

Ventaja:
- Muy bueno para validar modelos.
- Ideal al comienzo del proyecto.

Desventaja:
- No es la integración más limpia para una app propia.

### Opción B: Fityk como backend mediante `cfityk`

Python genera automáticamente un script `.fit`, lo ejecuta con `cfityk`, recoge los resultados y los muestra en la app.

Ventaja:
- Permite usar la potencia de Fityk en modo automático.
- Es reproducible.

Desventaja:
- Depende de que Fityk/cfityk esté instalado correctamente en el sistema.
- La integración multiplataforma puede ser más delicada.

### Opción C: motor principal en Python con `lmfit`, Fityk opcional

El ajuste principal se hace con `lmfit`, y la interfaz visual se construye con Streamlit + Plotly.

Ventaja:
- Más fácil de distribuir.
- Más fácil de integrar con mapas Raman, machine learning, exportación de resultados y criterios automáticos.
- Todo queda dentro del ecosistema Python.

Desventaja:
- Hay que construir la parte visual, aunque con Plotly/Streamlit esto es bastante viable.

### Decisión recomendada

La arquitectura más sólida sería:

```text
Motor principal: lmfit
Baseline: pybaselines
Visualización: Plotly
Interfaz: Streamlit al inicio; Dash si el proyecto crece
Fityk: backend opcional y herramienta de validación
```

---

## 4. Arquitectura propuesta del módulo

```text
raman_visual_fit/
│
├── app/
│   ├── streamlit_app.py
│   └── components.py
│
├── core/
│   ├── spectrum.py
│   ├── preprocessing.py
│   ├── peak_detection.py
│   ├── models.py
│   ├── fitting.py
│   ├── metrics.py
│   └── export.py
│
├── presets/
│   ├── graphene.py
│   ├── generic_raman.py
│   ├── carbon_materials.py
│   └── sers.py
│
├── engines/
│   ├── lmfit_engine.py
│   ├── fityk_engine.py
│   └── base_engine.py
│
├── visual/
│   ├── plot_fit.py
│   ├── plot_residuals.py
│   ├── plot_maps.py
│   └── plot_model_comparison.py
│
├── examples/
│   ├── graphene_monolayer.csv
│   ├── graphene_bilayer.csv
│   └── generic_spectrum.csv
│
└── tests/
    ├── test_baseline.py
    ├── test_graphene_preset.py
    └── test_fit_metrics.py
```

---

## 5. Flujo de trabajo del usuario

### 5.1. Flujo básico

1. El usuario sube un archivo `.csv`, `.txt`, `.dat` o similar.
2. La app detecta las columnas `x` e `intensity`.
3. El usuario selecciona:
   - tipo de material: `Generic Raman`, `Graphene`, `Carbon`, `SERS`, etc.;
   - rango de análisis;
   - método de baseline;
   - modelo de picos.
4. La app muestra el espectro bruto.
5. La app calcula y muestra la baseline.
6. La app muestra el espectro corregido.
7. El usuario elige o confirma los picos.
8. El sistema ajusta.
9. La app muestra:
   - espectro experimental;
   - ajuste total;
   - picos individuales;
   - residuos;
   - tabla de parámetros;
   - métricas de calidad.
10. El usuario exporta resultados en `.csv`, `.xlsx`, `.json` o `.pdf`.

---

## 6. Interfaz visual recomendada

La primera versión la haría con **Streamlit + Plotly**.

### Pantalla 1: carga y preprocesamiento

Elementos:

- botón para subir archivo;
- selector de columnas `x` e `y`;
- selector de rango Raman;
- selector de baseline:
  - `AsLS`;
  - `airPLS`;
  - `ModPoly`;
  - `SNIP`;
  - sin baseline;
- sliders para parámetros de baseline;
- gráfico interactivo:
  - raw spectrum;
  - baseline;
  - corrected spectrum.

### Pantalla 2: modelo de ajuste

Elementos:

- selector de preset:
  - `Generic Raman`;
  - `Graphene - monolayer test`;
  - `Graphene - bilayer test`;
  - `Graphene - defect analysis`;
  - `Manual model`.
- tabla editable de picos:
  - nombre;
  - centro inicial;
  - mínimo;
  - máximo;
  - altura inicial;
  - anchura inicial;
  - tipo de función;
  - activar/desactivar.

Ejemplo de tabla:

| Peak | Initial center | Min | Max | Model | Active |
|---|---:|---:|---:|---|---|
| D | 1350 | 1300 | 1400 | Lorentzian | Yes |
| G | 1582 | 1550 | 1610 | Lorentzian | Yes |
| D' | 1620 | 1600 | 1645 | Lorentzian | Optional |
| 2D | 2680 | 2620 | 2735 | Lorentzian | Yes |

### Pantalla 3: ajuste visual

La gráfica principal debería mostrar:

- puntos experimentales;
- curva del ajuste total;
- cada pico individual;
- baseline;
- área bajo cada pico;
- residuos debajo del espectro.

La visualización ideal sería:

```text
[ Raw / Corrected / Fit / Components ]

Intensity
│                         2D
│                         /\
│                        /  \       Fit total
│       G               /    \      ---------
│      /\              /      \
│ D   /  \            /        \
│/\__/____\__________/__________\______ Raman shift
│
│ Residuals: diferencia entre experimento y ajuste
└──────────────────────────────────────────────
```

### Pantalla 4: diagnóstico

Mostraría:

- `R²`;
- `reduced chi-square`;
- `AIC`;
- `BIC`;
- error estándar de los parámetros;
- residuos;
- advertencias de sobreajuste;
- comparación entre modelos.

---

## 7. Preset específico para grafeno

Este preset sería el primer preset avanzado del sistema.

### 7.1. Picos principales

| Pico | Rango aproximado | Interpretación |
|---|---:|---|
| D | 1330–1360 cm⁻¹ | Defectos / desorden |
| G | 1570–1595 cm⁻¹ | Modo sp² principal |
| D' | 1610–1630 cm⁻¹ | Defectos intravalley |
| 2D | 2650–2700 cm⁻¹ aprox. | Número de capas / estructura electrónica |

Los rangos deben ser ajustables porque dependen del láser, strain, doping, temperatura, sustrato y calibración instrumental.

### 7.2. Modelo monolayer

Modelo:

```text
D  = Lorentzian opcional
G  = Lorentzian
D' = Lorentzian opcional
2D = una Lorentzian
```

Criterios calculados:

```text
I_D / I_G
I_2D / I_G
FWHM_G
FWHM_2D
Pos_G
Pos_2D
Area_D / Area_G
Area_2D / Area_G
```

Criterio orientativo:

```text
Monolayer probable si:
- 2D se ajusta bien con una sola Lorentziana;
- FWHM(2D) es relativamente estrecho;
- I2D/IG es alto, comúnmente alrededor de 2 o mayor en grafeno de buena calidad;
- D es bajo o ausente;
- los residuos del 2D no muestran estructura sistemática.
```

Importante: esto no debe presentarse como prueba absoluta. Debe decir:

```text
Classification: probable monolayer graphene
Confidence: high / medium / low
Reason: single-Lorentzian 2D + low D + high I2D/IG + acceptable residuals
```

### 7.3. Modelo bilayer

Modelo:

```text
D  = Lorentzian opcional
G  = Lorentzian
2D = cuatro Lorentzianas
```

La app debería comparar automáticamente:

```text
Modelo A: 2D = 1 Lorentzian
Modelo B: 2D = 4 Lorentzianas
```

Y mostrar:

| Modelo | AIC | BIC | Reduced χ² | Interpretación |
|---|---:|---:|---:|---|
| 1L 2D | menor/mejor o mayor/peor | ... | ... | Compatible con monolayer |
| 4L 2D | menor/mejor o mayor/peor | ... | ... | Compatible con bilayer |

La decisión no debería depender solo de que el modelo de 4 picos mejore el ajuste, porque casi siempre más parámetros pueden ajustar mejor. Por eso hay que mirar `BIC`, residuos y sentido físico.

### 7.4. Modelo para grafeno defectuoso

Modelo:

```text
D  = Lorentzian
G  = Lorentzian
D' = Lorentzian
2D = Lorentzian o modelo flexible
```

Métricas:

```text
ID/IG
ID'/IG
I2D/IG
FWHM_G
FWHM_2D
Pos_G
Pos_2D
```

Alertas útiles:

```text
- D muy alto: posible alta densidad de defectos.
- G muy ancho: posible desorden, doping o mezcla de regiones.
- 2D muy ancho o asimétrico: posible multilayer, strain heterogéneo, folding o turbostratic graphene.
- I2D/IG bajo: no necesariamente descarta monolayer si hay doping, sustrato o defectos.
```

---

## 8. Modo genérico para cualquier Raman

El sistema no debe estar limitado a grafeno. Para cualquier espectro Raman, el modo genérico debería permitir:

### 8.1. Detección automática de picos

Usar:

```python
scipy.signal.find_peaks
```

Parámetros editables:

- prominencia;
- distancia mínima entre picos;
- altura mínima;
- anchura mínima;
- rango de análisis.

### 8.2. Selección de forma de línea

Opciones:

| Modelo | Cuándo usarlo |
|---|---|
| Gaussian | Ensanchamiento instrumental o distribución estadística dominante |
| Lorentzian | Picos Raman con carácter vibracional/resonante marcado |
| Voigt | Mezcla de contribución Gaussiana + Lorentziana |
| Pseudo-Voigt | Aproximación práctica al Voigt con menos coste computacional |
| Pearson VII | Picos con colas variables |
| Split Lorentzian | Picos asimétricos |

### 8.3. Modo manual

El usuario debería poder:

- añadir un pico haciendo clic en la gráfica;
- mover el centro del pico;
- cambiar el tipo de función;
- fijar o liberar parámetros;
- definir límites;
- eliminar picos;
- comparar modelos.

---

## 9. Comparación de modelos

El módulo debería incluir una función llamada, por ejemplo:

```python
compare_models(spectrum, model_candidates)
```

Ejemplo para grafeno:

```python
models = [
    graphene_1L_model(),
    graphene_2L_model(),
    graphene_defective_model(),
]
```

Salida:

```json
{
  "best_model": "graphene_1L",
  "classification": "probable monolayer graphene",
  "confidence": "medium-high",
  "reason": [
    "2D band fitted with one Lorentzian",
    "I2D/IG = 2.4",
    "FWHM_2D = 31 cm-1",
    "low residual structure in 2D region",
    "D/G ratio low"
  ]
}
```

---

## 10. Diseño del motor de ajuste

### 10.1. Interfaz común

Crear una clase abstracta:

```python
class FitEngine:
    def fit(self, spectrum, model_config):
        raise NotImplementedError

    def get_components(self):
        raise NotImplementedError

    def get_metrics(self):
        raise NotImplementedError

    def export_results(self, path):
        raise NotImplementedError
```

### 10.2. Motor `lmfit`

```python
class LmfitEngine(FitEngine):
    def fit(self, spectrum, model_config):
        # 1. Construir modelo compuesto
        # 2. Crear parámetros iniciales
        # 3. Aplicar bounds
        # 4. Ejecutar fit
        # 5. Devolver FitResult normalizado
        pass
```

### 10.3. Motor Fityk opcional

```python
class FitykEngine(FitEngine):
    def fit(self, spectrum, model_config):
        # 1. Exportar espectro temporal
        # 2. Generar script .fit
        # 3. Ejecutar cfityk
        # 4. Leer info peaks / parámetros
        # 5. Convertir a FitResult común
        pass
```

La clave es que la app no dependa de si el ajuste se hizo con `lmfit` o con Fityk. Ambos deben devolver el mismo tipo de resultado.

---

## 11. Estructura de datos recomendada

### 11.1. Spectrum

```python
@dataclass
class Spectrum:
    x: np.ndarray
    y: np.ndarray
    y_baseline: np.ndarray | None = None
    y_corrected: np.ndarray | None = None
    metadata: dict = field(default_factory=dict)
```

### 11.2. PeakConfig

```python
@dataclass
class PeakConfig:
    name: str
    model: str
    center: float
    center_min: float
    center_max: float
    height: float | None = None
    amplitude: float | None = None
    sigma: float | None = None
    fwhm_min: float | None = None
    fwhm_max: float | None = None
    active: bool = True
```

### 11.3. FitResult

```python
@dataclass
class FitResult:
    best_fit: np.ndarray
    components: dict[str, np.ndarray]
    residuals: np.ndarray
    parameters: pd.DataFrame
    metrics: dict
    model_name: str
    warnings: list[str]
```

---

## 12. Exportación de resultados

El módulo debería exportar:

### 12.1. Tabla de picos

| Peak | Center | FWHM | Height | Area | Error | Model |
|---|---:|---:|---:|---:|---:|---|
| D | ... | ... | ... | ... | ... | Lorentzian |
| G | ... | ... | ... | ... | ... | Lorentzian |
| 2D | ... | ... | ... | ... | ... | Lorentzian |

### 12.2. Métricas de grafeno

| Metric | Value |
|---|---:|
| ID/IG | ... |
| I2D/IG | ... |
| FWHM 2D | ... |
| Pos G | ... |
| Pos 2D | ... |
| Classification | probable monolayer |
| Confidence | medium/high |

### 12.3. Archivos

```text
results.csv
fit_parameters.xlsx
fit_config.json
fit_plot.html
fit_report.md
```

---

## 13. Diseño visual de la app

### Sidebar

```text
Upload data
Material preset
Preprocessing
Baseline method
Peak detection
Model type
Fit options
Export
```

### Panel principal

```text
Tab 1: Raw data
Tab 2: Baseline correction
Tab 3: Peak model
Tab 4: Fit result
Tab 5: Model comparison
Tab 6: Export report
```

### Gráficos mínimos

1. Raw spectrum + baseline.
2. Corrected spectrum + detected peaks.
3. Fit total + components.
4. Residuals.
5. Comparison of model scores.
6. If map Raman: heatmaps of ID/IG, I2D/IG, FWHM 2D, Pos G, Pos 2D.

---

## 14. Mapa Raman

Para mapas Raman, la estructura sería:

```text
x_position, y_position, raman_shift, intensity
```

O bien un cubo:

```text
map[y, x, spectrum]
```

El sistema debería procesar cada píxel o punto:

```python
for spectrum in map_spectra:
    preprocess
    fit
    extract metrics
    save metrics
```

Mapas útiles para grafeno:

| Mapa | Qué indica |
|---|---|
| ID/IG | Defectos / desorden |
| I2D/IG | Posible número de capas / calidad |
| FWHM 2D | Homogeneidad / capas / strain |
| Pos G | Strain, doping, calibración |
| Pos 2D | Strain, doping, número de capas |
| Residual score | Calidad del ajuste |
| Classification | monolayer/bilayer/uncertain |

---

## 15. Reglas de decisión para grafeno

### 15.1. Regla básica

```text
Si el pico 2D se ajusta bien con una sola Lorentziana,
I2D/IG es alto,
D es bajo,
y FWHM(2D) es estrecho,
entonces clasificar como: probable monolayer graphene.
```

### 15.2. Regla comparativa

```text
Ajustar dos modelos:

Modelo 1: 2D = 1 Lorentzian
Modelo 2: 2D = 4 Lorentzians

Evaluar:
- BIC;
- residuos;
- FWHM;
- estabilidad de parámetros;
- coherencia física.
```

### 15.3. Ejemplo de salida

```text
Classification: probable monolayer graphene
Confidence: medium-high

Reasons:
- 2D band adequately fitted by a single Lorentzian.
- I2D/IG = 2.31.
- FWHM(2D) = 29.4 cm-1.
- ID/IG = 0.08.
- Residuals in the 2D region do not show systematic multi-component structure.

Warnings:
- Raman alone is not absolute proof of monolayer graphene.
- Twisted/turbostratic multilayer or folded graphene can sometimes mimic a monolayer-like 2D band.
```

---

## 16. Código mínimo conceptual

```python
from raman_visual_fit.core import load_spectrum, preprocess
from raman_visual_fit.presets.graphene import graphene_monolayer_model
from raman_visual_fit.engines.lmfit_engine import LmfitEngine
from raman_visual_fit.visual import plot_fit

spectrum = load_spectrum("sample.csv", x_col="shift", y_col="intensity")

spectrum = preprocess(
    spectrum,
    crop=(1200, 2850),
    baseline_method="asls",
    smooth=False,
    normalize="max"
)

model_config = graphene_monolayer_model(laser=532)

engine = LmfitEngine()
result = engine.fit(spectrum, model_config)

plot_fit(spectrum, result)

print(result.parameters)
print(result.metrics)
```

---

## 17. Prioridad de desarrollo

### Fase 1: MVP

Objetivo: ajustar un espectro individual.

Funciones:

- cargar `.csv` / `.txt`;
- seleccionar columnas;
- recortar rango;
- aplicar baseline con `pybaselines`;
- preset grafeno monolayer;
- ajuste con `lmfit`;
- gráfica Plotly con componentes;
- tabla de parámetros;
- exportación CSV.

### Fase 2: Model comparison

Funciones:

- comparar 1 Lorentziana vs 4 Lorentzianas en 2D;
- calcular AIC/BIC;
- diagnóstico automático de grafeno;
- alertas de sobreajuste;
- exportar informe `.md`.

### Fase 3: Fityk backend

Funciones:

- exportar script `.fit`;
- ejecutar `cfityk` desde Python;
- leer resultados de Fityk;
- comparar `lmfit` vs `Fityk`;
- guardar historial del ajuste.

### Fase 4: Mapas Raman

Funciones:

- cargar mapas;
- ajustar múltiples espectros;
- generar mapas de métricas;
- batch processing;
- exportar heatmaps.

### Fase 5: Presets avanzados

Presets posibles:

- graphene monolayer;
- graphene bilayer;
- defective graphene;
- graphene oxide/reduced graphene oxide;
- carbon nanotubes;
- generic Raman;
- SERS substrate;
- semiconductor Raman;
- polymer Raman.

---

## 18. Recomendación final

Para empezar, no construiría todo sobre Fityk. Haría esto:

```text
Python-native core:
- lmfit
- pybaselines
- scipy
- plotly
- streamlit

Fityk:
- herramienta externa para validar ajustes;
- backend opcional mediante cfityk;
- exportación/importación de scripts .fit.
```

La razón es simple: si quieres un sistema general, visual, ampliable y aplicable a cualquier espectro Raman, necesitas controlar el flujo completo desde Python. Fityk es excelente para ajuste visual, pero para una plataforma propia con presets, mapas, clasificación, informes y automatización, `lmfit + pybaselines + Plotly + Streamlit/Dash` es más flexible.

Mi diseño final sería:

```text
Raman Visual Fit Module
│
├── Generic Raman mode
│   ├── automatic peak detection
│   ├── manual peak editing
│   ├── Gaussian / Lorentzian / Voigt / Pseudo-Voigt
│   └── model comparison
│
├── Graphene preset
│   ├── D, G, D', 2D
│   ├── monolayer model: 2D = 1 Lorentzian
│   ├── bilayer model: 2D = 4 Lorentzians
│   ├── ID/IG, I2D/IG, FWHM 2D
│   └── classification with confidence + warnings
│
├── Visual app
│   ├── raw spectrum
│   ├── baseline
│   ├── corrected spectrum
│   ├── fit components
│   ├── residuals
│   └── exportable report
│
└── Optional Fityk integration
    ├── export .fit script
    ├── run cfityk
    ├── import Fityk results
    └── compare with lmfit
```

---

## 19. Fuentes técnicas consultadas

- Fityk documentation: nonlinear curve fitting, peak fitting, GUI, command-line mode, scripting and Lua support.
- lmfit documentation: built-in peak-like models including Gaussian, Lorentzian, Voigt and Pseudo-Voigt; composite models; parameters such as center, amplitude, sigma, FWHM and height.
- pybaselines documentation: baseline correction algorithms for Raman and other experimental data, including AsLS, airPLS, ModPoly and SNIP.
- RamanSPy documentation: open-source Python package for Raman preprocessing, analysis, visualisation, datasets and ML workflows.
- Graphene Raman references: monolayer graphene generally has a 2D band fitted by a single Lorentzian, while Bernal bilayer graphene is commonly modeled with four Lorentzian components in the 2D band.
