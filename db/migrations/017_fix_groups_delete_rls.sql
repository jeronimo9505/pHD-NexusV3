-- 1. Ensure RLS is enabled
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- 2. Add policy to allow admins and owners to delete
DROP POLICY IF EXISTS "Admins and owners can delete groups" ON groups;
CREATE POLICY "Admins and owners can delete groups" ON groups 
FOR DELETE 
TO authenticated 
USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.system_role = 'admin'
  )
);
