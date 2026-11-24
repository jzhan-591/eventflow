# Sync CSV database review tests

Use a fresh local PostgreSQL database named `eventflow_sync_test` with pgcrypto available. The fixture creates its own tables, policies, roles, and test signing key. Run these commands against a disposable local server using its administrator account.

```sh
createdb eventflow_sync_test
psql -X -d eventflow_sync_test -f supabase/review/tests/sync-fixture.sql
```

Before running the main suite, open a local psql session for the lock test and leave this transaction open.

```sql
begin;
update public.participants
set checked_in = not checked_in
where id = '30000000-0000-0000-0000-000000000001';
```

In a second terminal, run the lock assertion.

```sh
psql -X -d eventflow_sync_test -f supabase/review/tests/sync-lock-case.sql
```

Run `rollback;` in the first session, then run the main suite.

```sh
psql -X -d eventflow_sync_test -f supabase/review/tests/sync-cases.sql
```

The main suite uses the authenticated role to reject tampered, cross-user, cross-event, and stale confirmations. It checks rollback when a hidden shift prevents deletion and when the final insert fails after deletes. The last case verifies a 9-to-7 sync, the retained volunteer's UUID, check-in and shift, an unrelated event, and refusal to reuse the receipt.

These fixture policies model the expected access requirements. Independently verify the real policies and grants in the target environment, then use a separate Supabase test project to verify the PostgREST route using actual user JWTs. Keep the application confirmation button disabled during this review.
