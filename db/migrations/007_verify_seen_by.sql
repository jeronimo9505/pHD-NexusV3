-- Verificación de Columna seen_by en drive_reports

-- 1. Verificar si la columna existe
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'drive_reports' 
  AND column_name = 'seen_by';

-- 2. Ver todas las columnas de drive_reports
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'drive_reports'
ORDER BY ordinal_position;

-- 3. Test de datos actuales
SELECT id, title, seen_by, author_id
FROM drive_reports
LIMIT 5;

-- 4. Si la columna NO existe, crearla:
-- ALTER TABLE drive_reports ADD COLUMN seen_by TEXT[] DEFAULT '{}';

-- 5. Si existe pero es tipo incorrecto, convertir:
-- ALTER TABLE drive_reports ALTER COLUMN seen_by TYPE TEXT[] USING seen_by::TEXT[];
