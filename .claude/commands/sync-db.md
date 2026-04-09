Replicate production database content into staging.

## Context
This syncs content tables (channels, programs, schedules, streamers, banners, etc.) from production to staging Supabase databases. User data (users, devices, subscriptions) is NOT touched.

## Steps

### 1. Check prerequisites
- Verify `pg_dump` and `psql` are installed: `which pg_dump psql`
- If not found, tell the user to install: `brew install postgresql`

### 2. Check for connection strings
- Check if `.env.sync` exists in the repo root with `PROD_DATABASE_URL` and `STAGING_DATABASE_URL`.
- If not, ask the user to create it:
  ```
  # .env.sync (gitignored - never commit this)
  PROD_DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
  STAGING_DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
  ```
- The connection strings are in Supabase Dashboard → Settings → Database → Connection string (URI).
- Use the "Transaction pooler" connection string (port 6543).

### 3. Explain what will happen
Tell the user:
- **Will be synced**: channels, programs, schedules, categories, streamers, panelists, banners, config (and junction tables)
- **Will NOT be synced**: users, devices, subscriptions, push tokens
- **Side effect**: Staging subscriptions (program + streamer) will be deleted because they reference content IDs that get replaced. Users are preserved.

### 4. Execute the sync
- Run: `bash scripts/sync-prod-to-staging.sh`
- Show the output (row counts) to the user.

### 5. Report
- Show the verification table with row counts.
- Remind: staging subscriptions were cleared, users are intact.
