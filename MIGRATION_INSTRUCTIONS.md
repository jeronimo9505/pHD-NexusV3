# 🚨 CRITICAL: Database Migration Instructions

**MUST BE DONE FIRST** - The application will not work correctly until this migration is applied.

---

## Option 1: Supabase Dashboard (Recommended for First Time)

### Steps:

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `pHD-NexusV2`

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy Migration SQL**
   - Open: `db/migrations/003_missing_tables.sql`
   - Copy ALL contents (Ctrl+A, Ctrl+C)

4. **Paste and Run**
   - Paste into SQL Editor
   - Click "Run" button (or press Ctrl+Enter)

5. **Verify Success**
   - You should see: "Success. No rows returned"
   - Check "Table Editor" - you should now see new tables:
     - `drive_reports`
     - `drive_report_comments`
     - `drive_report_task_links`
     - `drive_report_views`
     - `report_views`
     - `announcements`
     - `announcement_comments`
     - `roles`
     - `permissions`
     - `role_permissions`

---

## Option 2: Supabase CLI (Recommended for Future)

### Prerequisites:
```bash
npm install -g supabase
```

### Steps:

1. **Link to your project** (one-time setup)
   ```bash
   cd "c:/Users/Rodrigo/Downloads/Depurado 2"
   supabase link --project-ref <your-project-ref>
   ```

2. **Apply migration**
   ```bash
   supabase db push --file db/migrations/003_missing_tables.sql
   ```

3. **Verify**
   ```bash
   supabase db diff
   # Should show no differences if migration applied successfully
   ```

---

## Verification Checklist

After applying the migration, verify:

- [ ] No errors in SQL Editor
- [ ] New tables visible in Table Editor
- [ ] `groups` table has `drive_settings` column
- [ ] `roles` table has 6 rows (admin, supervisor, researcher, student, labmanager, owner)
- [ ] All RLS policies are active (check in Authentication > Policies)

---

## What This Migration Does

### Tables Added:
1. **drive_reports** - Google Drive-based reports (Docs, PPTs, Meeting Notes)
2. **drive_report_comments** - Comments on drive reports
3. **drive_report_task_links** - Links between drive reports and tasks
4. **drive_report_views** - Track who viewed drive reports
5. **report_views** - Track who viewed standard reports
6. **announcements** - Group-wide announcements
7. **announcement_comments** - Comments on announcements
8. **roles** - RBAC roles (admin, supervisor, etc.)
9. **permissions** - RBAC permissions
10. **role_permissions** - Role-permission mappings

### Columns Added:
- `groups.drive_settings` (JSONB) - Google Drive configuration

### Other:
- Indexes for performance
- Triggers for auto-updating timestamps
- RLS policies (already existed, now they work)

---

## Safety Notes

✅ **Safe to run multiple times** - Uses `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`
✅ **No data loss** - Only adds tables/columns, doesn't modify existing data
✅ **Reversible** - Can drop tables if needed (but shouldn't be necessary)

---

## Troubleshooting

### Error: "relation already exists"
- **Cause**: Table already exists (maybe from previous attempt)
- **Solution**: Ignore - migration uses `IF NOT EXISTS`, so it's safe

### Error: "permission denied"
- **Cause**: Using wrong database role
- **Solution**: Make sure you're using the Supabase Dashboard or have correct permissions

### Error: "syntax error"
- **Cause**: SQL not copied correctly
- **Solution**: Copy entire file again, ensure no characters are missing

---

## Next Steps After Migration

Once migration is applied successfully:

1. ✅ Verify tables exist
2. ✅ Test Drive Reports module (should now work)
3. ✅ Test Announcements (should now work)
4. ✅ Continue with Supabase client consolidation

---

**Need help?** Let me know if you encounter any issues!
