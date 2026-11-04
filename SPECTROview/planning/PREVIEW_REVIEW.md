# Ajuste previo — 2026-11-01

Solicitud: revisar RGI2 y SPECTROview para comprobar un ajuste antes de aplicarlo a toda la adquisición.

## Comparación del código

- RGI2 `rgi2-view.tsx`, `fitRepresentative`: ajuste de un representante y reutilización de parámetros; también amplía límites de centro. La nueva integración exige adopción explícita de semillas y conserva restricciones.
- RGI2: incorporación de picos con clic y curvas individuales. Se incorporan al nuevo inspector con un modo explícito de añadir pico.
- Upstream `vm_workspace_spectra.py`, `preview_baseline` y flujo de `fit`: previsualización de fondo/modelo y separación entre espectro seleccionado y conjunto completo.

## Implementado

- Endpoint de solo lectura `/api/spectroview/v1/preview`, dos modos: evaluar semillas literales o ajustar un espectro con el mismo `fit_block` de las corridas.
- Curvas iniciales, fondo, componentes, ajuste y residuos; opción de restar fondo; R² y RMSE.
- Vista previa sin crear corridas ni modificar adquisiciones. Resultados guardados separados del borrador.
- Identidad de vista previa basada en archivo, índice y configuración completa. Una modificación invalida el ajuste previo y deshabilita aplicar una nueva corrida desde la interfaz hasta reajustar.
- Adopción opcional de valores libres sin alterar límites, expresiones ni valores fijos.
- Una adquisición de un solo espectro recibe una acción de ajuste y guardado individual.

## Límites y continuación

- La comprobación previa es una protección de interfaz para nuevas corridas; la API y reanudación de corridas existentes conservan su comportamiento.
- Un espectro satisfactorio no valida la heterogeneidad del mapa. Pendiente selección de varios representantes y comparación conjunta, criterios de calidad por píxel y cobertura restante de FEATURES.md.
- No se ha completado la validación visual en la aplicación de escritorio. La paridad integral de SPECTROview sigue pendiente.

## Verificación

- TypeScript y ESLint sin errores.
- 22 pruebas del adaptador siguen pasando.
- Prueba API compara ajuste previo con resultado guardado, semillas iniciales, suma de componentes y conservación exacta del archivo original; comprueba ausencia de artefactos de corrida durante la vista previa.
- Regresión de estado frontend: invalidación por configuración/archivo/índice y adopción de semillas preservando restricciones.
