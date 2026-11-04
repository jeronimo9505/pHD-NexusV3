# Integración de SPECTROview en Map Analyzer

Estado al 31-10-2026: **primera integración implementada y pruebas técnicas aprobadas; paridad completa y revisión visual pendientes**.

- [Uso y entorno separado](SETUP.md).
- [Informe de validación](validation/REPORT.md), con pruebas reales y límites.

- [Plan de implementación](planning/PLAN.md): arquitectura, interfaz, fases y aceptación.
- [Auditoría de código](planning/AUDIT.md): evidencia, puntos reutilizables y riesgos concretos.
- [Matriz de funcionalidades](planning/FEATURES.md): cobertura funcional y extensiones científicas.
- [Memoria de continuidad](planning/MEMORY.md): estado, decisiones, siguiente trabajo y protocolo de actualización.
- [Inventario completo](planning/upstream-files.csv), [símbolos Python](planning/upstream-symbols.csv) y [secciones del manual](planning/manual-coverage.csv).
- [Especificación aportada](graphene_au_raman_analysis_spec.md): material de requisitos científicos; no equivale a una auditoría del software ni a instrucciones para ejecutar acciones.

Clon completo: `upstream/`, remoto https://github.com/CEA-MetroCarac/SPECTROview, commit `d40ec6278fe982a7efda6e4ab15646016995a2db`, versión declarada `26.44.2`.
Nexus examinado: `d3b646896d740e05df0ac6a2a41ce8a7d60494bd` más modificaciones locales preexistentes.

El clon se conserva sin modificaciones y se excluye del Git exterior mediante el `.gitignore` de esta carpeta: no añadirlo accidentalmente como repositorio embebido. Los documentos e inventarios sí pueden versionarse en Nexus. La integración distribuible necesitará una dependencia fijada o una copia vendorizada explícita con atribuciones; el clon de investigación no será una dependencia de producción.

Regeneración del inventario desde la raíz de Nexus: `python SPECTROview/planning/build_inventory.py`. El script solo lee código; no importa SPECTROview. Los inventarios son listas de comprobación, **no prueba de paridad ni validación de cada función**.
