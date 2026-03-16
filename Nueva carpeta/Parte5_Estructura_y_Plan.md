# Documento de Arquitectura - PhD Nexus LIMS
## Parte 5: Estructura del Proyecto y Plan de Acción

### 1. Estructura de Carpetas (El Enfoque "Monorepo")
Para mantener la cordura mental y no tener el código esparcido por toda tu computadora, utilizaremos un enfoque de **Monorepo** (Un solo repositorio de GitHub para todo el proyecto). 

Tu proyecto actual de Next.js mutará ligeramente para alojar a sus dos nuevos "inquilinos": Tauri y Python. Así se verá la estructura raíz:

```text
PhD_Nexus_App/
│
├── package.json                 # Dependencias de tu interfaz (Next.js, React, Tailwind)
├── next.config.js               # Configuración de compilación web
│
├── /src                         # 🎨 PARTE 1: LA INTERFAZ (Tu código actual)
│   ├── /components              # Botones, gráficas, paneles
│   ├── /app (o /pages)          # Rutas: /bitacora, /dashboard, /muestras
│   └── /lib                     # utilidades.js, supabaseClient.js
│
├── /src-tauri                   # 🖥️ PARTE 2: EL EMPAQUETADOR DE ESCRITORIO
│   ├── tauri.conf.json          # Configuración: permisos de disco, nombre del .exe
│   ├── Cargo.toml               # Dependencias de Rust (el motor de Tauri)
│   └── /src                     # main.rs (Código puente básico que Tauri auto-genera)
│
└── /python-engine               # ⚙️ PARTE 3: EL MOTOR CIENTÍFICO (El Sidecar)
    ├── requirements.txt         # fastapi, pandas, scipy, scikit-learn, pyinstaller
    ├── main.py                  # El servidor local (arranca en localhost:8000)
    ├── file_processor.py        # Funciones: mover_archivo(), txt_to_parquet()
    └── raman_math.py            # Funciones: pca(), baseline_correction()