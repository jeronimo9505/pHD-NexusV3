-- Run as a database administrator. Every data change is rolled back.
-- Uses existing fixtures; creates no permanent users, memberships or reports.
BEGIN;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM public.profiles WHERE system_role = 'user' ORDER BY id LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE uid uuid := auth.uid();
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Missing regular-user fixture'; END IF;
    BEGIN
        UPDATE public.profiles SET system_role = 'admin' WHERE id = uid;
        RAISE EXCEPTION 'SECURITY TEST FAILED: privilege escalation succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    UPDATE public.profiles SET full_name = full_name WHERE id = uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Own profile is not editable'; END IF;
END;
$test$;
RESET ROLE;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.sub', p.id::text, true), set_config('audit.report_id', dr.id::text, true)
FROM public.drive_reports dr JOIN public.group_members gm ON gm.group_id = dr.group_id
JOIN public.profiles p ON p.id = gm.user_id
WHERE gm.status = 'active' AND p.system_role = 'user' AND dr.author_id <> p.id LIMIT 1;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rid uuid := current_setting('audit.report_id')::uuid; uid text := auth.uid()::text;
BEGIN
    IF rid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Missing report fixture'; END IF;
    BEGIN
        UPDATE public.drive_reports SET title = COALESCE(title, '') || ' permission probe' WHERE id = rid;
        RAISE EXCEPTION 'SECURITY TEST FAILED: another author report was editable';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    UPDATE public.drive_reports SET seen_by = CASE WHEN COALESCE(seen_by, '[]'::jsonb) ? uid
        THEN seen_by - uid ELSE COALESCE(seen_by, '[]'::jsonb) || jsonb_build_array(uid) END WHERE id = rid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Own read receipt is not editable'; END IF;
    BEGIN
        UPDATE public.drive_reports SET seen_by = COALESCE(seen_by, '[]'::jsonb) || jsonb_build_array('00000000-0000-0000-0000-000000000001') WHERE id = rid;
        RAISE EXCEPTION 'SECURITY TEST FAILED: another user read receipt was editable';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$test$;
RESET ROLE;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.sub', p.id::text, true), set_config('audit.group_id', g.id::text, true)
FROM public.profiles p CROSS JOIN public.groups g
WHERE p.system_role = 'user'
AND EXISTS (SELECT 1 FROM public.samples s WHERE s.group_id = g.id)
AND NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = g.id AND gm.user_id = p.id) LIMIT 1;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE gid uuid := current_setting('audit.group_id')::uuid; uid uuid := auth.uid();
BEGIN
    IF gid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Missing membership fixture'; END IF;
    BEGIN
        INSERT INTO public.group_members(group_id, user_id, role, status) VALUES(gid, uid, 'supervisor', 'pending');
        RAISE EXCEPTION 'SECURITY TEST FAILED: requested manager role was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    INSERT INTO public.group_members(group_id, user_id, role, status) VALUES(gid, uid, 'student', 'pending');
    IF EXISTS (SELECT 1 FROM public.samples WHERE group_id = gid)
       OR EXISTS (SELECT 1 FROM public.drive_reports WHERE group_id = gid)
       OR EXISTS (SELECT 1 FROM public.raman_workspaces WHERE group_id = gid) THEN
        RAISE EXCEPTION 'SECURITY TEST FAILED: pending membership grants content access';
    END IF;
END;
$test$;
RESET ROLE;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM public.profiles WHERE system_role = 'admin' ORDER BY id LIMIT 1), true);
SELECT set_config('audit.user_id', (SELECT id::text FROM public.profiles WHERE system_role = 'user' ORDER BY id LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
    UPDATE public.profiles SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END
    WHERE id = current_setting('audit.user_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Admin profile management is blocked'; END IF;
END;
$test$;
RESET ROLE;
ROLLBACK;

SELECT 'PASS: profile escalation blocked; profile editing allowed; report content protected; own receipts allowed; foreign receipts blocked; pending membership denied; admin management preserved. All data changes rolled back.' AS result;
