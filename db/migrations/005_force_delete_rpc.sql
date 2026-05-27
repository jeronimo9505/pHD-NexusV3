-- Function to safely delete a drive report
-- This function runs with SECURITY DEFINER to bypass RLS checks on the table directly,
-- but implements its own security check (must be admin or group member).

CREATE OR REPLACE FUNCTION delete_drive_report_force(report_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Run as database owner (bypasses RLS)
AS $$
DECLARE
    v_group_id UUID;
    v_user_id UUID;
    v_is_admin BOOLEAN;
    v_is_member BOOLEAN;
BEGIN
    -- 1. Get current user
    v_user_id := auth.uid();
    
    -- 2. Get report info
    SELECT group_id INTO v_group_id
    FROM drive_reports
    WHERE id = report_id;
    
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Report not found';
    END IF;

    -- 3. Check permissions
    -- Check if user is admin/owner in profiles or related tables
    -- For simplicity/speed here, we check if they are a member of the group
    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_group_id AND user_id = v_user_id
    ) INTO v_is_member;

    -- You could also check for system admin role here
    
    IF NOT v_is_member THEN
        RAISE EXCEPTION 'Access denied: You must be a member of the group to delete reports.';
    END IF;

    -- 4. Perform delete
    DELETE FROM drive_reports WHERE id = report_id;
    
    RETURN TRUE;
END;
$$;
