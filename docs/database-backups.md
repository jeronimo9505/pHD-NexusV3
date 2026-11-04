# Database backups

The `Daily Database Backup` GitHub Actions workflow runs at 03:17 UTC daily
and can also be started with **Run workflow**. Changes to its configuration on
`main` trigger a backup immediately.

## Contents and verification

Each successful run retains an artifact for 90 days containing:

- `database.dump`: a compressed PostgreSQL custom archive with schema and data
  from all database schemas, including `public`, Auth records, Storage metadata,
  sequences, functions, policies, grants and PostgreSQL large objects.
- `roles.sql`: database roles and memberships, without database login passwords.
- `contents.txt`: the archive inventory.
- `row-counts.json`: record counts read from each table's COPY data in the archive.
- `SHA256SUMS`: checksums of the files above.

The workflow reads the entire archive using `pg_restore`, checks for public
table data and actual public records, and verifies checksums before uploading.
A missing secret, unreadable table, failed dump, missing data or upload failure
fails the run. It never silently substitutes a schema-only dump.

These checks do not replace a full restoration rehearsal. The full database
dump uses a consistent PostgreSQL snapshot. Roles are exported separately.

## Restore preparation

Download the artifact, unpack it and run `sha256sum --check SHA256SUMS`.
Use PostgreSQL 17 tools (or newer compatible tools) to inspect it:

```sh
pg_restore --list database.dump
```

Restore only into a separate, disposable project first, with the matching
Supabase/PostgreSQL extensions and managed schemas. A raw full database archive
includes Supabase-managed objects: blindly importing it into an existing
Supabase project will cause conflicts. Review `roles.sql` and the inventory,
provision required roles/extensions, and plan the managed-schema restore using
Supabase's current restoration guidance. Verify application queries and table
counts in the restored project before considering recovery complete. Never test
restoration against production.

Custom database login passwords are intentionally omitted and must be reset in
the destination. Supabase Vault or other encrypted columns may also need the
original encryption keys; a database dump does not supply those keys.

## What lives outside PostgreSQL

Storage object **file bytes**, Google Drive files, Edge Function source/config,
OAuth credentials and other external service configuration are separate from
the database. Storage tables in this archive contain metadata, not stored files.
Those resources need their own backup if used.

## Scheduling limitation

GitHub can disable scheduled workflows in public repositories after 60 days
without repository activity. In that case, enable this workflow again in
Actions and run it manually. A green historic run is not evidence that the
daily schedule is still active: check the date of the latest successful run.

References:

- https://www.postgresql.org/docs/17/app-pgdump.html
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
