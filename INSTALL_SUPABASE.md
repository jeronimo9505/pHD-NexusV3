# Configuración e Instalación de Supabase para PhD Nexus

Este documento contiene las instrucciones esenciales para configurar la base de datos de **Supabase** y poder desplegar o instalar PhD Nexus en otra computadora.

---

## 1. Crear un proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com/) e inicia sesión.
2. Crea un nuevo proyecto (**New Project**).
3. Elige un nombre de proyecto, una contraseña segura para la base de datos y la región más cercana.
4. Espera unos minutos a que el proyecto esté listo.

---

## 2. Configurar Variables de Entorno (`.env.local`)

En la raíz del proyecto, crea un archivo llamado `.env.local` (o clona el `.env.example`). Añade los siguientes valores obtenidos del panel de control de Supabase (**Project Settings > API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<tu-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key-publica>

# Variables del Servidor (NO se exponen en el navegador)
SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-secret-key>
```

*   **`NEXT_PUBLIC_SUPABASE_URL`**: La URL de tu API de Supabase.
*   **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: La clave anónima pública.
*   **`SUPABASE_SERVICE_ROLE_KEY`**: La clave secreta de servicio (Service Role). Se utiliza para operaciones administrativas del lado del servidor que requieren saltarse las políticas de RLS.

---

## 3. Inicializar el Esquema de la Base de Datos

El esquema de base de datos actual de PhD Nexus está documentado y consolidado en:
*   [db/schema.sql](file:///c:/Users/Rodrigo/Downloads/Depurado%202/db/schema.sql)

### Pasos para aplicar el esquema:
1. En tu panel de Supabase, ve a **SQL Editor** en el menú de la izquierda.
2. Haz clic en **New query** (Nueva consulta).
3. Abre el archivo [db/schema.sql](file:///c:/Users/Rodrigo/Downloads/Depurado%202/db/schema.sql) de este repositorio, copia todo su contenido y pégalo en el editor de SQL de Supabase.
4. Haz clic en **Run** (Ejecutar). Esto creará todas las tablas necesarias (`profiles`, `groups`, `group_members`, `tasks`, `knowledge_items`, etc.), las claves foráneas, las funciones disparadoras (triggers) y las políticas de seguridad (RLS).

---

## 4. Configurar la Autenticación (Supabase Auth)

PhD Nexus utiliza el sistema de autenticación nativo de Supabase.

1. Ve a **Authentication > Providers** en Supabase.
2. Asegúrate de que el proveedor **Email** esté habilitado.
3. (Opcional) Puedes deshabilitar **Confirm email** en **Auth Settings** si deseas permitir el acceso inmediato sin tener que verificar el correo durante las pruebas locales.
4. **URLs de Redirección (Redirect URLs)**:
   * Si estás ejecutando la aplicación en local, añade las siguientes URLs de redirección permitidas en **Authentication > URL Configuration > Redirect URLs**:
     * `http://localhost:3000/**`
     * `tauri://localhost/**` (Necesario para el cliente de escritorio de Tauri)

---

## 5. Ejecutar la Aplicación

Una vez que Supabase esté configurado y las variables de entorno estén puestas en tu archivo `.env.local`:

```bash
# 1. Instalar dependencias de Node
npm install

# 2. Iniciar el servidor Next.js/Tauri en modo desarrollo
npm run tauri dev
```

El motor de procesamiento de Python también debe iniciarse en la otra máquina:
```bash
cd python-engine
pip install -r requirements.txt
python start.py
```
