# PhD Nexus - Database Schema

## Estructura

```
db/
├── migrations/          # Migraciones incrementales numeradas
│   ├── 001_initial_schema.sql
│   ├── 002_add_reports.sql
│   └── ...
├── seeds/              # Datos de ejemplo
│   ├── 001_users.sql
│   └── 002_groups.sql
├── schema.sql          # Snapshot del esquema completo actual
└── README.md           # Esta documentación
```

## Cómo trabajar

### 1. Hacer cambios al esquema

1. Crea un nuevo archivo en `db/migrations/` con el siguiente formato:
   ```
   XXX_descripcion_del_cambio.sql
   ```
   Donde XXX es el número secuencial (001, 002, etc.)

2. Escribe el SQL del cambio en ese archivo

3. Actualiza `db/schema.sql` para reflejar el estado final

### 2. Aplicar cambios a Supabase

```bash
# Aplicar una migración específica
npm run db:migrate 001

# Aplicar todas las migraciones pendientes
npm run db:migrate:all

# Ver el estado actual
npm run db:status
```

### 3. Cargar datos de ejemplo

```bash
npm run db:seed
```

## Modelo de Datos Actual

### Core Tables

#### profiles
- `id` (uuid, PK)
- `email` (text, unique)
- `full_name` (text)
- `avatar_url` (text, nullable)
- `system_role` (text) - 'admin' | 'user'
- `status` (text) - 'active' | 'pending'
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### groups
- `id` (uuid, PK)
- `name` (text)
- `description` (text, nullable)
- `code` (text, unique) - código de invitación
- `created_by` (uuid, FK → profiles)
- `created_at` (timestamptz)

#### group_members
- `id` (uuid, PK)
- `group_id` (uuid, FK → groups)
- `user_id` (uuid, FK → profiles)
- `role` (text) - 'student' | 'supervisor' | 'researcher' | 'labmanager'
- `status` (text) - 'active' | 'pending' | 'inactive'
- `created_at` (timestamptz)
- UNIQUE(group_id, user_id)

### RBAC (si se implementa)

#### roles
- `id` (uuid, PK)
- `name` (text, unique)
- `description` (text)
- `created_at` (timestamptz)

#### permissions
- `id` (uuid, PK)
- `key` (text, unique) - ej: 'report.create'
- `description` (text)
- `module` (text) - 'reports' | 'tasks' | 'knowledge'
- `created_at` (timestamptz)

#### role_permissions
- `role_id` (uuid, FK → roles)
- `permission_id` (uuid, FK → permissions)
- PRIMARY KEY (role_id, permission_id)

### Reports Module

#### reports
- `id` (uuid, PK)
- `group_id` (uuid, FK → groups)
- `author_id` (uuid, FK → profiles)
- `week_start` (date)
- `week_end` (date)
- `status` (text) - 'draft' | 'submitted' | 'reviewed'
- `is_important` (boolean, default false)
- `submitted_at` (timestamptz, nullable)
- `reviewed_at` (timestamptz, nullable)
- `reviewed_by` (uuid, FK → profiles, nullable)
- `supervisor_feedback` (text, nullable)
- `created_at` (timestamptz)
- CHECK (week_end >= week_start)

#### report_sections
- `report_id` (uuid, FK → reports)
- `key` (text) - 'context' | 'experimental' | 'findings' | 'difficulties' | 'nextSteps'
- `content` (text)
- PRIMARY KEY (report_id, key)

#### report_comments
- `id` (uuid, PK)
- `report_id` (uuid, FK → reports)
- `section_key` (text, nullable)
- `author_id` (uuid, FK → profiles)
- `body` (text)
- `resolved` (boolean, default false)
- `created_at` (timestamptz)

### Tasks Module

#### tasks
- `id` (uuid, PK)
- `group_id` (uuid, FK → groups)
- `title` (text)
- `description` (text, nullable)
- `status` (text) - 'todo' | 'in_progress' | 'done'
- `priority` (text) - 'low' | 'medium' | 'high'
- `due_date` (date, nullable)
- `created_by` (uuid, FK → profiles)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### task_assignees
- `task_id` (uuid, FK → tasks)
- `user_id` (uuid, FK → profiles)
- `assigned_at` (timestamptz)
- PRIMARY KEY (task_id, user_id)

#### task_comments
- `id` (uuid, PK)
- `task_id` (uuid, FK → tasks)
- `author_id` (uuid, FK → profiles)
- `body` (text)
- `created_at` (timestamptz)

### Knowledge Module

#### knowledge_items
- `id` (uuid, PK)
- `group_id` (uuid, FK → groups)
- `title` (text)
- `content` (text)
- `category` (text) - 'protocol' | 'reference' | 'note' | 'resource'
- `tags` (text[], nullable)
- `created_by` (uuid, FK → profiles)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### Cross-Module Links

#### report_task_links
- `report_id` (uuid, FK → reports)
- `task_id` (uuid, FK → tasks)
- `created_at` (timestamptz)
- PRIMARY KEY (report_id, task_id)

#### report_knowledge_links
- `report_id` (uuid, FK → reports)
- `item_id` (uuid, FK → knowledge_items)
- `created_at` (timestamptz)
- PRIMARY KEY (report_id, item_id)

### Activity Log (opcional)

#### activity_log
- `id` (uuid, PK)
- `group_id` (uuid, FK → groups)
- `user_id` (uuid, FK → profiles)
- `action` (text) - 'created' | 'updated' | 'deleted' | 'submitted' | 'reviewed'
- `entity_type` (text) - 'report' | 'task' | 'knowledge'
- `entity_id` (uuid)
- `metadata` (jsonb, nullable)
- `created_at` (timestamptz)

## Constraints y Reglas

1. **Multi-tenancy**: Todas las tablas de negocio tienen `group_id`
2. **UUIDs**: Todas las PKs son UUID v4
3. **Timestamps**: Todas las tablas tienen `created_at`, algunas `updated_at`
4. **Soft Deletes**: Por ahora no implementados (usar CASCADE)
5. **Indexes**: Crear en `group_id`, `created_at`, campos de búsqueda frecuente

## Próximos Pasos

1. [ ] Crear migration 001 con esquema base
2. [ ] Crear seeds de datos de ejemplo
3. [ ] Implementar scripts npm para gestión de DB
4. [ ] Documentar Permission Matrix si se usa RBAC
