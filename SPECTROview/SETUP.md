# Uso de la integración preliminar

En este equipo el entorno de SPECTROview ya está instalado en `.venv` dentro de esta carpeta. Nexus continúa con su Python original; no instalar el lock de SPECTROview en el entorno principal.

1. Iniciar/reiniciar el motor Python habitual de Nexus para cargar el nuevo router.
2. Abrir Map Analyzer y seleccionar una adquisición HDF5 en la biblioteca existente.
3. Abrir **SPECTROview**. Aparecen el espectro, preparación y editor de los ocho perfiles disponibles.
4. Definir rango, fondo y picos. El pico inicial está en el centro del rango: es un punto de partida editable, no una identificación automática de grafeno.

   Para revisar heterogeneidad, usar **Compare selected spectra before map fitting**: introducir hasta 32 índices únicos separados por comas o añadir el espectro inspeccionado. **Fit selection** calcula cada espectro con el modelo actual; la tabla permite inspeccionar sus componentes y residuos. Se conserva la selección en el navegador por adquisición; las curvas de comparación son temporales. Cambiar modelo o selección invalida la comparación. Los fallos individuales conservan su fila. Para guardar resultados persistentes, usar una corrida.
5. Revisar la curva del modelo inicial y pulsar **1 · Fit selected spectrum**. Inspeccionar componentes, fondo, residuos, R² y RMSE. **Use fitted values as starting model** adopta explícitamente los valores libres respetando límites, parámetros fijos y expresiones; después volver a ajustar. Cambiar espectro o configuración invalida la vista previa anterior. **2 · Apply to map** queda habilitado tras un ajuste previo satisfactorio con la configuración actual. **Save analysis** guarda solamente la configuración. Los resultados guardados se consultan aparte mediante **Saved result**.
6. Consultar estado, detener o reanudar. Los bloques confirmados se conservan; el bloque interrumpido se repite. El guardado se realiza automáticamente en el vault.
7. Seleccionar parámetro del mapa y pulsar un punto para inspeccionar su ajuste/residuo; exportar CSV por píxel. Activar **Show processing status · all spectra** para incluir fallidos y pendientes y consultar sus conteos. Esta vista aparece también antes del primer bloque calculado. Sin geometría, presenta estados por índice de espectro, no posiciones físicas. Convergencia no equivale a validez científica. Los índices de una rejilla sin calibración se etiquetan como índices, no micras.

Los artefactos están en `{vault}/.spectroview/runs/{run_id}/`: manifiesto JSON, bloques NPZ sin pickle, lock y salida del worker. No son nuevos archivos HDF5 de adquisición. Guardar el vault completo para conservar análisis. Una sesión reabierta recupera sus corridas de esos manifiestos, independientemente del borrador local del navegador.

Si no aparece la pestaña, se está ejecutando una compilación anterior de la interfaz; reiniciar/recompilar Nexus por el procedimiento habitual. Si aparece un error de entorno, configurar `PHDNEXUS_SPECTROVIEW_PYTHON` con la ruta absoluta al Python aislado antes de iniciar el motor de Nexus.

## Reproducción en otro equipo Windows/Python 3.13

Desde la raíz del repositorio:

```powershell
python -m venv SPECTROview/.venv
SPECTROview/.venv/Scripts/python.exe -m pip install -r SPECTROview/validation/requirements-windows-py313.lock
SPECTROview/.venv/Scripts/python.exe -m pip check
SPECTROview/.venv/Scripts/python.exe python-engine/tests/test_spectroview_integration.py
python python-engine/tests/test_spectroview_api.py
SPECTROview/.venv/Scripts/python.exe SPECTROview/validation/benchmark.py
```

El lock fija el commit Git upstream y las versiones probadas. Es específico de Windows/Python 3.13; no representa aún un instalador portable. El test API usa FastAPI/httpx/h5py del entorno normal de Nexus y arranca el worker aislado. No necesita credenciales ni datos experimentales.

CLI de diagnóstico desde `python-engine/`:

```powershell
../SPECTROview/.venv/Scripts/python.exe -m spectroview_integration capabilities
```

## Autoría y licencia upstream

Motor: CEA-MetroCarac / SPECTROview, Van Hoan Le. Origen: https://github.com/CEA-MetroCarac/SPECTROview/tree/d40ec6278fe982a7efda6e4ab15646016995a2db. El paquete declara **GPL-3.0-or-later**. El código upstream instalado se conserva sin modificaciones; los adaptadores Nexus están separados. El clon de referencia conserva LICENSE y atribuciones. Antes de distribuir el producto integrado, completar la revisión de obligaciones de distribución descrita en el plan.
